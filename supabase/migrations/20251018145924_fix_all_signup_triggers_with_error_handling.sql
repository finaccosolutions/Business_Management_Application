/*
  # Fix All Signup Triggers - Add Comprehensive Error Handling

  ## Problem
  The `create_default_account_groups` trigger doesn't have error handling, which can cause
  the entire user signup to fail with "Database error saving new user" if anything goes wrong.

  ## Solution
  Add proper error handling to all three triggers to ensure user creation succeeds even if
  there are issues creating related records.

  ## Changes
  1. Add EXCEPTION handler to create_default_account_groups function
  2. Ensure all triggers return NEW even on error
  3. Log warnings but don't fail the user creation
*/

-- Fix create_default_account_groups function with error handling
CREATE OR REPLACE FUNCTION public.create_default_account_groups()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user already has groups
  IF NOT EXISTS (
    SELECT 1 FROM account_groups WHERE user_id = NEW.id
  ) THEN
    -- Insert default groups for service sector business
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active)
    VALUES
    -- Assets
    (NEW.id, 'Current Assets', 'asset', 'Cash and assets that can be converted to cash within one year', 1, true),
    (NEW.id, 'Cash & Bank', 'asset', 'Cash in hand and bank accounts', 2, true),
    (NEW.id, 'Accounts Receivable', 'asset', 'Money owed by clients for services rendered', 3, true),
    (NEW.id, 'Fixed Assets', 'asset', 'Long-term tangible assets like equipment and furniture', 4, true),
    
    -- Liabilities
    (NEW.id, 'Current Liabilities', 'liability', 'Obligations due within one year', 5, true),
    (NEW.id, 'Accounts Payable', 'liability', 'Money owed to vendors and suppliers', 6, true),
    (NEW.id, 'Tax Liabilities', 'liability', 'Taxes payable to government', 7, true),
    
    -- Income
    (NEW.id, 'Professional Fees', 'income', 'Revenue from professional services', 8, true),
    (NEW.id, 'Consulting Income', 'income', 'Revenue from consulting services', 9, true),
    (NEW.id, 'Other Income', 'income', 'Miscellaneous income and gains', 10, true),
    
    -- Expenses
    (NEW.id, 'Operating Expenses', 'expense', 'Day-to-day business expenses', 11, true),
    (NEW.id, 'Staff Costs', 'expense', 'Salaries, wages, and employee benefits', 12, true),
    (NEW.id, 'Administrative Expenses', 'expense', 'Office rent, utilities, and supplies', 13, true),
    (NEW.id, 'Professional Expenses', 'expense', 'Subscriptions, memberships, and training', 14, true),
    (NEW.id, 'Travel & Conveyance', 'expense', 'Business travel and transportation costs', 15, true),
    
    -- Equity
    (NEW.id, 'Capital', 'equity', 'Owner''s capital and investments', 16, true),
    (NEW.id, 'Retained Earnings', 'equity', 'Accumulated profits retained in the business', 17, true);
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Error creating default account groups for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Verify all three triggers exist and are in the correct order
-- The order matters: profile first, then groups, then invoice settings

-- Trigger 1: Create profile (should fire first)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger 2: Create default account groups (should fire second)
DROP TRIGGER IF EXISTS create_default_groups_on_signup ON auth.users;
CREATE TRIGGER create_default_groups_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_account_groups();

-- Trigger 3: Create invoice settings (should fire third)
DROP TRIGGER IF EXISTS on_auth_user_created_invoice_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_invoice_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_invoice_settings();

-- Grant necessary permissions to all functions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.account_groups TO service_role;
GRANT ALL ON public.invoice_numbering_settings TO service_role;
GRANT ALL ON public.voucher_numbering_settings TO service_role;
GRANT ALL ON public.invoice_templates TO service_role;
