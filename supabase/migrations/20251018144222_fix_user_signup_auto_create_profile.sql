/*
  # Fix User Signup - Auto Create Profile Trigger

  ## Problem
  When users sign up, the manual profile insertion in the application code fails because:
  1. The user is not yet fully authenticated when the profile insert happens
  2. This causes a "Database error saving new user" error during signup
  
  ## Solution
  Create a database trigger that automatically creates a profile record when a new user signs up in auth.users.
  The trigger will:
  1. Extract metadata from user.raw_user_meta_data
  2. Create a profile record with proper defaults
  3. Run with security definer privileges to bypass RLS

  ## Changes Made
  1. **Create handle_new_user function**
     - Extracts full_name, country, mobile_number from user metadata
     - Creates profile record automatically
     - Uses SECURITY DEFINER to bypass RLS policies
     
  2. **Create trigger on auth.users**
     - Fires AFTER INSERT on auth.users
     - Calls handle_new_user function for each new user
     
  ## Security
  - Function runs as SECURITY DEFINER with service role permissions
  - Only creates profile for the new user (no privilege escalation)
  - Extracts data from trusted auth.users metadata only
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_full_name text;
  v_country text;
  v_mobile_number text;
  v_phone_code text;
BEGIN
  -- Extract metadata from the new user
  v_full_name := NEW.raw_user_meta_data->>'full_name';
  v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'IN');
  v_mobile_number := COALESCE(NEW.raw_user_meta_data->>'mobile_number', '');
  
  -- Determine phone code based on country
  CASE v_country
    WHEN 'US' THEN v_phone_code := '+1';
    WHEN 'GB' THEN v_phone_code := '+44';
    WHEN 'CA' THEN v_phone_code := '+1';
    WHEN 'AU' THEN v_phone_code := '+61';
    WHEN 'IN' THEN v_phone_code := '+91';
    WHEN 'AE' THEN v_phone_code := '+971';
    WHEN 'SG' THEN v_phone_code := '+65';
    ELSE v_phone_code := '+91'; -- Default to India
  END CASE;

  -- Insert profile record
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    country,
    phone_country_code,
    mobile_number,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_country,
    v_phone_code,
    v_mobile_number,
    NOW(),
    NOW()
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.profiles TO service_role;