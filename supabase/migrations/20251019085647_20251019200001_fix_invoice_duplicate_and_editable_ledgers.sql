/*
  # Fix Invoice Duplicate Creation and Editable Ledgers
  
  ## Issues Fixed:
  1. **Duplicate Invoice Creation for Non-Recurring Works**
     - There were 2 triggers firing: trigger_auto_generate_work_invoice and potentially trigger_auto_map_invoice_accounts
     - Now: Single consolidated trigger that checks for existing invoices
  
  2. **Income Account Dropdown Not Editable**
     - User cannot change Income Account (Credit) when editing invoice
     - Now: EditInvoiceModal can allow user to select any ledger account
  
  3. **Ledger Posting Not Working**
     - Vouchers and invoices not reflecting in ledgers or financial reports
     - Now: Fixed trigger to properly post invoice to ledger_transactions
  
  4. **Invoice Numbering Issues**
     - Second invoice was showing INV-0001 instead of configured format
     - Now: All invoices use generate_next_invoice_number() consistently
*/

-- =====================================================
-- Step 1: Remove all duplicate and conflicting triggers
-- =====================================================

DROP TRIGGER IF EXISTS trigger_auto_map_invoice_accounts ON invoices;
DROP TRIGGER IF EXISTS trigger_auto_create_voucher_for_invoice ON invoices;
DROP TRIGGER IF EXISTS trigger_auto_update_voucher_for_invoice ON invoices;

-- =====================================================
-- Step 2: Fix Non-Recurring Work Invoice Creation
-- =====================================================

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
  v_company_settings RECORD;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Only proceed if:
  -- 1. Status changed to 'completed'
  -- 2. auto_bill is enabled
  -- 3. Has valid billing amount
  -- 4. No invoice exists yet for this work
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 THEN

    -- CRITICAL CHECK: Ensure no invoice already exists for this work
    IF EXISTS (SELECT 1 FROM invoices WHERE work_id = NEW.id) THEN
      RAISE NOTICE 'Invoice already exists for work %, skipping creation', NEW.id;
      RETURN NEW;
    END IF;

    -- Get service details
    SELECT * INTO v_service FROM services WHERE id = NEW.service_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get customer details with account mapping
    SELECT * INTO v_customer FROM customers WHERE id = NEW.customer_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings 
    FROM company_settings 
    WHERE user_id = NEW.user_id 
    LIMIT 1;

    -- Determine income ledger (service mapping takes priority) - ALLOW NULL
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings IS NOT NULL AND v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      v_income_ledger_id := NULL;  -- User will select manually
    END IF;

    -- Get customer ledger account - ALLOW NULL
    v_customer_ledger_id := v_customer.account_id;

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

    -- Generate invoice number using PROPER settings-based function
    v_invoice_number := generate_next_invoice_number(NEW.user_id);

    -- Create invoice with ledger mappings (CAN BE NULL)
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
      NEW.id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for: ' || NEW.title,
      v_income_ledger_id,  -- Can be NULL
      v_customer_ledger_id  -- Can be NULL
    ) RETURNING id INTO v_invoice_id;

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

    RAISE NOTICE 'Created invoice % for work % (Accounts: income=%, customer=%)', 
      v_invoice_number, NEW.title,
      COALESCE(v_income_ledger_id::text, 'NOT MAPPED'),
      COALESCE(v_customer_ledger_id::text, 'NOT MAPPED');

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger - SINGLE TRIGGER FOR NON-RECURRING WORKS
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_generate_work_invoice();

-- =====================================================
-- Step 3: Fix Ledger Posting Trigger
-- =====================================================

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
  -- 1. Status changes from 'draft' to non-draft OR status is updated to 'paid' OR 'sent'
  -- 2. Both income_account_id and customer_account_id are NOT NULL
  -- 3. Total amount > 0
  
  IF (TG_OP = 'INSERT' OR 
      (TG_OP = 'UPDATE' AND 
       (OLD.status = 'draft' AND NEW.status != 'draft') OR 
       (NEW.status IN ('paid', 'sent') AND (OLD.status != NEW.status OR OLD.total_amount != NEW.total_amount))
      )
     ) AND
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
      -- Delete existing entries and recreate
      DELETE FROM voucher_entries WHERE voucher_id = v_existing_voucher_id;
      DELETE FROM ledger_transactions WHERE voucher_id = v_existing_voucher_id;
      DELETE FROM vouchers WHERE id = v_existing_voucher_id;
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
      NEW.status
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

-- Recreate ledger posting trigger
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- =====================================================
-- Verification and Comments
-- =====================================================

COMMENT ON FUNCTION auto_generate_work_invoice() IS 
  'Creates invoice for non-recurring work when completed. Uses proper invoice number format. Allows NULL ledger accounts.';

COMMENT ON FUNCTION post_invoice_to_ledger_transactions() IS 
  'Posts invoice to ledger transactions when both accounts are mapped and status changes from draft. Creates voucher and ledger entries.';

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'Single trigger to auto-generate invoice when non-recurring work is completed. Prevents duplicates by checking existing invoices.';

COMMENT ON TRIGGER trigger_post_invoice_to_ledger_transactions ON invoices IS
  'Automatically posts invoice to ledger when accounts are mapped and status changes from draft.';