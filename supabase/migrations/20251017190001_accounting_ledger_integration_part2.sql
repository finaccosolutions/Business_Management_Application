/*
  # Accounting and Ledger Integration - Part 2

  ## Summary
  Update auto-invoice trigger to use ledger mapping

  ## Changes
  1. Updated auto-invoice trigger to determine income ledger from service or settings
  2. Auto-populate customer_ledger_id and income_ledger_id in invoices
*/

-- Update auto-invoice trigger with ledger mapping
DROP TRIGGER IF EXISTS auto_create_invoice_on_period_completion ON recurring_periods;

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
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_subtotal numeric;
  v_tax_amount numeric;
  v_total numeric;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.auto_invoice = true THEN

    SELECT * INTO v_work_record FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    SELECT * INTO v_service_record FROM services WHERE id = v_work_record.service_id;
    SELECT * INTO v_customer_record FROM customers WHERE id = v_work_record.customer_id;
    SELECT * INTO v_settings_record FROM company_settings WHERE user_id = v_work_record.user_id LIMIT 1;

    IF v_service_record.income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_service_record.income_ledger_id;
    ELSIF v_settings_record.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_settings_record.default_income_ledger_id;
    END IF;

    v_customer_ledger_id := v_customer_record.ledger_id;
    v_price := COALESCE(v_work_record.billing_amount, v_service_record.default_price, 0);
    v_tax_rate := COALESCE(v_service_record.tax_rate, 0);
    v_subtotal := v_price;
    v_tax_amount := v_subtotal * v_tax_rate / 100;
    v_total := v_subtotal + v_tax_amount;

    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_max_number
    FROM invoices WHERE user_id = v_work_record.user_id;

    v_invoice_number := COALESCE(v_settings_record.invoice_prefix, 'INV-') || LPAD((v_max_number + 1)::text, 5, '0');

    INSERT INTO invoices (
      user_id, customer_id, work_id, invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_ledger_id, customer_ledger_id
    ) VALUES (
      v_work_record.user_id, v_work_record.customer_id, v_work_record.id,
      v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_subtotal, v_tax_amount, v_total, 'pending',
      'Auto-generated for ' || v_service_record.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      v_income_ledger_id, v_customer_ledger_id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, tax_rate)
    VALUES (
      v_invoice_id,
      v_service_record.name || ' (' || NEW.period_start_date || ' to ' || NEW.period_end_date || ')',
      1, v_price, v_price, v_tax_rate
    );

    NEW.invoice_id := v_invoice_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_create_invoice_on_period_completion
  BEFORE UPDATE ON recurring_periods
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();
