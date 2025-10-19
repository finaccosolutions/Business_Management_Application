/*
  # Complete Fix: Invoice Generation and Ledger Posting - FINAL
  
  ## Critical Fixes
  
  ### 1. Recurring Invoice Generation
  - **Problem**: Function referenced wrong table name (recurring_periods vs work_recurring_instances)
  - **Problem**: Function referenced wrong column (period_id vs work_recurring_instance_id)
  - **Problem**: work_recurring_instances has no user_id column
  - **Solution**: Rewrite function to use correct table/column names and get user_id from works table
  
  ### 2. Non-Recurring Invoice Generation
  - **Problem**: work_id being auto-filled (should only be for manual invoice creation)
  - **Problem**: Income and customer accounts not being mapped
  - **Solution**: Remove work_id from auto-generated invoices (set to NULL)
  - **Solution**: Always map income_account_id and customer_account_id
  
  ### 3. Invoice Number Generation
  - **Solution**: Use unified_id_config for all invoice number generation
*/

-- ============================================================================
-- STEP 1: Fix Recurring Period Invoice Generation Function
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON recurring_period_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_for_completed_period CASCADE;

CREATE OR REPLACE FUNCTION auto_create_invoice_for_completed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance RECORD;
  v_work RECORD;
  v_service RECORD;
  v_customer RECORD;
  v_company_settings RECORD;
  v_invoice_number text;
  v_invoice_id uuid;
  v_tax_amount numeric;
  v_subtotal numeric;
  v_total_amount numeric;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
  v_due_date date;
  v_existing_invoice_id uuid;
  v_all_tasks_completed boolean;
  v_total_tasks integer;
  v_completed_tasks integer;
BEGIN
  -- Only proceed if task status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get recurring instance details
    SELECT * INTO v_instance
    FROM work_recurring_instances
    WHERE id = NEW.work_recurring_instance_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Recurring instance not found for task %', NEW.id;
      RETURN NEW;
    END IF;

    -- Check if invoice already exists for this instance
    SELECT id INTO v_existing_invoice_id
    FROM invoices
    WHERE notes LIKE '%Period: ' || v_instance.period_start_date::text || ' to ' || v_instance.period_end_date::text || '%'
      AND EXISTS (
        SELECT 1 FROM works w 
        WHERE w.id = v_instance.work_id 
          AND invoices.customer_id = w.customer_id
      )
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
      RAISE NOTICE 'Invoice already exists for this period, skipping';
      
      -- Update instance with invoice_id if not set
      IF v_instance.invoice_id IS NULL THEN
        UPDATE work_recurring_instances
        SET invoice_id = v_existing_invoice_id
        WHERE id = v_instance.id;
      END IF;
      
      RETURN NEW;
    END IF;

    -- Check if ALL tasks in this instance are completed
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_total_tasks, v_completed_tasks
    FROM recurring_period_tasks
    WHERE work_recurring_instance_id = NEW.work_recurring_instance_id;

    v_all_tasks_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

    IF NOT v_all_tasks_completed THEN
      RAISE NOTICE 'Not all tasks completed for instance % (% of % completed), skipping invoice generation', 
        NEW.work_recurring_instance_id, v_completed_tasks, v_total_tasks;
      RETURN NEW;
    END IF;

    RAISE NOTICE 'All % tasks completed for instance %, generating invoice', v_total_tasks, NEW.work_recurring_instance_id;

    -- Get work details (includes user_id)
    SELECT * INTO v_work
    FROM works
    WHERE id = v_instance.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for instance %', NEW.work_recurring_instance_id;
      RETURN NEW;
    END IF;

    -- Only create invoice if auto_bill is enabled
    IF v_work.auto_bill != true THEN
      RAISE NOTICE 'Auto-billing not enabled for work %, skipping invoice generation', v_work.id;
      RETURN NEW;
    END IF;

    -- Get service details
    SELECT * INTO v_service
    FROM services
    WHERE id = v_work.service_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', v_instance.work_id;
      RETURN NEW;
    END IF;

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_work.customer_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', v_instance.work_id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = v_work.user_id
    LIMIT 1;

    -- Determine income ledger (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
      RAISE NOTICE 'Using service income account: %', v_income_ledger_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
      RAISE NOTICE 'Using default income account from company settings: %', v_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for recurring work "%" (Period: % to %): Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).',
        v_work.title, v_instance.period_start_date, v_instance.period_end_date;
      RETURN NEW;
    END IF;

    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;

    -- Calculate amounts
    v_subtotal := COALESCE(v_service.default_price, 0);

    IF v_subtotal <= 0 THEN
      RAISE WARNING 'Skipping invoice - no valid price for service %', v_service.id;
      RETURN NEW;
    END IF;

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

    -- Generate invoice number using unified config system
    v_invoice_number := generate_invoice_number_from_config(v_work.user_id);

    -- Create invoice WITHOUT work_id (work_id is for manual invoice linking only)
    INSERT INTO invoices (
      user_id,
      customer_id,
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status,
      notes,
      income_account_id,
      customer_account_id,
      work_id
    ) VALUES (
      v_work.user_id,
      v_work.customer_id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for recurring work: ' || v_work.title || ' | Period: ' || v_instance.period_start_date || ' to ' || v_instance.period_end_date,
      v_income_ledger_id,
      v_customer_ledger_id,
      NULL  -- work_id is NULL for auto-generated invoices
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item WITH service_id
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
      v_work.title || ' - Period: ' || v_instance.period_start_date || ' to ' || v_instance.period_end_date,
      1,
      v_subtotal,
      v_subtotal,
      COALESCE(v_service.tax_rate, 0)
    );

    -- Link invoice to instance
    UPDATE work_recurring_instances
    SET invoice_id = v_invoice_id,
        status = 'completed',
        is_billed = true
    WHERE id = v_instance.id;

    RAISE NOTICE 'Created invoice % (ID: %) for recurring period with service % income account % and customer account %',
      v_invoice_number, v_invoice_id, v_service.id, v_income_ledger_id, v_customer_ledger_id;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period task %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_create_invoice_for_completed_period IS
  'Monitors recurring_period_tasks. When a task is completed, checks if ALL tasks in the work_recurring_instance are completed. If yes, auto-creates invoice with proper ledger mappings and service_id. Does NOT set work_id (that is for manual invoice linking only).';

