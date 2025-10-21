/*
  # Fix Auto-Invoice Trigger - Check auto_bill from Work Instead

  ## Problem
  The function `auto_create_invoice_on_period_completion()` is checking for 
  `NEW.auto_invoice` field on the work_recurring_instances table, but this 
  column doesn't exist. This causes an error when updating task status:
  
  Error: record "v_work_record" has no field "auto_generate_invoice"
  
  ## Root Cause
  The trigger function was referencing a non-existent column `auto_invoice` 
  on the work_recurring_instances table. It should check the `auto_bill` 
  field from the parent work record instead.

  ## Solution
  Update the function to:
  1. First fetch the work record
  2. Check the work's `auto_bill` field instead of period's `auto_invoice`
  3. Only proceed with invoice generation if auto_bill is enabled

  ## Changes
  - Fetch work record first to check auto_bill flag
  - Replace NEW.auto_invoice check with v_work_record.auto_bill
  - Maintain all other functionality intact
*/

-- Drop and recreate the function with correct auto_bill check
DROP FUNCTION IF EXISTS auto_create_invoice_on_period_completion() CASCADE;

CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_record RECORD;
  v_service_record RECORD;
  v_customer_record RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_max_number integer;
  v_settings_record RECORD;
  v_income_account_id uuid;
  v_customer_account_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_subtotal numeric;
  v_tax_amount numeric;
  v_total numeric;
BEGIN
  -- Only proceed if status changed to completed and not already billed
  IF NEW.status = 'completed' AND 
     (OLD IS NULL OR OLD.status != 'completed') AND 
     NEW.is_billed = false THEN

    -- First, get the work record to check auto_bill flag
    SELECT * INTO v_work_record FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Check if auto_bill is enabled on the work
    IF NOT COALESCE(v_work_record.auto_bill, false) THEN
      RETURN NEW;
    END IF;

    -- Get related records
    SELECT * INTO v_service_record FROM services WHERE id = v_work_record.service_id;
    SELECT * INTO v_customer_record FROM customers WHERE id = v_work_record.customer_id;
    SELECT * INTO v_settings_record FROM company_settings WHERE user_id = v_work_record.user_id LIMIT 1;

    -- Determine income account
    IF v_service_record.income_account_id IS NOT NULL THEN
      v_income_account_id := v_service_record.income_account_id;
    ELSIF v_settings_record.default_income_ledger_id IS NOT NULL THEN
      v_income_account_id := v_settings_record.default_income_ledger_id;
    END IF;

    -- Calculate amounts
    v_customer_account_id := v_customer_record.account_id;
    v_price := COALESCE(NEW.billing_amount, v_work_record.billing_amount, v_service_record.default_price, 0);
    
    -- Skip if no price
    IF v_price <= 0 THEN
      RETURN NEW;
    END IF;
    
    v_tax_rate := COALESCE(v_service_record.tax_rate, 0);
    v_subtotal := v_price;
    v_tax_amount := v_subtotal * v_tax_rate / 100;
    v_total := v_subtotal + v_tax_amount;

    -- Generate invoice number
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_max_number
    FROM invoices WHERE user_id = v_work_record.user_id;

    v_invoice_number := COALESCE(v_settings_record.invoice_prefix, 'INV-') || LPAD((v_max_number + 1)::text, 5, '0');

    -- Create invoice
    INSERT INTO invoices (
      user_id, customer_id, work_id, invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id
    ) VALUES (
      v_work_record.user_id, v_work_record.customer_id, v_work_record.id,
      v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_subtotal, v_tax_amount, v_total, 'pending',
      'Auto-generated for ' || v_service_record.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      v_income_account_id, v_customer_account_id
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, tax_rate)
    VALUES (
      v_invoice_id,
      v_service_record.name || ' (' || NEW.period_start_date || ' to ' || NEW.period_end_date || ')',
      1, v_price, v_price, v_tax_rate
    );

    -- Update period instance
    NEW.invoice_id := v_invoice_id;
    NEW.is_billed := true;
    NEW.invoice_generated := true;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger on work_recurring_instances
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_period_complete ON work_recurring_instances;

CREATE TRIGGER trigger_auto_invoice_on_period_complete
  BEFORE UPDATE
  ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();
