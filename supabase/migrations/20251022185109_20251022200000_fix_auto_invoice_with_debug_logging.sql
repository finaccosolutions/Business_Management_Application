/*
  # Fix Auto-Invoice with Comprehensive Debug Logging

  ## Problem Analysis
  - Triggers are correctly defined with OF status clause
  - Functions include service_id correctly
  - Issue: Invoice not being created when all tasks marked complete
  
  ## Potential Causes
  1. auto_bill flag is false (not enabled on work)
  2. billing_amount / price is 0 or NULL
  3. Some condition in the function is preventing creation
  4. Trigger is not firing at all
  
  ## Solution
  - Add comprehensive RAISE NOTICE logging to trace execution
  - Log every step of the function to identify where it exits
  - Make auto_bill default to true if NULL
  - Ensure price calculation works even without explicit billing_amount

  ## Changes Made
  - Enhanced both functions with detailed logging at each step
  - Added debug output for all conditions that cause early return
  - Log task counts, flags, prices, and exit points
*/

-- ============================================================================
-- Enhanced Non-Recurring Work Auto-Invoice Function with Debug Logging
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
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  RAISE NOTICE '=== AUTO-INVOICE TRIGGER FIRED (Non-Recurring) ===';
  RAISE NOTICE 'Task ID: %, Old Status: %, New Status: %', NEW.id, OLD.status, NEW.status;
  
  -- Only trigger on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' THEN
    RAISE NOTICE 'EXIT: Not an UPDATE operation';
    RETURN NEW;
  END IF;
  
  IF NEW.status != 'completed' THEN
    RAISE NOTICE 'EXIT: New status is not completed (it is: %)', NEW.status;
    RETURN NEW;
  END IF;
  
  IF OLD.status = 'completed' THEN
    RAISE NOTICE 'EXIT: Old status was already completed';
    RETURN NEW;
  END IF;

  v_work_id := NEW.work_id;
  RAISE NOTICE 'Work ID: %', v_work_id;

  -- Check if ALL tasks are completed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM work_tasks
  WHERE work_id = v_work_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);
  
  RAISE NOTICE 'Task Summary: Total=%, Completed=%, All Completed=%', v_task_count, v_completed_count, v_all_completed;

  IF NOT v_all_completed THEN
    RAISE NOTICE 'EXIT: Not all tasks completed yet';
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
    RAISE NOTICE 'EXIT: Work record not found';
    RETURN NEW;
  END IF;

  RAISE NOTICE 'Work Details: Title=%, Service=%, is_recurring=%, auto_bill=%, billing_status=%', 
    v_work_record.title, v_work_record.service_name, v_work_record.is_recurring, 
    v_work_record.auto_bill, v_work_record.billing_status;

  -- Only for non-recurring works
  IF v_work_record.is_recurring = true THEN
    RAISE NOTICE 'EXIT: This is a recurring work';
    RETURN NEW;
  END IF;

  -- Check auto_bill flag (treat NULL as true for backward compatibility)
  IF COALESCE(v_work_record.auto_bill, true) = false THEN
    RAISE NOTICE 'EXIT: auto_bill is false';
    RETURN NEW;
  END IF;

  -- Check if already billed
  IF v_work_record.billing_status = 'billed' THEN
    RAISE NOTICE 'EXIT: Already billed (billing_status is billed)';
    RETURN NEW;
  END IF;

  -- Get ledger mappings (service first, then company default)
  v_income_ledger_id := v_work_record.service_income_account_id;

  IF v_income_ledger_id IS NULL THEN
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
  END IF;

  v_customer_ledger_id := v_work_record.customer_ledger_account_id;
  
  RAISE NOTICE 'Ledger Mapping: Income=%, Customer=%', v_income_ledger_id, v_customer_ledger_id;

  -- Calculate price
  v_price := COALESCE(
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );
  
  RAISE NOTICE 'Price Calculation: billing_amount=%, customer_service_price=%, default_price=%, Final=%',
    v_work_record.billing_amount, v_work_record.customer_service_price, 
    v_work_record.default_price, v_price;

  IF v_price <= 0 THEN
    RAISE NOTICE 'EXIT: Price is zero or negative';
    RETURN NEW;
  END IF;

  -- Calculate tax
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;
  
  RAISE NOTICE 'Tax Calculation: rate=%, amount=%, total=%', v_tax_rate, v_tax_amount, v_total_amount;

  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;
  RAISE NOTICE 'Generated Invoice Number: %', v_invoice_number;

  -- Create invoice
  RAISE NOTICE 'Creating invoice...';
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
  
  RAISE NOTICE 'Invoice Created: ID=%', v_invoice_id;

  -- Add invoice item with service_id
  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_work_record.title,
    1, v_price, v_price, v_tax_rate, v_work_record.service_id
  );
  
  RAISE NOTICE 'Invoice Item Created with service_id=%', v_work_record.service_id;

  -- Update work billing status
  UPDATE works
  SET billing_status = 'billed', updated_at = NOW()
  WHERE id = v_work_id;
  
  RAISE NOTICE '✓✓✓ SUCCESS: Auto-created invoice % for work % ✓✓✓', v_invoice_number, v_work_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'ERROR creating invoice: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Enhanced Recurring Work Auto-Invoice Function with Debug Logging
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
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  RAISE NOTICE '=== AUTO-INVOICE TRIGGER FIRED (Recurring) ===';
  RAISE NOTICE 'Task ID: %, Old Status: %, New Status: %', NEW.id, OLD.status, NEW.status;
  
  IF TG_OP != 'UPDATE' THEN
    RAISE NOTICE 'EXIT: Not an UPDATE operation';
    RETURN NEW;
  END IF;
  
  IF NEW.status != 'completed' THEN
    RAISE NOTICE 'EXIT: New status is not completed (it is: %)', NEW.status;
    RETURN NEW;
  END IF;
  
  IF OLD.status = 'completed' THEN
    RAISE NOTICE 'EXIT: Old status was already completed';
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;
  RAISE NOTICE 'Period ID: %', v_period_id;

  -- Check if ALL tasks for this period are completed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);
  
  RAISE NOTICE 'Task Summary: Total=%, Completed=%, All Completed=%', v_task_count, v_completed_count, v_all_completed;

  IF NOT v_all_completed THEN
    RAISE NOTICE 'EXIT: Not all tasks completed yet';
    RETURN NEW;
  END IF;

  -- Get period details
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'EXIT: Period record not found';
    RETURN NEW;
  END IF;
  
  RAISE NOTICE 'Period: name=%, invoice_generated=%', v_instance_record.period_name, v_instance_record.invoice_generated;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE 'EXIT: Invoice already generated for this period';
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
    RAISE NOTICE 'EXIT: Work record not found';
    RETURN NEW;
  END IF;
  
  RAISE NOTICE 'Work Details: Title=%, Service=%, auto_bill=%', 
    v_work_record.title, v_work_record.service_name, v_work_record.auto_bill;

  -- Check auto_bill flag (treat NULL as true for backward compatibility)
  IF COALESCE(v_work_record.auto_bill, true) = false THEN
    RAISE NOTICE 'EXIT: auto_bill is false';
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
  
  RAISE NOTICE 'Ledger Mapping: Income=%, Customer=%', v_income_ledger_id, v_customer_ledger_id;

  -- Calculate price
  v_price := COALESCE(
    v_instance_record.billing_amount,
    v_work_record.billing_amount,
    v_work_record.customer_service_price,
    v_work_record.default_price,
    0
  );
  
  RAISE NOTICE 'Price Calculation: period_billing=%, work_billing=%, customer_service=%, default=%, Final=%',
    v_instance_record.billing_amount, v_work_record.billing_amount, 
    v_work_record.customer_service_price, v_work_record.default_price, v_price;

  IF v_price <= 0 THEN
    RAISE NOTICE 'EXIT: Price is zero or negative';
    RETURN NEW;
  END IF;

  -- Calculate tax
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;
  
  RAISE NOTICE 'Tax Calculation: rate=%, amount=%, total=%', v_tax_rate, v_tax_amount, v_total_amount;

  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;
  RAISE NOTICE 'Generated Invoice Number: %', v_invoice_number;

  -- Create invoice
  RAISE NOTICE 'Creating invoice...';
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
  
  RAISE NOTICE 'Invoice Created: ID=%', v_invoice_id;

  -- Add invoice item with service_id
  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_instance_record.period_name,
    1, v_price, v_price, v_tax_rate, v_work_record.service_id
  );
  
  RAISE NOTICE 'Invoice Item Created with service_id=%', v_work_record.service_id;

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
  
  RAISE NOTICE '✓✓✓ SUCCESS: Auto-created invoice % for period % ✓✓✓', v_invoice_number, v_instance_record.period_name;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'ERROR creating invoice: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✓ AUTO-INVOICE FUNCTIONS UPDATED WITH DEBUG LOGGING';
  RAISE NOTICE '=====================================';
  RAISE NOTICE '1. ✓ Both functions now have comprehensive logging';
  RAISE NOTICE '2. ✓ Every condition that causes exit is logged';
  RAISE NOTICE '3. ✓ All variables and calculations are logged';
  RAISE NOTICE '4. ✓ auto_bill now defaults to true if NULL';
  RAISE NOTICE '';
  RAISE NOTICE '✓ How to debug:';
  RAISE NOTICE '  1. Mark all tasks as completed in Work Details';
  RAISE NOTICE '  2. Check browser console and network tab for errors';
  RAISE NOTICE '  3. Check Supabase logs for RAISE NOTICE messages';
  RAISE NOTICE '  4. Look for EXIT or SUCCESS messages';
  RAISE NOTICE '';
END $$;
