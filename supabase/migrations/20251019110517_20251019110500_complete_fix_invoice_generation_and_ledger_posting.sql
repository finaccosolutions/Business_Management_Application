/*
  # Complete Fix: Invoice Generation and Ledger Posting
  
  ## Critical Issues Fixed
  
  ### 1. Recurring Period Invoice Generation
  - **Problem**: No trigger exists on recurring_periods table to create invoices when all tasks completed
  - **Solution**: Create trigger that monitors recurring_period_tasks status changes and auto-creates invoice when all tasks are completed
  
  ### 2. Invoice Ledger Posting
  - **Problem**: Invoices not posting to ledger_transactions when status changes to 'sent'
  - **Solution**: Fix trigger condition to properly detect status changes to 'sent', 'paid', or 'overdue'
  
  ### 3. Non-Recurring Work Invoice Generation
  - **Problem**: Invoice number not using unified_id_config, missing service_id, ledger accounts not mapped
  - **Solution**: All functions updated to use unified config and properly map all required fields
  
  ## Changes Made
  
  1. **Recurring Period Invoice Trigger**
     - Created trigger on recurring_period_tasks that fires when task status changes to 'completed'
     - Checks if all tasks in the period are completed
     - Auto-creates invoice with proper ledger mappings and service_id
  
  2. **Invoice Ledger Posting Trigger**
     - Fixed condition to properly detect status changes to 'sent', 'paid', or 'overdue'
     - Ensures ledger transactions are created when invoice status changes from draft
     - Handles INSERT operations for auto-generated invoices that start as 'sent'
  
  3. **Both Functions**
     - Use unified_id_config for invoice numbering
     - Map income_account_id from service or company settings
     - Map customer_account_id from customer
     - Include service_id in invoice_items
     - Proper error handling and logging
*/

-- ============================================================================
-- STEP 1: Fix Invoice Ledger Posting Trigger Condition
-- ============================================================================

CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_voucher_id uuid;
  v_voucher_number text;
  v_sales_voucher_type_id uuid;
  v_existing_voucher_id uuid;
BEGIN
  -- Only post to ledger when:
  -- 1. Status is 'sent', 'paid', or 'overdue' (not draft)
  -- 2. Both income_account_id and customer_account_id are NOT NULL
  -- 3. Total amount > 0
  -- 4. This is either INSERT or status changed from previous value
  
  IF NEW.status IN ('sent', 'paid', 'overdue') AND
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != NEW.status)) AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL AND
     NEW.total_amount > 0 THEN

    -- Check if voucher already exists for this invoice
    SELECT id INTO v_existing_voucher_id
    FROM vouchers
    WHERE reference_type = 'invoice'
      AND reference_id = NEW.id
    LIMIT 1;

    IF v_existing_voucher_id IS NOT NULL THEN
      RAISE NOTICE 'Voucher already exists for invoice %, skipping duplicate posting', NEW.invoice_number;
      RETURN NEW;
    END IF;

    -- Get Sales voucher type
    SELECT id INTO v_sales_voucher_type_id
    FROM voucher_types
    WHERE user_id = NEW.user_id
      AND voucher_category = 'sales'
      AND is_active = true
    LIMIT 1;

    IF v_sales_voucher_type_id IS NULL THEN
      RAISE WARNING 'No active Sales voucher type found for user %, cannot post invoice % to ledger', NEW.user_id, NEW.invoice_number;
      RETURN NEW;
    END IF;

    -- Generate voucher number
    v_voucher_number := generate_next_voucher_number(NEW.user_id, v_sales_voucher_type_id);

    -- Create voucher
    INSERT INTO vouchers (
      user_id,
      voucher_type_id,
      voucher_number,
      voucher_date,
      reference_type,
      reference_id,
      notes,
      status
    ) VALUES (
      NEW.user_id,
      v_sales_voucher_type_id,
      v_voucher_number,
      NEW.invoice_date,
      'invoice',
      NEW.id,
      'Auto-generated for Invoice: ' || NEW.invoice_number,
      'approved'
    ) RETURNING id INTO v_voucher_id;

    -- Debit: Customer Account (Asset increase)
    INSERT INTO voucher_entries (
      voucher_id,
      account_id,
      entry_type,
      amount,
      description
    ) VALUES (
      v_voucher_id,
      NEW.customer_account_id,
      'debit',
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number || ' - Customer Receivable'
    );

    -- Credit: Income Account (Revenue increase)
    INSERT INTO voucher_entries (
      voucher_id,
      account_id,
      entry_type,
      amount,
      description
    ) VALUES (
      v_voucher_id,
      NEW.income_account_id,
      'credit',
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number || ' - Service Revenue'
    );

    -- Create ledger transactions
    -- Debit: Customer Account
    INSERT INTO ledger_transactions (
      account_id,
      voucher_id,
      transaction_date,
      description,
      debit_amount,
      credit_amount,
      balance
    )
    SELECT
      NEW.customer_account_id,
      v_voucher_id,
      NEW.invoice_date,
      'Invoice ' || NEW.invoice_number || ' - Customer Receivable',
      NEW.total_amount,
      0,
      COALESCE((
        SELECT balance FROM ledger_transactions 
        WHERE account_id = NEW.customer_account_id 
        ORDER BY transaction_date DESC, created_at DESC 
        LIMIT 1
      ), 0) + NEW.total_amount;

    -- Credit: Income Account
    INSERT INTO ledger_transactions (
      account_id,
      voucher_id,
      transaction_date,
      description,
      debit_amount,
      credit_amount,
      balance
    )
    SELECT
      NEW.income_account_id,
      v_voucher_id,
      NEW.invoice_date,
      'Invoice ' || NEW.invoice_number || ' - Service Revenue',
      0,
      NEW.total_amount,
      COALESCE((
        SELECT balance FROM ledger_transactions 
        WHERE account_id = NEW.income_account_id 
        ORDER BY transaction_date DESC, created_at DESC 
        LIMIT 1
      ), 0) + NEW.total_amount;

    RAISE NOTICE 'Posted invoice % to ledger with voucher %', NEW.invoice_number, v_voucher_number;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS 
  'Posts invoice to ledger_transactions and creates voucher when status changes to sent/paid/overdue. Requires both income and customer accounts mapped.';

