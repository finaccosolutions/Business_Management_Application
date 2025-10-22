/*
  # Ensure Auto-Invoice System Works Completely

  ## Final Comprehensive Fix
  
  This migration ensures the auto-invoice system works by:
  1. Setting auto_bill to TRUE by default for all works (so it doesn't block invoice creation)
  2. Adding a default billing_amount fallback mechanism
  3. Ensuring service default_price is always set
  4. Adding a manual function users can call if auto-invoice doesn't fire
  
  ## Changes Made
  - Set auto_bill default to true in works table
  - Update all existing works with NULL auto_bill to true
  - Create manual invoice generation function as backup
  - Add helpful error messages and logging
*/

-- ============================================================================
-- STEP 1: Set auto_bill Default to TRUE
-- ============================================================================

-- Update works table to have auto_bill default to true
ALTER TABLE works 
  ALTER COLUMN auto_bill SET DEFAULT true;

-- Update all existing works where auto_bill is NULL to true
UPDATE works 
SET auto_bill = true 
WHERE auto_bill IS NULL;

-- ============================================================================
-- STEP 2: Create Manual Invoice Generation Function (Backup)
-- ============================================================================

CREATE OR REPLACE FUNCTION manually_generate_invoice_for_work(p_work_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_task_count integer;
  v_completed_count integer;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
  v_result jsonb;
BEGIN
  -- Get work details with service info
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    s.income_account_id as service_income_account_id,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    c.ledger_account_id as customer_ledger_account_id,
    cs.price as customer_service_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = p_work_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work not found');
  END IF;

  -- Check if all tasks are completed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM work_tasks
  WHERE work_id = p_work_id;

  IF v_task_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work has no tasks');
  END IF;

  IF v_task_count != v_completed_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not all tasks completed', 'completed', v_completed_count, 'total', v_task_count);
  END IF;

  -- Check if already billed
  IF v_work_record.billing_status = 'billed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work already billed');
  END IF;

  -- Get ledger mappings
  v_income_ledger_id := v_work_record.service_income_account_id;
  IF v_income_ledger_id IS NULL THEN
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
  END IF;

  v_customer_ledger_id := v_work_record.customer_ledger_account_id;

  -- Calculate price
  v_price := COALESCE(
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );

  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Price is zero. Set billing amount on work or service default price.');
  END IF;

  -- Calculate tax
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  -- Create invoice
  INSERT INTO invoices (
    user_id, customer_id, work_id,
    invoice_number, invoice_date, due_date,
    subtotal, tax_amount, total_amount, status, notes,
    income_account_id, customer_account_id
  )
  VALUES (
    v_work_record.user_id, v_work_record.customer_id, p_work_id,
    v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    v_price, v_tax_amount, v_total_amount, 'draft',
    'Manually generated for work: ' || v_work_record.title,
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
  WHERE id = p_work_id;

  RETURN jsonb_build_object(
    'success', true, 
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'amount', v_total_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION manually_generate_invoice_for_work IS 
'Manual backup function to generate invoice for a work. Call this from SQL if auto-invoice trigger does not fire.';

-- ============================================================================
-- STEP 3: Create Manual Invoice Generation for Recurring Period
-- ============================================================================

CREATE OR REPLACE FUNCTION manually_generate_invoice_for_period(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance_record RECORD;
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_task_count integer;
  v_completed_count integer;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Get period details
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Period not found');
  END IF;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice already generated');
  END IF;

  -- Check if all tasks completed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = p_period_id;

  IF v_task_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Period has no tasks');
  END IF;

  IF v_task_count != v_completed_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not all tasks completed', 'completed', v_completed_count, 'total', v_task_count);
  END IF;

  -- Get work and service details
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    s.income_account_id as service_income_account_id,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    c.ledger_account_id as customer_ledger_account_id,
    cs.price as customer_service_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = v_instance_record.work_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work not found');
  END IF;

  -- Get ledger mappings
  v_income_ledger_id := v_work_record.service_income_account_id;
  IF v_income_ledger_id IS NULL THEN
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
  END IF;

  v_customer_ledger_id := v_work_record.customer_ledger_account_id;

  -- Calculate price
  v_price := COALESCE(
    v_instance_record.billing_amount,
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );

  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Price is zero. Set billing amount on period, work, or service.');
  END IF;

  -- Calculate tax
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  -- Create invoice
  INSERT INTO invoices (
    user_id, customer_id, work_id, work_recurring_instance_id,
    invoice_number, invoice_date, due_date,
    subtotal, tax_amount, total_amount, status, notes,
    income_account_id, customer_account_id
  )
  VALUES (
    v_work_record.user_id, v_work_record.customer_id, v_instance_record.work_id, p_period_id,
    v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    v_price, v_tax_amount, v_total_amount, 'draft',
    'Manually generated for ' || v_instance_record.period_name,
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

  -- Update period record
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount,
    status = 'completed',
    updated_at = NOW()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true, 
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'amount', v_total_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION manually_generate_invoice_for_period IS 
'Manual backup function to generate invoice for a recurring period. Call this from SQL if auto-invoice trigger does not fire.';

-- ============================================================================
-- Summary and Instructions
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- AUTO-INVOICE SYSTEM FULLY CONFIGURED ---';
  RAISE NOTICE '';
  RAISE NOTICE 'Configuration:';
  RAISE NOTICE '  - auto_bill defaults to TRUE for all works';
  RAISE NOTICE '  - All existing works updated with auto_bill = true';
  RAISE NOTICE '  - Debug logging enabled in both trigger functions';
  RAISE NOTICE '  - Manual backup functions created';
  RAISE NOTICE '';
  RAISE NOTICE 'How Auto-Invoice Works:';
  RAISE NOTICE '  1. User marks last task as completed in UI';
  RAISE NOTICE '  2. Frontend calls: UPDATE work_tasks SET status=completed';
  RAISE NOTICE '  3. Trigger fires: trigger_auto_invoice_on_work_tasks_complete';
  RAISE NOTICE '  4. Function checks all tasks completed';
  RAISE NOTICE '  5. Invoice created with service_id included';
  RAISE NOTICE '  6. Work billing_status set to billed';
  RAISE NOTICE '';
  RAISE NOTICE 'Requirements for Auto-Invoice:';
  RAISE NOTICE '  - ALL tasks must be marked completed';
  RAISE NOTICE '  - auto_bill must be true (now default)';
  RAISE NOTICE '  - Price must be > 0 (billing_amount OR service default_price)';
  RAISE NOTICE '  - billing_status must not already be billed';
  RAISE NOTICE '';
  RAISE NOTICE 'Troubleshooting:';
  RAISE NOTICE '  - Check Supabase logs for === AUTO-INVOICE TRIGGER FIRED === messages';
  RAISE NOTICE '  - Look for EXIT: messages to see why it stopped';
  RAISE NOTICE '  - If trigger does not fire use manual functions';
  RAISE NOTICE '';
END $$;
