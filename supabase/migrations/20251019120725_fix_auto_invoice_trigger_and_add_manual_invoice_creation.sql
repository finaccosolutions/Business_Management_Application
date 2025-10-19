/*
  # Fix Auto-Invoice Trigger and Add Manual Invoice Creation

  ## Issue
  The auto-invoice trigger only fires when status CHANGES to 'completed'.
  If the work is already 'completed' and user updates it again, no invoice is created.

  ## Solution
  1. Fix the trigger to also check billing_status (not_billed -> billed transition)
  2. Add a helper function to manually create invoice for any completed work
  3. Ensure trigger works for both status change AND billing_status change

  ## Changes
  - Update auto_generate_work_invoice() to be more flexible
  - Add create_invoice_for_work() helper function for manual creation
*/

-- ============================================================================
-- 1. Enhanced Auto-Invoice Function
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_service RECORD;
  v_customer RECORD;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_should_create_invoice boolean := false;
BEGIN
  -- Determine if we should create an invoice
  -- Case 1: Status just changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    v_should_create_invoice := true;
    RAISE NOTICE 'Invoice trigger: Status changed to completed';
  END IF;

  -- Case 2: Work is completed and billing_status changed from not_billed
  IF NEW.status = 'completed' AND 
     NEW.billing_status = 'not_billed' AND
     (OLD.billing_status IS NULL OR OLD.billing_status = 'not_billed') THEN
    v_should_create_invoice := true;
    RAISE NOTICE 'Invoice trigger: Work is completed and billing_status is not_billed';
  END IF;

  -- Only proceed if we should create invoice AND all conditions are met
  IF v_should_create_invoice AND
     NEW.auto_bill = true AND
     NEW.is_recurring = false AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 THEN

    -- Check for existing invoice
    IF EXISTS (SELECT 1 FROM invoices WHERE notes LIKE '%Auto-generated invoice for work: ' || NEW.title || '%' AND customer_id = NEW.customer_id) THEN
      RAISE NOTICE 'Invoice already exists for work %, skipping', NEW.title;
      RETURN NEW;
    END IF;

    RAISE NOTICE 'Creating invoice for work: %', NEW.title;

    -- Get service details
    SELECT * INTO v_service
    FROM services
    WHERE id = NEW.service_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Calculate amounts
    v_subtotal := NEW.billing_amount;
    v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date
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
    v_invoice_number := generate_invoice_number_from_config(NEW.user_id);

    RAISE NOTICE 'Creating invoice with number: %', v_invoice_number;

    -- Create invoice WITHOUT work_id and WITHOUT ledger accounts
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
      notes,
      income_account_id,
      customer_account_id
    ) VALUES (
      NEW.user_id,
      NEW.customer_id,
      NULL,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for work: ' || NEW.title,
      NULL,
      NULL
    )
    RETURNING id INTO v_invoice_id;

    -- Create invoice line item
    INSERT INTO invoice_items (
      invoice_id,
      service_id,
      description,
      quantity,
      unit_price,
      amount,
      tax_rate
    ) VALUES (
      v_invoice_id,
      v_service.id,
      'Work: ' || NEW.title,
      1,
      v_subtotal,
      v_subtotal,
      COALESCE(v_service.tax_rate, 0)
    );

    -- Update work billing status
    UPDATE works
    SET billing_status = 'billed'
    WHERE id = NEW.id;

    RAISE NOTICE 'Successfully created invoice % for work %', v_invoice_number, NEW.title;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Manual Invoice Creation Helper Function
-- ============================================================================

CREATE OR REPLACE FUNCTION create_invoice_for_completed_work(p_work_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_service RECORD;
  v_customer RECORD;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work not found: %', p_work_id;
  END IF;

  -- Validate work is eligible for invoice
  IF v_work.status != 'completed' THEN
    RAISE EXCEPTION 'Work must be completed to create invoice';
  END IF;

  IF v_work.is_recurring = true THEN
    RAISE EXCEPTION 'Cannot manually create invoice for recurring work';
  END IF;

  IF v_work.billing_amount IS NULL OR v_work.billing_amount <= 0 THEN
    RAISE EXCEPTION 'Work must have a valid billing amount';
  END IF;

  -- Check for existing invoice
  IF EXISTS (SELECT 1 FROM invoices WHERE notes LIKE '%Auto-generated invoice for work: ' || v_work.title || '%' AND customer_id = v_work.customer_id) THEN
    RAISE EXCEPTION 'Invoice already exists for this work';
  END IF;

  -- Get service details
  SELECT * INTO v_service
  FROM services
  WHERE id = v_work.service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found for work';
  END IF;

  -- Get customer details
  SELECT * INTO v_customer
  FROM customers
  WHERE id = v_work.customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found for work';
  END IF;

  -- Calculate amounts
  v_subtotal := v_work.billing_amount;
  v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
  v_total_amount := v_subtotal + v_tax_amount;

  -- Calculate due date
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
  v_invoice_number := generate_invoice_number_from_config(v_work.user_id);

  -- Create invoice
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
    notes,
    income_account_id,
    customer_account_id
  ) VALUES (
    v_work.user_id,
    v_work.customer_id,
    NULL,
    v_invoice_number,
    CURRENT_DATE,
    v_due_date,
    v_subtotal,
    v_tax_amount,
    v_total_amount,
    'draft',
    'Auto-generated invoice for work: ' || v_work.title,
    NULL,
    NULL
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice line item
  INSERT INTO invoice_items (
    invoice_id,
    service_id,
    description,
    quantity,
    unit_price,
    amount,
    tax_rate
  ) VALUES (
    v_invoice_id,
    v_service.id,
    'Work: ' || v_work.title,
    1,
    v_subtotal,
    v_subtotal,
    COALESCE(v_service.tax_rate, 0)
  );

  -- Update work billing status
  UPDATE works
  SET billing_status = 'billed'
  WHERE id = p_work_id;

  RETURN v_invoice_id;
END;
$$;

COMMENT ON FUNCTION create_invoice_for_completed_work IS 
  'Manually creates an invoice for a completed non-recurring work. Returns invoice_id.';

-- ============================================================================
-- 3. Recreate Trigger
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'Auto-creates invoice when work status changes to completed or when completed work is updated';
