/*
  # Auto-create Customer Ledger on Invoice Generation
  
  ## Problem
  When auto-creating invoices after tasks completion, if the customer ledger doesn't exist,
  the Customer Account field remains empty on the invoice form. This leaves the invoice
  without the necessary customer account mapping for accounting records.
  
  ## Solution
  1. Create a helper function `ensure_customer_ledger_exists()` that:
     - Checks if customer has an account_id in chart_of_accounts
     - If not, creates a new ledger account for the customer under Accounts Receivable
     - Returns the account_id (either existing or newly created)
  
  2. Update auto-invoice trigger functions to:
     - Call ensure_customer_ledger_exists() before creating invoice
     - Set the customer_account_id to the returned account_id
     - This ensures invoice always has customer account selected
  
  ## New Tables/Functions
  - `ensure_customer_ledger_exists(p_customer_id uuid, p_user_id uuid)` - Function that creates ledger if missing
  
  ## Changes to Existing Functions
  - `auto_create_invoice_on_recurring_tasks_complete()` - Now creates customer ledger before invoice
  - `auto_create_invoice_on_work_tasks_complete()` - Now creates customer ledger before invoice
  
  ## Security
  - RLS remains unchanged on chart_of_accounts (already secured)
  - Function uses SECURITY DEFINER with proper checks
*/

