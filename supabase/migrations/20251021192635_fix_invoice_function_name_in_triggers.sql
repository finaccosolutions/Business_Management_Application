/*
  # Fix Invoice Number Function Name in Auto-Invoice Triggers

  ## Problem
  Both auto-invoice triggers are calling `generate_invoice_number(user_id)` but the actual
  function name is `generate_invoice_number_from_config(user_id)`.

  This causes the triggers to fail silently when trying to create invoices.

  ## Solution
  Update both trigger functions to use the correct function name:
  - auto_create_invoice_on_recurring_tasks_complete()
  - auto_create_invoice_on_work_tasks_complete()
*/

-- ============================================================================
-- Fix Recurring Tasks Trigger
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
  v_invoice_exists BOOLEAN;
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

  -- Count total tasks and completed tasks for this period
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  -- Check if ALL tasks are now completed
  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  RAISE NOTICE 'RECURRING: Period % - Total: %, Completed: %, All done: %',
    v_period_id, v_task_count, v_completed_count, v_all_completed;

  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get the period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RAISE WARNING 'RECURRING: Period % not found', v_period_id;
    RETURN NEW;
  END IF;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE 'RECURRING: Invoice already generated for period %', v_period_id;
    RETURN NEW;
  END IF;

  -- Get work details
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    COALESCE(cs.price, s.default_price) as final_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = v_instance_record.work_id;

  IF NOT FOUND THEN
    RAISE WARNING 'RECURRING: Work % not found', v_instance_record.work_id;
    RETURN NEW;
  END IF;

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RAISE NOTICE 'RECURRING: Auto-bill disabled for work %', v_work_record.id;
    RETURN NEW;
  END IF;

  -- Check if invoice exists
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_instance_record.work_id
    AND work_recurring_instance_id = v_period_id
    AND user_id = v_work_record.user_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    RAISE NOTICE 'RECURRING: Invoice exists for period %', v_period_id;
    UPDATE work_recurring_instances SET invoice_generated = true WHERE id = v_period_id;
    RETURN NEW;
  END IF;

  -- Calculate price
  v_price := COALESCE(v_work_record.final_price, v_instance_record.billing_amount, v_work_record.billing_amount, v_work_record.default_price, 0);

  IF v_price <= 0 THEN
    RAISE WARNING 'RECURRING: No valid price for period %', v_period_id;
    RETURN NEW;
  END IF;

  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- FIXED: Use correct function name
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE 'RECURRING: Creating invoice % - price=%, tax=%, total=%',
    v_invoice_number, v_price, v_tax_amount, v_total_amount;

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

  -- Update period
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount,
    status = 'completed',
    updated_at = NOW()
  WHERE id = v_period_id;

  RAISE NOTICE 'RECURRING: Created invoice % for period %', v_invoice_number, v_instance_record.period_name;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'RECURRING: Error creating invoice: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Fix Non-Recurring Tasks Trigger
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
  v_invoice_exists BOOLEAN;
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

  RAISE NOTICE 'NON-RECURRING: Work % - Total: %, Completed: %, All done: %',
    v_work_id, v_task_count, v_completed_count, v_all_completed;

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
    COALESCE(cs.price, s.default_price) as final_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = v_work_id;

  IF NOT FOUND THEN
    RAISE WARNING 'NON-RECURRING: Work % not found', v_work_id;
    RETURN NEW;
  END IF;

  -- Only for non-recurring
  IF v_work_record.is_recurring = true THEN
    RAISE NOTICE 'NON-RECURRING: Work % is recurring, skipping', v_work_id;
    RETURN NEW;
  END IF;

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RAISE NOTICE 'NON-RECURRING: Auto-bill disabled for work %', v_work_id;
    RETURN NEW;
  END IF;

  -- Check if invoice exists
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_work_id AND user_id = v_work_record.user_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    RAISE NOTICE 'NON-RECURRING: Invoice exists for work %', v_work_id;
    RETURN NEW;
  END IF;

  -- Calculate price
  v_price := COALESCE(v_work_record.final_price, v_work_record.billing_amount, v_work_record.default_price, 0);

  IF v_price <= 0 THEN
    RAISE WARNING 'NON-RECURRING: No valid price for work %', v_work_id;
    RETURN NEW;
  END IF;

  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- FIXED: Use correct function name
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE 'NON-RECURRING: Creating invoice % - price=%, tax=%, total=%',
    v_invoice_number, v_price, v_tax_amount, v_total_amount;

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

  -- Update work
  UPDATE works
  SET billing_status = 'billed', updated_at = NOW()
  WHERE id = v_work_id;

  RAISE NOTICE 'NON-RECURRING: Created invoice % for work %', v_invoice_number, v_work_record.title;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'NON-RECURRING: Error creating invoice: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_create_invoice_on_recurring_tasks_complete IS
  'Auto-creates invoice when ALL recurring_period_tasks completed. Uses generate_invoice_number_from_config.';

COMMENT ON FUNCTION auto_create_invoice_on_work_tasks_complete IS
  'Auto-creates invoice when ALL work_tasks completed for non-recurring work. Uses generate_invoice_number_from_config.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'FIXED: Invoice number function name corrected in both triggers';
  RAISE NOTICE 'Now using: generate_invoice_number_from_config(user_id)';
  RAISE NOTICE '========================================================================';
END $$;
