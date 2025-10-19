/*
  # Fix Non-Recurring Work Invoice Generation and Ledger Posting
  
  ## Problems Fixed
  1. Non-recurring work invoice should NOT auto-create when all tasks completed
  2. Invoice should auto-create ONLY when work status changes to 'completed'
  3. Auto-created invoice should NOT have work_id set (work_id is for manual "Select Completed Work")
  4. Auto-created invoice should NOT pre-fill income_account_id and customer_account_id
  5. Ledger posting should only happen when invoice status changes FROM draft to sent/paid/overdue
  
  ## Solution
  1. Update auto_generate_work_invoice() function to:
     - NOT set ledger accounts (leave NULL for user to set manually)
     - Set work_id to NULL (only manual linking should set work_id)
  2. Update post_invoice_to_ledger_transactions() to:
     - Only post when status changes FROM draft (not on initial creation)
     - This ensures draft invoices don't create ledger entries
  3. Ensure no task completion triggers invoice creation (only work completion does)
*/

-- Drop and recreate the auto_generate_work_invoice function
-- This creates invoices for non-recurring work when work status = completed
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
     NOT EXISTS (SELECT 1 FROM invoices WHERE notes LIKE '%Work: ' || NEW.title || '%' AND customer_id = NEW.customer_id) THEN

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

    -- Generate invoice number using unified config system
    v_invoice_number := generate_invoice_number_from_config(NEW.user_id);

    -- Create invoice WITHOUT work_id and WITHOUT ledger accounts
    -- User must manually set these via "Accounting Accounts" section
    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,              -- NULL - work_id is only for manual "Select Completed Work"
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status,
      notes,
      income_account_id,    -- NULL - user must set manually
      customer_account_id   -- NULL - user must set manually
    ) VALUES (
      NEW.user_id,
      NEW.customer_id,
      NULL,                 -- work_id is NULL for auto-generated invoices
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for work: ' || NEW.title,
      NULL,                 -- income_account_id is NULL - user sets manually
      NULL                  -- customer_account_id is NULL - user sets manually
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

    RAISE NOTICE 'Created invoice % (ID: %) for work % - Ledger accounts NOT set (user must set manually)', 
      v_invoice_number, v_invoice_id, NEW.title;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_generate_work_invoice IS 
  'Auto-creates draft invoice when non-recurring work status changes to completed. Does NOT set ledger accounts - user must set manually.';

-- Update post_invoice_to_ledger_transactions to ONLY post when status changes FROM draft
-- This prevents draft invoices from posting to ledger
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
  -- 1. Status changed FROM draft TO (sent/paid/overdue) - NOT on initial creation
  -- 2. Both income_account_id and customer_account_id are NOT NULL
  -- 3. Total amount > 0
  
  IF TG_OP = 'UPDATE' AND 
     OLD.status = 'draft' AND 
     NEW.status IN ('sent', 'paid', 'overdue') AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL AND
     NEW.total_amount > 0 THEN

    -- Check if voucher already exists for this invoice
    SELECT id INTO v_existing_voucher_id
    FROM vouchers
    WHERE invoice_id = NEW.id
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

    -- Create voucher with correct column names
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

    RAISE NOTICE 'Posted invoice % to ledger with voucher % (status changed from draft to %)', 
      NEW.invoice_number, v_voucher_number, NEW.status;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS 
  'Posts invoice to ledger only when status changes FROM draft TO sent/paid/overdue. Requires both income and customer accounts mapped.';

-- Ensure trigger exists (should already exist, but just in case)
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();

-- Ensure ledger posting trigger exists
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();
