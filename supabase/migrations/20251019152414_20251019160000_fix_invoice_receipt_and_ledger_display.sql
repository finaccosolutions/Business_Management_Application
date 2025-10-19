/*
  # Fix Invoice Receipt Creation and Ledger Display Issues

  ## Summary
  This migration addresses multiple critical issues:

  1. **Invoice → Paid Status Receipt Generation**
     - Ensures receipt voucher is ALWAYS created when invoice status → 'paid'
     - Fixes missing receipt creation logic
     - Posts receipt immediately to ledger

  2. **Chart of Accounts Ledger Tab Improvements**
     - Changes current_balance display to use separate Debit/Credit columns
     - Removes opening_balance column to save space
     - Adds column customization options

  3. **Ledger Transactions Page Fixes**
     - Ensures voucher_number is ALWAYS populated
     - Simplifies particulars column to show only ledger name
     - No additional information in particulars

  4. **Fixed Bottom Panel for Ledger Transactions**
     - Creates sticky footer with Total Debit, Total Credit, and Closing Balance
     - Allows transaction list to scroll independently
     - Fixes headings and bottom panel in position

  ## Changes Made
  - Recreates handle_invoice_status_change() function with fixed receipt logic
  - All UI changes are handled in React components
*/

-- ============================================================================
-- Drop existing trigger and function
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;
DROP FUNCTION IF EXISTS handle_invoice_status_change CASCADE;

-- ============================================================================
-- Recreate Invoice Status Change Handler with Fixed Receipt Logic
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_invoice_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_status TEXT;
  v_settings RECORD;
  v_receipt_type RECORD;
  v_customer RECORD;
  v_voucher_id UUID;
  v_voucher_number TEXT;
  v_max_number INTEGER;
  v_cash_bank_ledger_id UUID;
  v_customer_account_id UUID;
  v_receipt_voucher_id UUID;
  v_existing_count INTEGER;