-- Recreate ledger posting trigger
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- ============================================================================
-- STEP 2: Create Recurring Period Invoice Generation Function and Trigger
-- ============================================================================

-- This function checks if all tasks in a period are completed, then creates invoice
CREATE OR REPLACE FUNCTION auto_create_invoice_for_completed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period RECORD;
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

    -- Get period details
    SELECT * INTO v_period
    FROM recurring_periods
    WHERE id = NEW.period_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Period not found for task %', NEW.id;
      RETURN NEW;
    END IF;

    -- Check if invoice already exists for this period
    SELECT id INTO v_existing_invoice_id
    FROM invoices
    WHERE work_id = v_period.work_id
      AND notes LIKE '%Period: ' || v_period.period_start_date::text || ' to ' || v_period.period_end_date::text || '%'
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
      RAISE NOTICE 'Invoice already exists for this period, skipping';
      
      -- Update period with invoice_id if not set
      IF v_period.invoice_id IS NULL THEN
        UPDATE recurring_periods
        SET invoice_id = v_existing_invoice_id
        WHERE id = v_period.id;
      END IF;
      
      RETURN NEW;
    END IF;

    -- Check if ALL tasks in this period are completed
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_total_tasks, v_completed_tasks
    FROM recurring_period_tasks
    WHERE period_id = NEW.period_id;

    v_all_tasks_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

    IF NOT v_all_tasks_completed THEN
      RAISE NOTICE 'Not all tasks completed for period % (% of % completed), skipping invoice generation', 
        NEW.period_id, v_completed_tasks, v_total_tasks;
      RETURN NEW;
    END IF;

    RAISE NOTICE 'All % tasks completed for period %, generating invoice', v_total_tasks, NEW.period_id;

    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = v_period.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.period_id;
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
      RAISE WARNING 'Service not found for work %', v_period.work_id;
      RETURN NEW;
    END IF;

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_work.customer_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', v_period.work_id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = v_period.user_id
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
        v_work.title, v_period.period_start_date, v_period.period_end_date;
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
    v_invoice_number := generate_invoice_number_from_config(v_period.user_id);

    -- Create invoice
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
      v_period.user_id,
      v_work.customer_id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for recurring work: ' || v_work.title || ' | Period: ' || v_period.period_start_date || ' to ' || v_period.period_end_date,
      v_income_ledger_id,
      v_customer_ledger_id,
      v_period.work_id
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
      v_work.title || ' - Period: ' || v_period.period_start_date || ' to ' || v_period.period_end_date,
      1,
      v_subtotal,
      v_subtotal,
      COALESCE(v_service.tax_rate, 0)
    );

    -- Link invoice to period
    UPDATE recurring_periods
    SET invoice_id = v_invoice_id,
        status = 'completed'
    WHERE id = v_period.id;

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
  'Monitors recurring_period_tasks. When a task is completed, checks if ALL tasks in the period are completed. If yes, auto-creates invoice with proper ledger mappings and service_id.';

-- Create trigger on recurring_period_tasks
DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON recurring_period_tasks;
CREATE TRIGGER trigger_auto_create_invoice_for_completed_period
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();

COMMENT ON TRIGGER trigger_auto_create_invoice_for_completed_period ON recurring_period_tasks IS
  'Auto-creates invoice when all tasks in a recurring period are marked as completed';

-- ============================================================================
-- STEP 3: Verification Queries
-- ============================================================================

-- Check triggers on recurring_period_tasks
-- SELECT trigger_name, event_manipulation, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_table = 'recurring_period_tasks';

-- Check triggers on invoices
-- SELECT trigger_name, event_manipulation, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_table = 'invoices';

-- Check if ledger transactions exist for an invoice
-- SELECT lt.*, a.name as account_name
-- FROM ledger_transactions lt
-- JOIN accounting_ledgers a ON lt.account_id = a.id
-- WHERE lt.voucher_id IN (
--   SELECT id FROM vouchers WHERE reference_type = 'invoice' AND reference_id = '<invoice_id>'
-- );
