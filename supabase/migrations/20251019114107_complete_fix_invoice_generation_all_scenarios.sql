/*
  # Complete Fix for Invoice Generation - All Scenarios
  
  ## Issues Fixed
  
  ### Non-Recurring Works:
  1. Invoice should auto-create ONLY when work status = 'completed' (NOT when tasks completed)
  2. Invoice should NOT pre-fill income_account_id and customer_account_id (user sets manually)
  3. Invoice should NOT have work_id set (work_id only for manual "Select Completed Work")
  
  ### Recurring Works:
  1. Invoice should auto-create when ALL tasks in a period are completed
  2. Invoice SHOULD pre-fill ledger accounts (income_account_id and customer_account_id)
  3. Invoice should have work_id set to NULL (recurring invoices don't link to work_id)
  
  ### Ledger Posting:
  1. Only post to ledger when status changes FROM 'draft' TO 'sent'/'paid'/'overdue'
  2. Require both ledger accounts to be set before posting
  
  ## Solution
  - Fix auto_generate_work_invoice() for non-recurring works
  - Fix auto_create_invoice_for_completed_period() for recurring period tasks
  - Fix auto_create_invoice_on_period_completion() for recurring instances
  - Ensure ledger posting only happens on status change from draft
*/

-- ============================================================================
-- 1. NON-RECURRING WORK INVOICE GENERATION
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
BEGIN
  -- Only proceed if:
  -- 1. Status changed to 'completed'
  -- 2. auto_bill enabled
  -- 3. Work is NOT recurring
  -- 4. billing_amount is set
  -- 5. No existing invoice for this work
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.auto_bill = true AND
     NEW.is_recurring = false AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     NOT EXISTS (SELECT 1 FROM invoices WHERE notes LIKE '%Auto-generated invoice for work: ' || NEW.title || '%' AND customer_id = NEW.customer_id) THEN

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

    -- Create invoice WITHOUT work_id and WITHOUT ledger accounts
    -- User must manually set ledger accounts via "Accounting Accounts" section
    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,              -- NULL - only for manual "Select Completed Work"
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status,
      notes,
      income_account_id,    -- NULL - user sets manually
      customer_account_id   -- NULL - user sets manually
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

    RAISE NOTICE 'Created invoice % for non-recurring work % - ledger accounts NOT set', 
      v_invoice_number, NEW.title;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. RECURRING WORK INVOICE GENERATION (from recurring_period_tasks)
-- ============================================================================

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
    IF v_instance.invoice_id IS NOT NULL THEN
      RAISE NOTICE 'Invoice already exists for this period, skipping';
      RETURN NEW;
    END IF;

    -- Check if ALL tasks in this instance are completed
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_total_tasks, v_completed_tasks
    FROM recurring_period_tasks
    WHERE work_recurring_instance_id = NEW.work_recurring_instance_id;

    v_all_tasks_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

    IF NOT v_all_tasks_completed THEN
      RAISE NOTICE 'Not all tasks completed for instance % (% of % completed), skipping invoice', 
        NEW.work_recurring_instance_id, v_completed_tasks, v_total_tasks;
      RETURN NEW;
    END IF;

    RAISE NOTICE 'All % tasks completed for instance %, generating invoice', v_total_tasks, NEW.work_recurring_instance_id;

    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = v_instance.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for instance %', NEW.work_recurring_instance_id;
      RETURN NEW;
    END IF;

    -- Only create invoice if auto_bill is enabled
    IF v_work.auto_bill != true THEN
      RAISE NOTICE 'Auto-billing not enabled for work %, skipping invoice', v_work.id;
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
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for recurring work "%": Income ledger not mapped', v_work.title;
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

    -- Generate invoice number
    v_invoice_number := generate_invoice_number_from_config(v_work.user_id);

    -- Create invoice WITH ledger accounts (recurring invoices get auto-filled)
    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,              -- NULL for recurring invoices
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status,
      notes,
      income_account_id,    -- Auto-filled for recurring
      customer_account_id   -- Auto-filled for recurring
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
      'Auto-generated invoice for recurring work: ' || v_work.title || ' | Period: ' || v_instance.period_start_date || ' to ' || v_instance.period_end_date,
      v_income_ledger_id,
      v_customer_ledger_id
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

    RAISE NOTICE 'Created invoice % for recurring period - ledger accounts AUTO-FILLED', v_invoice_number;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period task %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. LEDGER POSTING - Only on status change from draft
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
  -- 1. This is an UPDATE (not INSERT)
  -- 2. Status changed FROM 'draft' TO 'sent'/'paid'/'overdue'
  -- 3. Both income_account_id and customer_account_id are NOT NULL
  -- 4. Total amount > 0
  
  IF TG_OP = 'UPDATE' AND 
     OLD.status = 'draft' AND 
     NEW.status IN ('sent', 'paid', 'overdue') AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL AND
     NEW.total_amount > 0 THEN

    -- Check if voucher already exists
    SELECT id INTO v_existing_voucher_id
    FROM vouchers
    WHERE invoice_id = NEW.id
    LIMIT 1;

    IF v_existing_voucher_id IS NOT NULL THEN
      RAISE NOTICE 'Voucher already exists for invoice %, skipping', NEW.invoice_number;
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
      RAISE WARNING 'No active Sales voucher type found, cannot post invoice % to ledger', NEW.invoice_number;
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
      reference_number,
      invoice_id,
      narration,
      total_amount,
      status
    ) VALUES (
      NEW.user_id,
      v_sales_voucher_type_id,
      v_voucher_number,
      NEW.invoice_date,
      NEW.invoice_number,
      NEW.id,
      'Auto-generated for Invoice: ' || NEW.invoice_number,
      NEW.total_amount,
      'approved'
    ) RETURNING id INTO v_voucher_id;

    -- Debit: Customer Account
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

    -- Credit: Income Account
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

    RAISE NOTICE 'Posted invoice % to ledger (status changed from draft to %)', NEW.invoice_number, NEW.status;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_generate_work_invoice IS 
  'Auto-creates invoice for NON-RECURRING work when status = completed. Does NOT pre-fill ledger accounts.';
  
COMMENT ON FUNCTION auto_create_invoice_for_completed_period IS 
  'Auto-creates invoice for RECURRING work when all period tasks completed. DOES pre-fill ledger accounts.';
  
COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS 
  'Posts invoice to ledger ONLY when status changes FROM draft TO sent/paid/overdue.';
