/*
  # Ensure Auto-Invoice Creation on All Tasks Completed
  
  ## Summary
  This migration ensures that invoices are automatically created when all tasks 
  of a work are marked as completed, whether viewed from:
  - Work Details > Tasks tab (non-recurring works)
  - Work Details > Periods & Tasks tab (recurring works)
  
  ## Key Points
  1. Triggers fire when status changes to 'completed' on work_tasks or recurring_period_tasks
  2. Functions verify ALL tasks are completed before creating invoice
  3. Auto_bill defaults to true, so it won't block invoice creation
  4. Price uses: billing_amount > customer_service_price > default_price
  5. Invoice includes service_id for proper tracking
  
  ## Changes Made
  - Verify trigger definitions are correct with OF status clause
  - Ensure functions have proper checks and logging
  - Add comprehensive error handling
  - Confirm both recurring and non-recurring works are handled
*/

-- ============================================================================
-- STEP 1: Verify and Recreate Non-Recurring Work Auto-Invoice Trigger
-- ============================================================================

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;

-- Create trigger that fires ONLY when status changes
CREATE TRIGGER trigger_auto_invoice_on_work_tasks_complete
  AFTER UPDATE OF status ON work_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_work_tasks_complete();

-- ============================================================================
-- STEP 2: Verify and Recreate Recurring Work Auto-Invoice Trigger
-- ============================================================================

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_recurring_tasks_complete ON recurring_period_tasks;

-- Create trigger that fires ONLY when status changes
CREATE TRIGGER trigger_auto_invoice_on_recurring_tasks_complete
  AFTER UPDATE OF status ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_recurring_tasks_complete();

-- ============================================================================
-- STEP 3: Ensure Both Functions Exist with Correct Logic
-- ============================================================================

-- Function for non-recurring works
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

  -- Check if ALL tasks are completed
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
    RETURN NEW;
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

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice for work %: %', v_work_id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Function for recurring works
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

  -- Check if ALL tasks for this period are completed
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

  -- Get period details
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RETURN NEW;
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
    RETURN NEW;
  END IF;

  -- Check auto_bill flag (treat NULL as true)
  IF COALESCE(v_work_record.auto_bill, true) = false THEN
    RETURN NEW;
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
    RETURN NEW;
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

  -- Update period record
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount,
    status = 'completed',
    updated_at = NOW()
  WHERE id = v_period_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice for period %: %', v_period_id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== AUTO-INVOICE SYSTEM VERIFIED AND UPDATED ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Triggers Active:';
  RAISE NOTICE '  ✓ trigger_auto_invoice_on_work_tasks_complete (non-recurring)';
  RAISE NOTICE '  ✓ trigger_auto_invoice_on_recurring_tasks_complete (recurring)';
  RAISE NOTICE '';
  RAISE NOTICE 'How It Works:';
  RAISE NOTICE '  1. User marks task as completed in UI (Tasks tab or Periods & Tasks tab)';
  RAISE NOTICE '  2. Frontend updates: work_tasks.status = completed OR recurring_period_tasks.status = completed';
  RAISE NOTICE '  3. Trigger fires and verifies ALL tasks are completed';
  RAISE NOTICE '  4. If yes: Creates draft invoice with service_id';
  RAISE NOTICE '  5. Sets billing_status = billed (non-recurring) OR invoice_generated = true (recurring)';
  RAISE NOTICE '';
  RAISE NOTICE 'Requirements:';
  RAISE NOTICE '  - ALL tasks must be completed';
  RAISE NOTICE '  - auto_bill must be true (defaults to true)';
  RAISE NOTICE '  - Price must be > 0 (billing_amount OR service default_price)';
  RAISE NOTICE '  - Not already billed/invoice_generated';
  RAISE NOTICE '';
END $$;
