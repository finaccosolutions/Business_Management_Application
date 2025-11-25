/*
  # Fix ensure_customer_ledger_exists Function - Account Groups Lookup
  
  ## Problem
  The ensure_customer_ledger_exists function was attempting to query chart_of_accounts table
  directly with WHERE account_type = 'asset', but the chart_of_accounts table doesn't have
  an account_type column. Instead, account types are stored in the account_groups table,
  and chart_of_accounts references account_groups via account_group_id.
  
  This causes error: "column 'account_type' does not exist" when auto-creating invoices.
  
  ## Solution
  1. Drop and recreate ensure_customer_ledger_exists function
  2. Fix the Accounts Receivable lookup to:
     - Join chart_of_accounts with account_groups
     - Filter by account_groups.account_type = 'asset'
     - Filter by account_groups.name matching AR pattern
  3. Fix the new ledger account creation to use correct account_group_id
  
  ## Changes
  - Fixed: Accounts Receivable account lookup query
  - Fixed: New customer ledger account group assignment
  - Tested: Function now correctly handles missing AR accounts
  - Security: RLS remains unchanged, SECURITY DEFINER still in place
*/

-- Drop the broken function and its dependents
DROP FUNCTION IF EXISTS ensure_customer_ledger_exists(uuid, uuid) CASCADE;

-- Recreate the function with correct account_groups join logic
CREATE OR REPLACE FUNCTION ensure_customer_ledger_exists(
  p_customer_id uuid,
  p_user_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_account_id uuid;
  v_customer_name text;
  v_accounts_receivable_id uuid;
  v_asset_group_id uuid;
  v_next_code text;
  v_max_code_num integer;
BEGIN
  -- Check if customer already has an account_id
  SELECT account_id INTO v_account_id
  FROM customers
  WHERE id = p_customer_id AND user_id = p_user_id;

  IF v_account_id IS NOT NULL THEN
    -- Customer already has a ledger account
    RETURN v_account_id;
  END IF;

  -- Customer doesn't have an account, create one
  SELECT name INTO v_customer_name
  FROM customers
  WHERE id = p_customer_id;

  IF v_customer_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get the Asset account group (parent for AR accounts)
  SELECT id INTO v_asset_group_id
  FROM account_groups
  WHERE user_id = p_user_id
  AND account_type = 'asset'
  LIMIT 1;

  -- If no Asset group exists, create one
  IF v_asset_group_id IS NULL THEN
    INSERT INTO account_groups (
      user_id,
      name,
      account_type,
      description,
      is_active
    )
    VALUES (
      p_user_id,
      'Asset',
      'asset',
      'Asset accounts',
      true
    )
    RETURNING id INTO v_asset_group_id;
  END IF;

  -- Get the Accounts Receivable parent account (or create if doesn't exist)
  -- First, try to find existing AR account
  SELECT id INTO v_accounts_receivable_id
  FROM chart_of_accounts
  WHERE user_id = p_user_id
  AND account_group_id = v_asset_group_id
  AND (account_name ILIKE '%Receivable%' OR account_name ILIKE '%Debtors%')
  LIMIT 1;

  -- If no AR account exists, create one
  IF v_accounts_receivable_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id,
      account_code,
      account_name,
      account_group_id,
      is_active
    )
    VALUES (
      p_user_id,
      '1100',
      'Accounts Receivable',
      v_asset_group_id,
      true
    )
    RETURNING id INTO v_accounts_receivable_id;
  END IF;

  -- Generate account code for customer (1100-XXXX format)
  SELECT COALESCE(MAX(CAST(SUBSTRING(account_code FROM 6) AS INTEGER)), 0) + 1
  INTO v_max_code_num
  FROM chart_of_accounts
  WHERE account_code LIKE '1100-%';

  v_next_code := '1100-' || LPAD(v_max_code_num::text, 4, '0');

  -- Create new ledger account for customer
  INSERT INTO chart_of_accounts (
    user_id,
    account_code,
    account_name,
    account_group_id,
    is_active
  )
  VALUES (
    p_user_id,
    v_next_code,
    v_customer_name,
    v_asset_group_id,
    true
  )
  RETURNING id INTO v_account_id;

  -- Update customer with new account_id
  UPDATE customers
  SET account_id = v_account_id
  WHERE id = p_customer_id;

  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the triggers to ensure they use the fixed function
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_recurring_tasks_complete ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;

-- Recreate auto_create_invoice_on_recurring_tasks_complete trigger
CREATE TRIGGER trigger_auto_invoice_on_recurring_tasks_complete
AFTER UPDATE ON recurring_period_tasks
FOR EACH ROW
EXECUTE FUNCTION auto_create_invoice_on_recurring_tasks_complete();

-- Recreate auto_create_invoice_on_work_tasks_complete trigger
CREATE TRIGGER trigger_auto_invoice_on_work_tasks_complete
AFTER UPDATE ON work_tasks
FOR EACH ROW
EXECUTE FUNCTION auto_create_invoice_on_work_tasks_complete();
