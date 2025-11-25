/*
  # Fix Auto-Invoice Generation Functions

  ## Overview
  Fixes the auto-invoice generation functions to use the correct
  generate_next_invoice_number function which returns text directly
  instead of a RECORD.

  ## Changes
  - Drop and recreate auto_generate_invoice_for_completed_work function
  - Drop and recreate auto_generate_invoice_for_completed_period function
  - Update to use generate_next_invoice_number(uuid) which returns text
  - Ensure proper error handling and NULL checks
*/

DROP FUNCTION IF EXISTS auto_generate_invoice_for_completed_work(uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_invoice_for_completed_period(uuid) CASCADE;
DROP FUNCTION IF EXISTS trigger_auto_generate_invoice_on_period_complete() CASCADE;
DROP TRIGGER IF EXISTS trigger_auto_generate_invoice_on_period_complete ON work_recurring_instances;

CREATE OR REPLACE FUNCTION auto_generate_invoice_for_completed_work(p_work_id uuid)
RETURNS uuid AS $$
DECLARE
  v_work RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
BEGIN
  SELECT * INTO v_work FROM works
  WHERE id = p_work_id AND is_recurring = FALSE;

  IF v_work IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = p_work_id AND status != 'cancelled'
  ) THEN
    RETURN NULL;
  END IF;

  v_invoice_number := generate_next_invoice_number(v_work.user_id);

  INSERT INTO invoices (
    user_id,
    customer_id,
    work_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total_amount,
    status,
    notes
  ) VALUES (
    v_work.user_id,
    v_work.customer_id,
    p_work_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    COALESCE(v_work.billing_amount, 0),
    COALESCE(v_work.billing_amount, 0) * 0.18,
    COALESCE(v_work.billing_amount, 0) * 1.18,
    'draft',
    'Auto-generated invoice for completed work: ' || v_work.title
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_generate_invoice_for_completed_period(p_period_id uuid)
RETURNS uuid AS $$
DECLARE
  v_period RECORD;
  v_work RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
BEGIN
  SELECT * INTO v_period FROM work_recurring_instances
  WHERE id = p_period_id AND status = 'completed' AND is_billed = FALSE;

  IF v_period IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_work FROM works WHERE id = v_period.work_id;

  IF v_work IS NULL THEN
    RETURN NULL;
  END IF;

  v_invoice_number := generate_next_invoice_number(v_work.user_id);

  INSERT INTO invoices (
    user_id,
    customer_id,
    work_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total_amount,
    status,
    notes
  ) VALUES (
    v_work.user_id,
    v_work.customer_id,
    v_work.id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    COALESCE(v_period.billing_amount, 0),
    COALESCE(v_period.billing_amount, 0) * 0.18,
    COALESCE(v_period.billing_amount, 0) * 1.18,
    'draft',
    'Auto-generated invoice for period: ' || v_period.period_name
  )
  RETURNING id INTO v_invoice_id;

  UPDATE work_recurring_instances
  SET is_billed = TRUE, updated_at = NOW()
  WHERE id = p_period_id;

  RETURN v_invoice_id;
END
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_auto_generate_invoice_on_period_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed')
     AND NEW.is_billed = FALSE THEN
    PERFORM auto_generate_invoice_for_completed_period(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_generate_invoice_on_period_complete
AFTER UPDATE ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_invoice_on_period_complete();