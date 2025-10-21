/*
  # Update Default Account Groups Structure

  1. Changes
    - Update default account groups to match business requirements
    - Assets: Current Assets (with Cash in Hand, Bank Account, Accounts Receivable), Fixed Assets
    - Liabilities: Current Liabilities (with Accounts Payable, Tax Liabilities), Non-Current Liabilities
    - Income: Direct Income, Indirect Income
    - Expenses: Direct Expenses, Indirect Expenses
    - This structure helps identify gross profit for P&L

  2. Notes
    - This migration updates the default group creation function
    - Existing groups are not modified
*/

-- Update function to create default account groups with new structure
CREATE OR REPLACE FUNCTION create_default_account_groups()
RETURNS TRIGGER AS $$
DECLARE
  v_current_assets_id UUID;
  v_current_liabilities_id UUID;
BEGIN
  -- Check if user already has groups
  IF NOT EXISTS (
    SELECT 1 FROM account_groups WHERE user_id = NEW.id
  ) THEN
    -- Insert Assets groups
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Current Assets', 'asset', 'Assets that can be converted to cash within one year', 1, true, NULL)
    RETURNING id INTO v_current_assets_id;

    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Cash in Hand', 'asset', 'Physical cash available', 2, true, v_current_assets_id),
      (NEW.id, 'Bank Account', 'asset', 'Bank account balances', 3, true, v_current_assets_id),
      (NEW.id, 'Accounts Receivable', 'asset', 'Money owed by clients for services rendered', 4, true, v_current_assets_id);

    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Fixed Assets', 'asset', 'Long-term tangible assets like equipment and furniture', 5, true, NULL);

    -- Insert Liabilities groups
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Current Liabilities', 'liability', 'Obligations due within one year', 6, true, NULL)
    RETURNING id INTO v_current_liabilities_id;

    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Accounts Payable', 'liability', 'Money owed to vendors and suppliers', 7, true, v_current_liabilities_id),
      (NEW.id, 'Tax Liabilities', 'liability', 'Taxes payable to government', 8, true, v_current_liabilities_id);

    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Non-Current Liabilities', 'liability', 'Long-term obligations due after one year', 9, true, NULL);

    -- Insert Income groups
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Direct Income', 'income', 'Revenue directly from core business operations', 10, true, NULL),
      (NEW.id, 'Indirect Income', 'income', 'Revenue from non-core activities and other sources', 11, true, NULL);

    -- Insert Expenses groups
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Direct Expenses', 'expense', 'Expenses directly related to service delivery', 12, true, NULL),
      (NEW.id, 'Indirect Expenses', 'expense', 'Operating expenses not directly tied to service delivery', 13, true, NULL);

    -- Insert Equity groups
    INSERT INTO account_groups (user_id, name, account_type, description, display_order, is_active, parent_group_id)
    VALUES
      (NEW.id, 'Capital', 'equity', 'Owner''s capital and investments', 14, true, NULL),
      (NEW.id, 'Retained Earnings', 'equity', 'Accumulated profits retained in the business', 15, true, NULL);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to use updated function
DROP TRIGGER IF EXISTS create_default_groups_on_signup ON auth.users;
CREATE TRIGGER create_default_groups_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_account_groups();
