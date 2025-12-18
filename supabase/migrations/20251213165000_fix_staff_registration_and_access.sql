-- 1. Enhance Profiles Table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin',
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id);

-- 2. Update Registration Trigger (Handle New User)
-- This function runs automatically when a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  v_staff_record RECORD;
BEGIN
  -- Check if this email belongs to a Staff Member invite
  SELECT * INTO v_staff_record FROM public.staff_members WHERE email = new.email LIMIT 1;

  IF v_staff_record IS NOT NULL THEN
    -- It IS a staff member. Link them to the Admin (Owner).
    INSERT INTO public.profiles (id, email, full_name, role, owner_id)
    VALUES (
      new.id, 
      new.email, 
      new.raw_user_meta_data->>'full_name', 
      'staff', 
      v_staff_record.user_id -- The Admin's ID
    );
    
    -- Also update the staff_members table to link the Auth ID
    UPDATE public.staff_members 
    SET auth_user_id = new.id,
        is_active = true
    WHERE id = v_staff_record.id;
    
  ELSE
    -- Normal Admin Registration
    INSERT INTO public.profiles (id, email, full_name, role, owner_id)
    VALUES (
      new.id, 
      new.email, 
      new.raw_user_meta_data->>'full_name', 
      'admin', 
      NULL
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix Existing Data (Retroactive Link)
-- If any staff registered before this fix, let's link them now.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM staff_members WHERE auth_user_id IS NULL LOOP
        -- Check if a user exists with this email
        UPDATE profiles
        SET role = 'staff',
            owner_id = r.user_id
        WHERE email = r.email 
        AND owner_id IS NULL -- Only if not already linked (or is currently an 'orphan' admin)
        AND id != r.user_id; -- Ensure we don't link the Admin to themselves if emails match oddly
        
        -- If we updated a profile, we should link the auth_id back to staff_members
        UPDATE staff_members
        SET auth_user_id = (SELECT id FROM profiles WHERE email = r.email LIMIT 1)
        WHERE id = r.id AND auth_user_id IS NULL;
    END LOOP;
END $$;

-- 4. Unified RLS Policies (The "View My Admin's Data" Rule)
-- We'll drop old complicated policies and use the Profile Link.
-- This applies to: Works, Customers, Leads, Invoices, Services.

-- Helper function to get the current viewer's effectively "viewable" user_id (Themselves or their Boss)
-- Actually, easier to just check policies directly.

-- WORKS
DROP POLICY IF EXISTS "Users and Staff can view works" ON works;
DROP POLICY IF EXISTS "Users can view their own works" ON works;
CREATE POLICY "Unified Access to Works" ON works
    FOR SELECT
    USING (
        -- I am the owner
        auth.uid() = user_id
        OR
        -- I am staff of the owner (check my profile)
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND owner_id = works.user_id
        )
    );

-- CUSTOMERS
DROP POLICY IF EXISTS "Users and Staff can view customers" ON customers;
DROP POLICY IF EXISTS "Users can view their own customers" ON customers;
CREATE POLICY "Unified Access to Customers" ON customers
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND owner_id = customers.user_id
        )
    );

-- LEADS
DROP POLICY IF EXISTS "Users and Staff can view leads" ON leads;
DROP POLICY IF EXISTS "Users can view their own leads" ON leads;
CREATE POLICY "Unified Access to Leads" ON leads
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND owner_id = leads.user_id
        )
    );

-- STAFF MEMBERS (Staff can see their collleagues? Usually yes in a team)
DROP POLICY IF EXISTS "Users and Staff can view staff profiles" ON staff_members;
DROP POLICY IF EXISTS "Users can view their own staff" ON staff_members;
CREATE POLICY "Unified Access to Staff List" ON staff_members
    FOR SELECT
    USING (
        -- Owner seeing their employees
        auth.uid() = user_id
        OR
        -- Staff seeing the list (belonging to same owner)
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND owner_id = staff_members.user_id
        )
    );

-- INVOICES
DROP POLICY IF EXISTS "Users can view their own invoices" ON invoices;
CREATE POLICY "Unified Access to Invoices" ON invoices
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND owner_id = invoices.user_id
        )
    );
