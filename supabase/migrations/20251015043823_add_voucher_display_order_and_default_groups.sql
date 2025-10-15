/*
  # Add Display Order to Voucher Types and Default Account Groups

  1. Changes
    - Add `display_order` column to voucher_types table
    - Create trigger to auto-create default account groups for service sector when user signs up
    - Insert default account groups suitable for service businesses (audit firms, consultancies, etc.)

  2. Default Groups for Service Sector
    - Assets: Current Assets, Fixed Assets, Cash & Bank
    - Liabilities: Current Liabilities, Long-term Liabilities
    - Income: Professional Fees, Consulting Income, Other Income
    - Expenses: Operating Expenses, Staff Costs, Administrative Expenses
    - Equity: Capital, Retained Earnings
*/

-- Add display_order column to voucher_types if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voucher_types' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE voucher_types ADD COLUMN display_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- Function to create default account groups for new users
CREATE OR REPLACE FUNCTION create_default_account_groups()
RETURNS TRIGGER AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create default groups on user creation
DROP TRIGGER IF EXISTS create_default_groups_on_signup ON auth.users;
CREATE TRIGGER create_default_groups_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_account_groups();

-- Create default groups for existing users who don't have any
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN
    SELECT DISTINCT u.id
    FROM auth.users u
    LEFT JOIN account_groups ag ON ag.user_id = u.id
    WHERE ag.id IS NULL
  LOOP
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active)
    VALUES
      -- Assets
      (user_record.id, 'Current Assets', 'asset', 'Cash and assets that can be converted to cash within one year', 1, true),
      (user_record.id, 'Cash & Bank', 'asset', 'Cash in hand and bank accounts', 2, true),
      (user_record.id, 'Accounts Receivable', 'asset', 'Money owed by clients for services rendered', 3, true),
      (user_record.id, 'Fixed Assets', 'asset', 'Long-term tangible assets like equipment and furniture', 4, true),

      -- Liabilities
      (user_record.id, 'Current Liabilities', 'liability', 'Obligations due within one year', 5, true),
      (user_record.id, 'Accounts Payable', 'liability', 'Money owed to vendors and suppliers', 6, true),
      (user_record.id, 'Tax Liabilities', 'liability', 'Taxes payable to government', 7, true),

      -- Income
      (user_record.id, 'Professional Fees', 'income', 'Revenue from professional services', 8, true),
      (user_record.id, 'Consulting Income', 'income', 'Revenue from consulting services', 9, true),
      (user_record.id, 'Other Income', 'income', 'Miscellaneous income and gains', 10, true),

      -- Expenses
      (user_record.id, 'Operating Expenses', 'expense', 'Day-to-day business expenses', 11, true),
      (user_record.id, 'Staff Costs', 'expense', 'Salaries, wages, and employee benefits', 12, true),
      (user_record.id, 'Administrative Expenses', 'expense', 'Office rent, utilities, and supplies', 13, true),
      (user_record.id, 'Professional Expenses', 'expense', 'Subscriptions, memberships, and training', 14, true),
      (user_record.id, 'Travel & Conveyance', 'expense', 'Business travel and transportation costs', 15, true),

      -- Equity
      (user_record.id, 'Capital', 'equity', 'Owner''s capital and investments', 16, true),
      (user_record.id, 'Retained Earnings', 'equity', 'Accumulated profits retained in the business', 17, true);
  END LOOP;
END $$;
