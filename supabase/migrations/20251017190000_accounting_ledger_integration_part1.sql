/*
  # Accounting and Ledger Integration - Part 1

  ## Summary
  Customer-Ledger integration and helper functions

  ## Changes
  1. Function to get/create Account Receivables group
  2. Function to create customer ledger
  3. Trigger to auto-create ledger for new customers
  4. Sync existing customers with ledgers
*/

-- Function to get or create Account Receivables group
CREATE OR REPLACE FUNCTION get_or_create_account_receivables_group(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT id INTO v_group_id
  FROM account_groups
  WHERE user_id = p_user_id
    AND name = 'Account Receivables'
  LIMIT 1;

  IF v_group_id IS NULL THEN
    INSERT INTO account_groups (user_id, name, description, group_type, is_system)
    VALUES (p_user_id, 'Account Receivables', 'Customer accounts receivable', 'asset', true)
    RETURNING id INTO v_group_id;
  END IF;

  RETURN v_group_id;
END;
$$;

-- Function to create customer ledger
CREATE OR REPLACE FUNCTION create_customer_ledger(p_customer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_id uuid;
  v_customer_name text;
  v_user_id uuid;
  v_group_id uuid;
BEGIN
  SELECT name, user_id INTO v_customer_name, v_user_id
  FROM customers
  WHERE id = p_customer_id;

  v_group_id := get_or_create_account_receivables_group(v_user_id);

  INSERT INTO ledgers (user_id, name, account_group_id, opening_balance, current_balance)
  VALUES (v_user_id, v_customer_name, v_group_id, 0, 0)
  RETURNING id INTO v_ledger_id;

  UPDATE customers
  SET ledger_id = v_ledger_id
  WHERE id = p_customer_id;

  RETURN v_ledger_id;
END;
$$;

-- Trigger to auto-create ledger for new customers
DROP TRIGGER IF EXISTS create_customer_ledger_trigger ON customers;

CREATE OR REPLACE FUNCTION trigger_create_customer_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.ledger_id IS NULL THEN
    NEW.ledger_id := create_customer_ledger(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER create_customer_ledger_trigger
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_customer_ledger();

-- Sync existing customers with ledgers
DO $$
DECLARE
  v_customer RECORD;
BEGIN
  FOR v_customer IN
    SELECT id FROM customers WHERE ledger_id IS NULL
  LOOP
    PERFORM create_customer_ledger(v_customer.id);
  END LOOP;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_ledger_id ON customers(ledger_id);
CREATE INDEX IF NOT EXISTS idx_services_income_ledger_id ON services(income_ledger_id);
CREATE INDEX IF NOT EXISTS idx_invoices_income_ledger_id ON invoices(income_ledger_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_ledger_id ON invoices(customer_ledger_id);
