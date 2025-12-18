-- Comprehensive Fix for Staff Signup Linkage
-- This script replaces the handle_new_user trigger with additional logging and robustness checks.
-- It also performs a retroactive cleanup.

-- 1. Redefine the Trigger Function with LOGGING
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
DECLARE
  v_staff_record RECORD;
BEGIN
  -- Log the attempt for debugging in Supabase Dashboard -> Database -> Postgres Logs
  RAISE LOG 'handle_new_user triggered for email: %', new.email;

  -- Check if this email belongs to a Staff Member invite (Case-insensitive & Trimmed)
  SELECT * INTO v_staff_record 
  FROM public.staff_members 
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(new.email)) 
  LIMIT 1;

  IF v_staff_record IS NOT NULL THEN
    RAISE LOG 'Match found!. Linking to Admin ID: %', v_staff_record.user_id;

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
    RAISE LOG 'No match found in staff_members. Creating as new Admin.';

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
EXCEPTION WHEN OTHERS THEN
  -- Log errors if any
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  -- Fallback to allow signup even if profile creation fails? 
  -- Creating a basic profile to prevent total lockout
  INSERT INTO public.profiles (id, email, full_name, role, owner_id)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'admin', NULL)
    ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Retroactive Fix for existing Mismatches
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
        AND p.id != sm.user_id -- Ensure we don't accidentally link an Admin to themselves
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
