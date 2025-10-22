/*
  # Fix Auto-Invoice to Use Service Ledger Mapping First, Then Company Settings

  ## Problem

  When auto-creating invoices, the Income Account (Credit) should prioritize:
  1. Service-level ledger mapping (services.income_account_id) - FIRST
  2. Company settings default (company_settings.default_income_ledger_id) - FALLBACK

  Currently, the system is not checking the service-level mapping first.

  ## Solution

  Update both auto-invoice functions to:
  1. Check if the service has income_account_id set
  2. Use service.income_account_id if available
  3. Otherwise fall back to company_settings.default_income_ledger_id

  ## Changes Made

  1. Update `auto_create_invoice_on_work_tasks_complete()` function
  2. Update `auto_create_invoice_on_recurring_tasks_complete()` function
  3. Both functions now properly prioritize service-level ledger mapping
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
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
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

  -- Get work details with service and customer info
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

  -- Only for non-recurring
  IF v_work_record.is_recurring = true THEN
    RETURN NEW;
  END IF;

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- Check billing_status
  IF v_work_record.billing_status = 'billed' THEN
    RAISE NOTICE 'Work % already billed, skipping invoice creation', v_work_id;
    RETURN NEW;
  END IF;

  -- Get ledger mappings
  -- PRIORITY 1: Service-level income account
  -- PRIORITY 2: Company settings default income account
  IF v_work_record.service_income_account_id IS NOT NULL THEN
    v_income_ledger_id := v_work_record.service_income_account_id;
    RAISE NOTICE 'Using service-level income account: %', v_income_ledger_id;
  ELSE
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
    RAISE NOTICE 'Using company default income account: %', v_income_ledger_id;
  END IF;

  -- Get customer ledger account
  v_customer_ledger_id := v_work_record.customer_ledger_account_id;

  -- Calculate price (work amount takes priority)
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

  RAISE NOTICE '→ Creating invoice for work: % (Price: %, Tax Rate: %, Tax: %, Total: %, Income Account: %, Customer Account: %)',
    v_work_record.title, v_price, v_tax_rate, v_tax_amount, v_total_amount, v_income_ledger_id, v_customer_ledger_id;

  -- Create invoice with ledger mappings
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

  RAISE NOTICE '✓ Created invoice % for work % with amount % (Income Account from %)',
    v_invoice_number, v_work_record.title, v_total_amount,
    CASE WHEN v_work_record.service_income_account_id IS NOT NULL THEN 'SERVICE' ELSE 'COMPANY SETTINGS' END;

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
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
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

  -- Check invoice_generated flag
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE 'Invoice already generated for period %', v_period_id;
    RETURN NEW;
  END IF;

  -- Get work details with service and customer info
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

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- Get ledger mappings
  -- PRIORITY 1: Service-level income account
  -- PRIORITY 2: Company settings default income account
  IF v_work_record.service_income_account_id IS NOT NULL THEN
    v_income_ledger_id := v_work_record.service_income_account_id;
    RAISE NOTICE 'Using service-level income account: %', v_income_ledger_id;
  ELSE
    SELECT default_income_ledger_id INTO v_income_ledger_id
    FROM company_settings
    WHERE user_id = v_work_record.user_id;
    RAISE NOTICE 'Using company default income account: %', v_income_ledger_id;
  END IF;

  -- Get customer ledger account
  v_customer_ledger_id := v_work_record.customer_ledger_account_id;

  -- Calculate price (period amount takes highest priority for recurring)
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

  RAISE NOTICE '→ Creating invoice for recurring period: % (Price: %, Tax Rate: %, Tax: %, Total: %, Income Account: %, Customer Account: %)',
    v_instance_record.period_name, v_price, v_tax_rate, v_tax_amount, v_total_amount, v_income_ledger_id, v_customer_ledger_id;

  -- Create invoice with ledger mappings
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

  RAISE NOTICE '✓ Created invoice % for period % with amount % (Income Account from %)',
    v_invoice_number, v_instance_record.period_name, v_total_amount,
    CASE WHEN v_work_record.service_income_account_id IS NOT NULL THEN 'SERVICE' ELSE 'COMPANY SETTINGS' END;

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
  RAISE NOTICE '✓✓✓ AUTO-INVOICE LEDGER MAPPING PRIORITY FIXED ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Income Account (Credit) Priority Order:';
  RAISE NOTICE '';
  RAISE NOTICE '  1. Service-level ledger mapping (services.income_account_id) ← HIGHEST PRIORITY';
  RAISE NOTICE '  2. Company default income account (company_settings.default_income_ledger_id)';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Example:';
  RAISE NOTICE '  Service has income_account_id = "Professional Fees Income"';
  RAISE NOTICE '  Company settings has default_income_ledger_id = "Sales Revenue"';
  RAISE NOTICE '  → Invoice will use "Professional Fees Income" (service mapping takes priority!)';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'If service does not have ledger mapping:';
  RAISE NOTICE '  → Invoice will use company settings default income account';
  RAISE NOTICE '========================================================================';
END $$;
