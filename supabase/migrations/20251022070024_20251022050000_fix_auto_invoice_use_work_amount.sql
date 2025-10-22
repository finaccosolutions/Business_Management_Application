/*
  # Fix Auto-Invoice to Use Work Amount, Not Service Amount

  ## Problem

  When creating a work with billing_amount = 1000 but service has default_price = 1500,
  the auto-invoice was showing 1500 instead of 1000.

  The issue is in the COALESCE order - it was prioritizing customer_services.price
  and service.default_price OVER work.billing_amount.

  ## Solution

  Change the priority order to:
  1. work.billing_amount (amount set when creating the work) - HIGHEST PRIORITY
  2. customer_services.price (custom price for customer)
  3. service.default_price (default service price)
  4. 0 (fallback)

  ## Changes Made

  1. Update `auto_create_invoice_on_work_tasks_complete()` function
  2. Update `auto_create_invoice_on_recurring_tasks_complete()` function
  3. Both functions now prioritize work.billing_amount FIRST
*/

-- ============================================================================
-- STEP 1: Fix Non-Recurring Work Invoice Function
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_invoice_on_work_tasks_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' OR NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_work_id := NEW.work_id;

  -- Count tasks
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM work_tasks
  WHERE work_id = v_work_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get work details
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
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

  -- Only for non-recurring
  IF v_work_record.is_recurring = true THEN
    RETURN NEW;
  END IF;

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- FIXED: Check billing_status instead of invoice existence
  -- This allows invoice to be re-created if deleted
  IF v_work_record.billing_status = 'billed' THEN
    RAISE NOTICE 'Work % already billed, skipping invoice creation', v_work_id;
    RETURN NEW;
  END IF;

  -- CRITICAL FIX: Prioritize work.billing_amount FIRST!
  -- Priority order:
  -- 1. work.billing_amount (amount set when creating the work)
  -- 2. customer_services.price (custom price for this customer)
  -- 3. service.default_price (default service price)
  -- 4. 0 (fallback)
  v_price := COALESCE(
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );

  IF v_price <= 0 THEN
    RAISE NOTICE 'No valid price found for work %, skipping invoice', v_work_id;
    RETURN NEW;
  END IF;

  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating invoice for work: % (Price: %, Tax Rate: %, Tax: %, Total: %)',
    v_work_record.title, v_price, v_tax_rate, v_tax_amount, v_total_amount;

  -- Create invoice
  INSERT INTO invoices (
    user_id, customer_id, work_id,
    invoice_number, invoice_date, due_date,
    subtotal, tax_amount, total_amount, status, notes
  )
  VALUES (
    v_work_record.user_id, v_work_record.customer_id, v_work_id,
    v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    v_price, v_tax_amount, v_total_amount, 'draft',
    'Auto-generated for work: ' || v_work_record.title
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item
  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_work_record.title,
    1, v_price, v_price, v_tax_rate, v_work_record.service_id
  );

  -- Update work billing_status
  UPDATE works
  SET billing_status = 'billed', updated_at = NOW()
  WHERE id = v_work_id;

  RAISE NOTICE '✓ Created invoice % for work % with amount %', v_invoice_number, v_work_record.title, v_total_amount;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 2: Fix Recurring Work Invoice Function
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_invoice_on_recurring_tasks_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' OR NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;

  -- Count tasks
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- FIXED: Check invoice_generated flag instead of invoice existence
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE 'Invoice already generated for period %', v_period_id;
    RETURN NEW;
  END IF;

  -- Get work details
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
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

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- CRITICAL FIX: Prioritize work.billing_amount FIRST!
  -- Priority order for recurring work:
  -- 1. period.billing_amount (if set for this specific period)
  -- 2. work.billing_amount (amount set when creating the work)
  -- 3. customer_services.price (custom price for this customer)
  -- 4. service.default_price (default service price)
  -- 5. 0 (fallback)
  v_price := COALESCE(
    v_instance_record.billing_amount,
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );

  IF v_price <= 0 THEN
    RAISE NOTICE 'No valid price found for period %, skipping invoice', v_period_id;
    RETURN NEW;
  END IF;

  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating invoice for recurring period: % (Price: %, Tax Rate: %, Tax: %, Total: %)',
    v_instance_record.period_name, v_price, v_tax_rate, v_tax_amount, v_total_amount;

  -- Create invoice
  INSERT INTO invoices (
    user_id, customer_id, work_id, work_recurring_instance_id,
    invoice_number, invoice_date, due_date,
    subtotal, tax_amount, total_amount, status, notes
  )
  VALUES (
    v_work_record.user_id, v_work_record.customer_id, v_instance_record.work_id, v_period_id,
    v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    v_price, v_tax_amount, v_total_amount, 'draft',
    'Auto-generated for ' || v_instance_record.period_name
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item
  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_instance_record.period_name,
    1, v_price, v_price, v_tax_rate, v_work_record.service_id
  );

  -- Update period instance
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount,
    status = 'completed',
    updated_at = NOW()
  WHERE id = v_period_id;

  RAISE NOTICE '✓ Created invoice % for period % with amount %', v_invoice_number, v_instance_record.period_name, v_total_amount;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ AUTO-INVOICE AMOUNT PRIORITY FIXED ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Invoice Amount Priority Order:';
  RAISE NOTICE '';
  RAISE NOTICE 'Non-Recurring Work:';
  RAISE NOTICE '  1. work.billing_amount (amount set when creating work) ← HIGHEST PRIORITY';
  RAISE NOTICE '  2. customer_services.price (custom price for customer)';
  RAISE NOTICE '  3. service.default_price (default service price)';
  RAISE NOTICE '  4. 0 (fallback)';
  RAISE NOTICE '';
  RAISE NOTICE 'Recurring Work:';
  RAISE NOTICE '  1. period.billing_amount (if set for specific period) ← HIGHEST PRIORITY';
  RAISE NOTICE '  2. work.billing_amount (amount set when creating work)';
  RAISE NOTICE '  3. customer_services.price (custom price for customer)';
  RAISE NOTICE '  4. service.default_price (default service price)';
  RAISE NOTICE '  5. 0 (fallback)';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Example:';
  RAISE NOTICE '  Service default_price = 1500';
  RAISE NOTICE '  Work billing_amount = 1000';
  RAISE NOTICE '  → Invoice will show 1000 (work amount takes priority!)';
  RAISE NOTICE '========================================================================';
END $$;