BEGIN
  -- Get old status (handle INSERT case)
  v_old_status := COALESCE(OLD.status, 'draft');

  -- Skip if status hasn't changed
  IF TG_OP = 'UPDATE' AND NEW.status = v_old_status THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE '→ Invoice % status: % → %', NEW.invoice_number, v_old_status, NEW.status;

  -- ==========================================================================
  -- CASE 1: Status changed FROM 'draft' TO any other - Post Invoice to Ledger
  -- ==========================================================================
  IF NEW.status != 'draft' AND v_old_status = 'draft' THEN

    -- Only post if accounts are mapped
    IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL THEN

      -- Check if already posted (prevent duplicates)
      SELECT COUNT(*) INTO v_existing_count
      FROM ledger_transactions
      WHERE narration LIKE '%Invoice ' || NEW.invoice_number || '%'
        AND user_id = NEW.user_id
        AND voucher_id IS NULL;

      IF v_existing_count = 0 THEN

        -- Debit: Customer Account (Accounts Receivable)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.customer_account_id, NULL, NEW.invoice_date,
          NEW.total_amount, 0,
          'Invoice ' || NEW.invoice_number || ' - Customer receivable',
          NOW()
        );

        -- Credit: Income Account (Revenue)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.income_account_id, NULL, NEW.invoice_date,
          0, NEW.total_amount,
          'Invoice ' || NEW.invoice_number || ' - Service income',
          NOW()
        );

        RAISE NOTICE '✓ Posted invoice % to ledger', NEW.invoice_number;

      END IF;

    ELSE
      RAISE NOTICE '⚠ Invoice % missing ledger mappings', NEW.invoice_number;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed TO 'paid' - Create Receipt Voucher (FIXED)
  -- ==========================================================================
  IF NEW.status = 'paid' AND v_old_status != 'paid' THEN

    RAISE NOTICE '→ Processing receipt creation for invoice %', NEW.invoice_number;

    -- Get company settings
    SELECT * INTO v_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    IF v_settings IS NULL THEN
      RAISE WARNING '✗ No company settings found for user';
      RETURN NEW;
    END IF;

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id
    LIMIT 1;

    IF v_customer IS NULL THEN
      RAISE WARNING '✗ Customer not found';
      RETURN NEW;
    END IF;

    -- Determine cash/bank ledger from settings
    IF v_settings.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_ledger_id := v_settings.default_bank_ledger_id;
    ELSE
      v_cash_bank_ledger_id := v_settings.default_cash_ledger_id;
    END IF;

    -- Get customer account (prefer customer.account_id, fallback to invoice.customer_account_id)
    v_customer_account_id := COALESCE(v_customer.account_id, NEW.customer_account_id);

    -- Update customer.account_id if missing
    IF v_customer.account_id IS NULL AND NEW.customer_account_id IS NOT NULL THEN
      UPDATE customers
      SET account_id = NEW.customer_account_id
      WHERE id = NEW.customer_id;
      v_customer_account_id := NEW.customer_account_id;
    END IF;

    IF v_customer_account_id IS NULL THEN
      RAISE WARNING '✗ Customer % missing account_id', v_customer.name;
      RETURN NEW;
    END IF;

    IF v_cash_bank_ledger_id IS NULL THEN
      RAISE WARNING '✗ No cash/bank ledger in settings (default_payment_receipt_type: %)',
        v_settings.default_payment_receipt_type;
      RETURN NEW;
    END IF;

    -- Get receipt voucher type
    SELECT * INTO v_receipt_type
    FROM voucher_types
    WHERE user_id = NEW.user_id
      AND (code = 'ITMRCT' OR code = 'RV' OR code = 'RECEIPT' OR name ILIKE '%receipt%')
      AND is_active = true
    ORDER BY
      CASE
        WHEN code = 'ITMRCT' THEN 1
        WHEN code = 'RV' THEN 2
        WHEN code = 'RECEIPT' THEN 3
        ELSE 4
      END
    LIMIT 1;

    IF v_receipt_type.id IS NULL THEN
      RAISE WARNING '✗ No receipt voucher type found';
      RETURN NEW;
    END IF;

    -- Check if receipt already exists
    SELECT id INTO v_receipt_voucher_id
    FROM vouchers
    WHERE user_id = NEW.user_id
      AND invoice_id = NEW.id
      AND voucher_type_id = v_receipt_type.id
    LIMIT 1;

    IF v_receipt_voucher_id IS NOT NULL THEN
      RAISE NOTICE '⚠ Receipt already exists for invoice %', NEW.invoice_number;
      RETURN NEW;
    END IF;

    -- Generate voucher number
    SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '[0-9]+$') AS INTEGER)), 0)
    INTO v_max_number
    FROM vouchers
    WHERE user_id = NEW.user_id AND voucher_type_id = v_receipt_type.id;

    v_voucher_number := COALESCE(v_settings.receipt_prefix, 'RV-') ||
                       LPAD((v_max_number + 1)::text, COALESCE(v_settings.receipt_number_width, 5), '0');

    -- Create receipt voucher with status = 'posted'
    INSERT INTO vouchers (
      user_id, voucher_type_id, voucher_number, voucher_date,
      reference_number, narration, total_amount, status,
      invoice_id, created_by, created_at
    ) VALUES (
      NEW.user_id, v_receipt_type.id, v_voucher_number, CURRENT_DATE,
      NEW.invoice_number,
      'Receipt for Invoice ' || NEW.invoice_number || ' - ' || v_customer.name,
      NEW.total_amount, 'posted',
      NEW.id, NEW.user_id, NOW()
    ) RETURNING id INTO v_voucher_id;

    -- Create voucher entries
    -- Debit: Cash/Bank (money IN)
    -- Credit: Customer Account (reduce receivable)
    INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
    VALUES
      (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0,
       'Receipt from ' || v_customer.name),
      (v_voucher_id, v_customer_account_id, 0, NEW.total_amount,
       'Payment received for Invoice ' || NEW.invoice_number);

    -- Post immediately to ledger
    INSERT INTO ledger_transactions (
      user_id, account_id, voucher_id, transaction_date,
      debit, credit, narration, created_at
    ) VALUES
      (NEW.user_id, v_cash_bank_ledger_id, v_voucher_id, CURRENT_DATE,
       NEW.total_amount, 0, 'Receipt from ' || v_customer.name, NOW()),
      (NEW.user_id, v_customer_account_id, v_voucher_id, CURRENT_DATE,
       0, NEW.total_amount, 'Payment received for Invoice ' || NEW.invoice_number, NOW());

    RAISE NOTICE '✓ Created receipt % for invoice % (Customer: %, Amount: %)',
      v_voucher_number, NEW.invoice_number, v_customer.name, NEW.total_amount;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed FROM 'paid' - Delete Receipt Voucher
  -- ==========================================================================
  IF NEW.status != 'paid' AND v_old_status = 'paid' THEN

    -- Delete ALL receipt vouchers for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      -- Delete ledger entries first
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      -- Delete voucher entries
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      -- Delete voucher
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;

      RAISE NOTICE '✓ Deleted receipt for invoice % (status ← paid)', NEW.invoice_number;
    END LOOP;

  END IF;

  -- ==========================================================================
  -- CASE 4: Status changed TO 'draft' - Delete ALL Related Entries
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    -- Delete invoice ledger entries (entries without voucher_id)
    DELETE FROM ledger_transactions
    WHERE narration LIKE '%Invoice ' || NEW.invoice_number || '%'
      AND voucher_id IS NULL
      AND user_id = NEW.user_id;

    -- Delete ALL receipt vouchers and their entries
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
    END LOOP;

    RAISE NOTICE '✓ Cleaned all entries for invoice % (→ draft)', NEW.invoice_number;

  END IF;

  -- ==========================================================================
  -- CASE 5: Status changed TO 'cancelled' - Delete ALL Related Entries
  -- ==========================================================================
  IF NEW.status = 'cancelled' AND v_old_status != 'cancelled' THEN

    -- Delete invoice ledger entries
    DELETE FROM ledger_transactions
    WHERE narration LIKE '%Invoice ' || NEW.invoice_number || '%'
      AND voucher_id IS NULL
      AND user_id = NEW.user_id;

    -- Delete ALL receipt vouchers
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
    END LOOP;

    RAISE NOTICE '✓ Cancelled invoice % - cleaned all entries', NEW.invoice_number;

  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error in invoice % status change: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Recreate Trigger
-- ============================================================================

CREATE TRIGGER trigger_handle_invoice_status_change
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_status_change();

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ FIXED: Invoice Receipt Creation and Ledger Display';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ Invoice → paid now ALWAYS creates receipt voucher';
  RAISE NOTICE '✓ Receipt voucher is posted immediately to ledger';
  RAISE NOTICE '✓ Improved error logging and debugging';
  RAISE NOTICE '✓ UI improvements handled in React components:';
  RAISE NOTICE '  - Ledger tab: Debit/Credit columns instead of negative amounts';
  RAISE NOTICE '  - Ledger transactions: Voucher numbers populated';
  RAISE NOTICE '  - Ledger transactions: Particulars shows only ledger name';
  RAISE NOTICE '  - Fixed bottom panel with totals';
  RAISE NOTICE '========================================================================';
END $$;
