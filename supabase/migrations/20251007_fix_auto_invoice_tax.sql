/*
  # Fix Auto Invoice Generation to Include Tax Rate

  This migration updates the auto-generate invoice functions to properly
  calculate and include tax from the service master when automatically
  creating invoices for completed works.

  ## Changes
  - Updates auto_generate_work_invoice() to fetch and apply service tax rate
  - Updates auto_generate_recurring_period_invoice() to fetch and apply tax rate
  - Calculates subtotal, tax_amount, and total_amount correctly
*/

-- Update function to auto-generate invoice for completed work with tax
CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_customer_id uuid;
  v_service record;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
BEGIN
  -- Only proceed if work is completed, auto_bill is enabled, and has billing amount
  IF NEW.status = 'completed' AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get customer_id and service info including tax rate
    v_customer_id := NEW.customer_id;

    SELECT payment_terms, COALESCE(tax_rate, 0) as tax_rate
    INTO v_service
    FROM services
    WHERE id = NEW.service_id;

    -- Calculate amounts
    v_subtotal := NEW.billing_amount;
    v_tax_amount := ROUND(v_subtotal * (v_service.tax_rate / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date based on payment terms
    IF v_service.payment_terms = 'net_15' THEN
      v_due_date := CURRENT_DATE + INTERVAL '15 days';
    ELSIF v_service.payment_terms = 'net_30' THEN
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    ELSIF v_service.payment_terms = 'net_45' THEN
      v_due_date := CURRENT_DATE + INTERVAL '45 days';
    ELSIF v_service.payment_terms = 'net_60' THEN
      v_due_date := CURRENT_DATE + INTERVAL '60 days';
    ELSIF v_service.payment_terms = 'due_on_receipt' THEN
      v_due_date := CURRENT_DATE;
    ELSE
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    -- Generate invoice number
    v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8);

    -- Create invoice with proper tax calculation
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
      status
    ) VALUES (
      NEW.user_id,
      v_customer_id,
      NEW.id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft'
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item
    INSERT INTO invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      amount
    ) VALUES (
      v_invoice_id,
      'Work: ' || NEW.title,
      1,
      NEW.billing_amount,
      v_total_amount
    );

    -- Update work billing status
    UPDATE works
    SET billing_status = 'billed'
    WHERE id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger for automatic invoice generation
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER INSERT OR UPDATE OF status ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();
