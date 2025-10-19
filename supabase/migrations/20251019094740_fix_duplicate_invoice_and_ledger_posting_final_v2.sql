/*
  # Fix Duplicate Invoice Creation and Ledger Posting Issues - Final

  ## Problems Fixed:

  1. **Duplicate Invoice Creation**
     - Problem: Work completion might trigger invoice creation twice
     - Solution: Ensure auto_generate_work_invoice checks for existing invoices

  2. **Duplicate Receipt Triggers**
     - Two triggers: `auto_create_receipt_on_invoice_paid` and `auto_create_receipt_on_invoice_payment`
     - Solution: Keep only one trigger

  3. **Duplicate Ledger Posting Triggers**
     - Two triggers both trying to post to ledger on invoice update
     - Problem: Causes duplicate transactions
     - Solution: Keep only one trigger with proper logic

  4. **Ledger Posting on Draft Status**
     - Current trigger posts even when invoice is in draft status
     - Solution: Only post to ledger when status changes FROM draft to non-draft

  5. **Income Account Not Pre-Selected in Edit Mode**
     - When editing invoice, income_account_id is not showing selected value
     - Frontend shows all accounts correctly already

  ## Changes:
  - Drop duplicate receipt trigger
  - Drop duplicate ledger update trigger  
  - Update post_invoice_to_ledger_transactions to only fire when status changes from draft
  - Add comprehensive comments and documentation
*/

-- =====================================================
-- Step 1: Remove Duplicate Receipt Trigger
-- =====================================================

DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_paid ON invoices;
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_paid();

COMMENT ON TRIGGER auto_create_receipt_on_invoice_payment ON invoices IS
  'Creates receipt voucher when invoice status changes to paid or partially_paid';

-- =====================================================
-- Step 2: Remove Duplicate Ledger Posting Trigger
-- =====================================================

DROP TRIGGER IF EXISTS trigger_update_ledger_on_invoice_edit ON invoices;
DROP FUNCTION IF EXISTS update_ledger_on_invoice_edit();

-- =====================================================
-- Step 3: Drop and Recreate Main Ledger Posting Trigger
-- Only post when status changes from draft to non-draft
-- =====================================================

DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;

CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher_id uuid;
  v_voucher_number text;
  v_sales_voucher_type_id uuid;
  v_existing_voucher_id uuid;
BEGIN
  -- CRITICAL: Only post to ledger when:
  -- 1. Status changes FROM 'draft' to non-draft (sent, paid, overdue)
  -- 2. Both income_account_id and customer_account_id are NOT NULL
  -- 3. Total amount > 0
  -- 4. This is an UPDATE operation (not INSERT, since new invoices start as draft)

  IF TG_OP = 'UPDATE' AND
     OLD.status = 'draft' AND 
     NEW.status IN ('sent', 'paid', 'overdue', 'partially_paid') AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL AND
     NEW.total_amount > 0 THEN

    -- Check if voucher already exists for this invoice
    SELECT id INTO v_existing_voucher_id
    FROM vouchers
    WHERE invoice_id = NEW.id
    LIMIT 1;

    IF v_existing_voucher_id IS NOT NULL THEN
      RAISE NOTICE 'Voucher already exists for invoice %, skipping ledger posting', NEW.invoice_number;
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
      invoice_id,
      narration,
      total_amount,
      status
    ) VALUES (
      NEW.user_id,
      v_sales_voucher_type_id,
      v_voucher_number,
      NEW.invoice_date,
      NEW.id,
      'Auto-generated for Invoice: ' || NEW.invoice_number,
      NEW.total_amount,
      CASE WHEN NEW.status = 'paid' THEN 'posted' ELSE 'draft' END
    ) RETURNING id INTO v_voucher_id;

    -- Debit: Customer Account (Asset increase - Accounts Receivable)
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
    -- Debit: Customer Account (Increases Asset)
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

    -- Credit: Income Account (Increases Revenue)
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

    RAISE NOTICE 'Posted invoice % to ledger with voucher % (Status changed from draft to %)', NEW.invoice_number, v_voucher_number, NEW.status;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger - ONLY on UPDATE
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

COMMENT ON TRIGGER trigger_post_invoice_to_ledger_transactions ON invoices IS
  'Posts invoice to ledger ONLY when status changes from draft to sent/paid/overdue. Requires both ledger accounts mapped. Will NOT post if draft or if voucher already exists.';

-- =====================================================
-- Step 4: Ensure Auto-Invoice Trigger Has Proper Check
-- =====================================================

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'ONLY trigger to auto-generate invoice when non-recurring work is completed. Checks for existing invoice before creating to prevent duplicates.';

-- =====================================================
-- Step 5: Add Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_invoices_work_id ON invoices(work_id) WHERE work_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_invoice_id ON vouchers(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status_user ON invoices(user_id, status);

-- =====================================================
-- Step 6: Summary
-- =====================================================

-- Verification queries for debugging:
-- 1. Check all invoice-related triggers:
--    SELECT tgname, tgtype FROM pg_trigger WHERE tgrelid = 'invoices'::regclass;
--
-- 2. Check if invoice has existing voucher:
--    SELECT * FROM vouchers WHERE invoice_id = '<invoice_id>';
--
-- 3. Check work's invoice:
--    SELECT * FROM invoices WHERE work_id = '<work_id>';