-- Create function to ensure customer ledger exists and return account_id
CREATE OR REPLACE FUNCTION ensure_customer_ledger_exists(
  p_customer_id uuid,
  p_user_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_account_id uuid;
  v_customer_name text;
  v_accounts_receivable_id uuid;
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

  -- Get the Accounts Receivable parent account (or create if doesn't exist)
  -- First, try to find existing AR account
  SELECT id INTO v_accounts_receivable_id
  FROM chart_of_accounts
  WHERE user_id = p_user_id
  AND account_type = 'asset'
  AND (account_name ILIKE '%Receivable%' OR account_name ILIKE '%Debtors%')
  LIMIT 1;

  -- If no AR account exists, create one
  IF v_accounts_receivable_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      user_id,
      account_code,
      account_name,
      account_type,
      is_active
    )
    VALUES (
      p_user_id,
      '1100',
      'Accounts Receivable',
      'asset',
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
    account_type,
    parent_account_id,
    is_active
  )
  VALUES (
    p_user_id,
    v_next_code,
    v_customer_name,
    'asset',
    v_accounts_receivable_id,
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

-- Update auto_create_invoice_on_recurring_tasks_complete to use ensure_customer_ledger_exists
DROP FUNCTION IF EXISTS auto_create_invoice_on_recurring_tasks_complete() CASCADE;

CREATE OR REPLACE FUNCTION auto_create_invoice_on_recurring_tasks_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_period_id uuid;
  v_instance_record RECORD;
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_all_completed boolean;
  v_task_count integer;
  v_completed_count integer;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Only trigger on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;

  -- Get period details first
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- If invoice already generated, skip
  IF v_instance_record.invoice_generated = true THEN
    RETURN NEW;
  END IF;

  -- Check if ALL tasks for this period are completed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_task_count, v_completed_count
    FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  -- If not all tasks completed, just return
  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Update period status to completed
  UPDATE work_recurring_instances
  SET status = 'completed', updated_at = NOW()
  WHERE id = v_period_id AND status != 'completed';

  -- Get work and service details
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    s.income_account_id as service_income_account_id,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    c.account_id as customer_account_id,
    cs.price as customer_service_price
    INTO v_work_record
    FROM works w
    JOIN services s ON w.service_id = s.id
    JOIN customers c ON w.customer_id = c.id
    LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
    WHERE w.id = v_instance_record.work_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Check auto_bill flag (treat NULL as true)
  IF COALESCE(v_work_record.auto_bill, true) = false THEN
    RETURN NEW;
  END IF;

  -- Get ledger mappings - prioritize service level mapping
  v_income_ledger_id := v_work_record.service_income_account_id;

  IF v_income_ledger_id IS NULL THEN
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
  END IF;

  -- Ensure customer ledger exists and get/create account_id
  v_customer_ledger_id := ensure_customer_ledger_exists(v_work_record.customer_id, v_work_record.user_id);

  -- Calculate price
  v_price := COALESCE(
    v_instance_record.billing_amount,
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );

  IF v_price <= 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate tax
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  IF v_invoice_number IS NULL THEN
    RAISE WARNING 'Failed to generate invoice number for user %', v_work_record.user_id;
    RETURN NEW;
  END IF;

  -- Create invoice
  BEGIN
    INSERT INTO invoices (
      user_id, customer_id, work_id, work_recurring_instance_id,
      invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id
    )
    VALUES (
      v_work_record.user_id, v_work_record.customer_id, v_instance_record.work_id, v_period_id,
      v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_price, v_tax_amount, v_total_amount, 'draft',
      'Auto-generated for ' || v_instance_record.period_name,
      v_income_ledger_id, v_customer_ledger_id
    )
    RETURNING id INTO v_invoice_id;

    -- Add invoice item with service_id
    INSERT INTO invoice_items (
      invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
    )
    VALUES (
      v_invoice_id,
      v_work_record.service_name || ' - ' || v_instance_record.period_name,
      1, v_price, v_price, v_tax_rate, v_work_record.service_id
    );

    -- Mark invoice generation successful
    UPDATE work_recurring_instances
    SET
      invoice_generated = true,
      invoice_id = v_invoice_id,
      is_billed = true,
      billing_amount = v_total_amount,
      updated_at = NOW()
    WHERE id = v_period_id;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice for period %: %', v_period_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update auto_create_invoice_on_work_tasks_complete to use ensure_customer_ledger_exists
DROP FUNCTION IF EXISTS auto_create_invoice_on_work_tasks_complete() CASCADE;

CREATE OR REPLACE FUNCTION auto_create_invoice_on_work_tasks_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_work_id uuid;
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_all_completed boolean;
  v_task_count integer;
  v_completed_count integer;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Only trigger on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_work_id := NEW.work_id;

  -- Get work details first
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    s.income_account_id as service_income_account_id,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    c.account_id as customer_account_id,
    cs.price as customer_service_price
    INTO v_work_record
    FROM works w
    JOIN services s ON w.service_id = s.id
    JOIN customers c ON w.customer_id = c.id
    LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
    WHERE w.id = v_work_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Only for non-recurring works
  IF v_work_record.is_recurring = true THEN
    RETURN NEW;
  END IF;

  -- Check auto_bill flag (treat NULL as true)
  IF COALESCE(v_work_record.auto_bill, true) = false THEN
    RETURN NEW;
  END IF;

  -- Check if already billed
  IF v_work_record.billing_status = 'billed' THEN
    RETURN NEW;
  END IF;

  -- Check if ALL tasks are completed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_task_count, v_completed_count
    FROM work_tasks
    WHERE work_id = v_work_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  -- If not all tasks completed, just return
  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Update work status to completed
  UPDATE works
  SET status = 'completed', updated_at = NOW()
  WHERE id = v_work_id AND status != 'completed';

  -- Get ledger mappings - prioritize service level mapping
  v_income_ledger_id := v_work_record.service_income_account_id;

  IF v_income_ledger_id IS NULL THEN
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
  END IF;

  -- Ensure customer ledger exists and get/create account_id
  v_customer_ledger_id := ensure_customer_ledger_exists(v_work_record.customer_id, v_work_record.user_id);

  -- Calculate price
  v_price := COALESCE(
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );

  IF v_price <= 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate tax
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  IF v_invoice_number IS NULL THEN
    RAISE WARNING 'Failed to generate invoice number for user %', v_work_record.user_id;
    RETURN NEW;
  END IF;

  -- Create invoice
  BEGIN
    INSERT INTO invoices (
      user_id, customer_id, work_id,
      invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id
    )
    VALUES (
      v_work_record.user_id, v_work_record.customer_id, v_work_id,
      v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_price, v_tax_amount, v_total_amount, 'draft',
      'Auto-generated for work: ' || v_work_record.title,
      v_income_ledger_id, v_customer_ledger_id
    )
    RETURNING id INTO v_invoice_id;

    -- Add invoice item with service_id
    INSERT INTO invoice_items (
      invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
    )
    VALUES (
      v_invoice_id,
      v_work_record.service_name || ' - ' || v_work_record.title,
      1, v_price, v_price, v_tax_rate, v_work_record.service_id
    );

    -- Update work billing status
    UPDATE works
    SET billing_status = 'billed', updated_at = NOW()
    WHERE id = v_work_id;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice for work %: %', v_work_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers to ensure they call the updated functions
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_recurring_tasks_complete ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;

CREATE TRIGGER trigger_auto_invoice_on_recurring_tasks_complete
AFTER UPDATE ON recurring_period_tasks
FOR EACH ROW
EXECUTE FUNCTION auto_create_invoice_on_recurring_tasks_complete();

CREATE TRIGGER trigger_auto_invoice_on_work_tasks_complete
AFTER UPDATE ON work_tasks
FOR EACH ROW
EXECUTE FUNCTION auto_create_invoice_on_work_tasks_complete();
