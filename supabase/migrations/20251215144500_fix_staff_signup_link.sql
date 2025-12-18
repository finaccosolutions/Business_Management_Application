-- Improvements to handle_new_user to ensure Staff are correctly linked to Admins
-- Issue: Case sensitivity or whitespace could cause the email match to fail, resulting in staff becoming standalone admins.

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  v_staff_record RECORD;
BEGIN
  -- Check if this email belongs to a Staff Member invite (Case-insensitive & Trimmed)
  SELECT * INTO v_staff_record 
  FROM public.staff_members 
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(new.email)) 
  LIMIT 1;

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

-- Retroactive Fix: Find user profiles that should be staff but are wrongly marked as admin
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.id, p.email, sm.user_id as admin_id, sm.id as staff_record_id
        FROM profiles p
        JOIN staff_members sm ON LOWER(TRIM(p.email)) = LOWER(TRIM(sm.email))
        WHERE p.role = 'admin' 
        AND p.owner_id IS NULL
        AND p.id != sm.user_id -- Ensure we don't accidentally link an Admin to themselves if they added their own email as staff
    LOOP
        RAISE NOTICE 'Fixing wrongfully created Admin profile for email % (should be staff of %)', r.email, r.admin_id;

        -- 1. Convert Profile to Staff
        UPDATE profiles
        SET role = 'staff',
            owner_id = r.admin_id
        WHERE id = r.id;

        -- 2. Link Staff Record
        UPDATE staff_members
        SET auth_user_id = r.id,
            is_active = true
        WHERE id = r.staff_record_id;
        
    END LOOP;
END $$;