-- Create trigger on recurring_period_tasks
CREATE TRIGGER trigger_auto_create_invoice_for_completed_period
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();

COMMENT ON TRIGGER trigger_auto_create_invoice_for_completed_period ON recurring_period_tasks IS
  'Auto-creates invoice when all tasks in a recurring period are marked as completed';

-- ============================================================================
-- STEP 2: Fix Non-Recurring Work Invoice Generation Function
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
DROP FUNCTION IF EXISTS auto_generate_work_invoice CASCADE;

CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_service RECORD;
  v_customer RECORD;
  v_company_settings RECORD;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Only proceed if:
  -- 1. Status changed to 'completed'
  -- 2. auto_bill enabled
  -- 3. Work is NOT recurring
  -- 4. billing_amount is set
  -- 5. No existing invoice
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.auto_bill = true AND
     NEW.is_recurring = false AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     NOT EXISTS (SELECT 1 FROM invoices WHERE notes LIKE '%Work: ' || NEW.title || '%' AND customer_id = NEW.customer_id) THEN

    -- Get service details
    SELECT * INTO v_service
    FROM services
    WHERE id = NEW.service_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get customer details with account mapping
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Determine income ledger (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
      RAISE NOTICE 'Using service income account: %', v_income_ledger_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
      RAISE NOTICE 'Using default income account from company settings: %', v_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for work "%": Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).', NEW.title;
      RETURN NEW;
    END IF;

    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;

    IF v_customer_ledger_id IS NULL THEN
      RAISE WARNING 'Customer % has no linked account - invoice will be created without customer account mapping', v_customer.name;
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

    -- Generate invoice number using unified config system
    v_invoice_number := generate_invoice_number_from_config(NEW.user_id);

    -- Create invoice WITHOUT work_id (work_id should be NULL for auto-generated)
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
      NULL,  -- work_id is NULL for auto-generated invoices (only set for manual linking)
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for work: ' || NEW.title,
      v_income_ledger_id,
      v_customer_ledger_id
    )
    RETURNING id INTO v_invoice_id;

    -- Create invoice line item WITH service_id
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

    RAISE NOTICE 'Created invoice % (ID: %) for work % with service % income account % and customer account %',
      v_invoice_number, v_invoice_id, NEW.title, v_service.id, v_income_ledger_id, v_customer_ledger_id;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_generate_work_invoice IS
  'Auto-generates invoice for non-recurring work when completed. Uses unified_id_config for invoice numbering. Includes income_account_id from service or company settings, customer_account_id from customer, and service_id in invoice_items. Does NOT set work_id (that is for manual invoice linking only).';

-- Recreate trigger
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Summary:
-- 1. Recurring invoice generation now uses correct table names (work_recurring_instances)
-- 2. Both functions get user_id from works table (work_recurring_instances has no user_id)
-- 3. Both functions set work_id to NULL (work_id is only for manual invoice linking)
-- 4. Both functions properly map income_account_id and customer_account_id
-- 5. Both functions include service_id in invoice_items
-- 6. Both functions use generate_invoice_number_from_config for proper numbering
-- 7. Invoice ledger posting trigger posts to ledger when status = 'sent', 'paid', or 'overdue'
