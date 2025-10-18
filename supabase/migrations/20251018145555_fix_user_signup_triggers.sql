/*
  # Fix User Signup Triggers

  ## Problem
  The `initialize_user_invoice_settings` trigger fails during user signup because:
  1. It tries to use `ON CONFLICT DO NOTHING` on invoice_templates table
  2. But there's no unique constraint to detect conflicts
  3. This causes the entire auth.users INSERT to fail with "Database error saving new user"

  ## Solution
  1. Add unique constraint on invoice_templates (user_id, name)
  2. Fix the trigger function to properly handle all edge cases
  3. Ensure all three triggers work together without errors

  ## Changes
  1. Add unique constraint to invoice_templates
  2. Update initialize_user_invoice_settings function with better error handling
*/

-- Add unique constraint to invoice_templates to support ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'invoice_templates_user_id_name_key'
  ) THEN
    ALTER TABLE invoice_templates 
    ADD CONSTRAINT invoice_templates_user_id_name_key 
    UNIQUE (user_id, name);
  END IF;
END $$;

-- Recreate the trigger function with proper error handling
CREATE OR REPLACE FUNCTION public.initialize_user_invoice_settings()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create default invoice numbering settings
  INSERT INTO invoice_numbering_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create default voucher numbering settings for each type
  INSERT INTO voucher_numbering_settings (user_id, voucher_type, prefix)
  VALUES 
    (NEW.id, 'payment', 'PAY-'),
    (NEW.id, 'receipt', 'REC-'),
    (NEW.id, 'journal', 'JRN-'),
    (NEW.id, 'contra', 'CON-')
  ON CONFLICT (user_id, voucher_type) DO NOTHING;

  -- Create default invoice template with unique constraint support
  INSERT INTO invoice_templates (user_id, name, is_default)
  VALUES (NEW.id, 'Default Template', true)
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent user creation
    RAISE WARNING 'Error initializing invoice settings for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists (it should already exist, but this is safe)
DROP TRIGGER IF EXISTS on_auth_user_created_invoice_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_invoice_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_invoice_settings();
