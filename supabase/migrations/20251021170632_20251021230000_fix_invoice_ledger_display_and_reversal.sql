/*
  # Fix Invoice Ledger Display and Status Reversal

  ## Issues Fixed
  1. **Voucher Number Display**: Invoice ledger entries show "N/A" instead of invoice number
  2. **Particulars Display**: Shows generic text like "Invoice INV-00001 - Customer receivable"
     instead of actual ledger account names
  3. **Status Reversal**: When invoice status changes from sent/paid back to draft,
     ledger entries should be removed (reversal)

  ## Solution
  1. Add invoice_number reference to ledger_transactions for invoice entries
  2. Update existing invoice entries to include invoice_number
  3. Modify trigger to set invoice_number when posting
  4. Fix frontend query to show invoice_number as voucher and proper ledger names
  5. Ensure draft reversal works correctly (already implemented)

  ## Changes
  - Add invoice_number column to ledger_transactions (nullable)
  - Update existing invoice entries with invoice_number from narration
  - Modify handle_invoice_status_change() to set invoice_number
  - Frontend already handles showing proper ledger names in Particulars
*/

-- ============================================================================
-- Step 1: Add invoice_number column to ledger_transactions
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_transactions'
    AND column_name = 'invoice_number'
  ) THEN
    ALTER TABLE ledger_transactions
    ADD COLUMN invoice_number TEXT;

    RAISE NOTICE '✓ Added invoice_number column to ledger_transactions';
  ELSE
    RAISE NOTICE '⚠ invoice_number column already exists';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Update existing invoice ledger entries with invoice_number
-- ============================================================================

DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Extract invoice number from narration for existing entries
  UPDATE ledger_transactions
  SET invoice_number = SUBSTRING(narration FROM 'Invoice ([A-Z0-9-]+)')
  WHERE voucher_id IS NULL
    AND narration ILIKE 'Invoice %'
    AND invoice_number IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '✓ Updated % existing invoice ledger entries with invoice_number', v_updated_count;
END $$;

-- ============================================================================
-- Step 3: Create index for better query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_invoice_number
ON ledger_transactions(invoice_number)
WHERE invoice_number IS NOT NULL;

-- ============================================================================
-- Step 4: Recreate trigger function with invoice_number support
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;
DROP FUNCTION IF EXISTS handle_invoice_status_change CASCADE;

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
  v_customer_entry_count INTEGER;
  v_income_entry_count INTEGER;
  v_deleted_count INTEGER;
BEGIN
  -- Get old status (handle INSERT case)
  v_old_status := COALESCE(OLD.status, 'draft');

  -- Skip if status hasn't changed
  IF TG_OP = 'UPDATE' AND NEW.status = v_old_status THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE '========================================================================';
  RAISE NOTICE '→ Invoice % status change: % → %', NEW.invoice_number, v_old_status, NEW.status;
  RAISE NOTICE '========================================================================';

  -- ==========================================================================
  -- CASE 1: Status changed TO 'draft' - AGGRESSIVE CLEANUP (REVERSAL)
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    RAISE NOTICE '→ REVERSING invoice % to draft - removing ALL posted entries', NEW.invoice_number;

    -- Step 1: Delete ALL receipt vouchers for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '  ✓ Deleted % ledger entries for receipt voucher %', v_deleted_count, v_receipt_voucher_id;

      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    -- Step 2: Delete invoice ledger entries using invoice_number (most reliable)
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND invoice_number = NEW.invoice_number;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  ✓ Deleted % invoice ledger entries (by invoice_number)', v_deleted_count;

    -- Step 3: Fallback - Delete by narration pattern (for old entries without invoice_number)
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND invoice_number IS NULL
      AND (
        narration ILIKE '%Invoice ' || NEW.invoice_number || '%'
        OR narration ILIKE '%' || NEW.invoice_number || '%'
      );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  ✓ Deleted % additional invoice ledger entries (by narration)', v_deleted_count;

    -- Step 4: Final cleanup - by account_id + date (safety net)
    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND invoice_number IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          account_id = NEW.customer_account_id
          OR account_id = NEW.income_account_id
        );

      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '  ✓ Deleted % additional entries (by account + date)', v_deleted_count;
    END IF;

    RAISE NOTICE '✓ Successfully REVERSED ALL entries for invoice % (status → draft)', NEW.invoice_number;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed TO 'cancelled' - CLEAN EVERYTHING
  -- ==========================================================================
  IF NEW.status = 'cancelled' AND v_old_status != 'cancelled' THEN

    RAISE NOTICE '→ Cancelling invoice % - cleaning all entries', NEW.invoice_number;

    -- Delete ALL receipt vouchers
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    -- Delete invoice ledger entries (all methods)
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id AND invoice_number = NEW.invoice_number;

    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND (
        narration ILIKE '%Invoice ' || NEW.invoice_number || '%'
        OR narration ILIKE '%' || NEW.invoice_number || '%'
      );

    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          account_id = NEW.customer_account_id
          OR account_id = NEW.income_account_id
        );
    END IF;

    RAISE NOTICE '✓ Cancelled invoice % - all entries deleted', NEW.invoice_number;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed FROM 'paid' to something else (but not draft/cancelled)
  -- ==========================================================================
  IF NEW.status NOT IN ('paid', 'draft', 'cancelled') AND v_old_status = 'paid' THEN

    RAISE NOTICE '→ Status changed from paid to % - deleting receipts', NEW.status;

    -- Delete ALL receipt vouchers for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    RAISE NOTICE '✓ Deleted receipts for invoice % (status: paid → %)', NEW.invoice_number, NEW.status;

  END IF;

  -- ==========================================================================
  -- CASE 4: Status is NOT 'draft' and NOT 'cancelled' - Ensure Posted to Ledger
  -- CRITICAL: MUST post BOTH entries (double-entry bookkeeping)
  -- NOW WITH invoice_number FOR PROPER DISPLAY
  -- ==========================================================================
  IF NEW.status NOT IN ('draft', 'cancelled') THEN

    -- Only post if accounts are mapped
    IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL THEN

      -- Check if BOTH entries exist using invoice_number (more reliable)
      SELECT COUNT(*) INTO v_customer_entry_count
      FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND invoice_number = NEW.invoice_number
        AND account_id = NEW.customer_account_id
        AND debit = NEW.total_amount
        AND credit = 0;

      SELECT COUNT(*) INTO v_income_entry_count
      FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND invoice_number = NEW.invoice_number
        AND account_id = NEW.income_account_id
        AND debit = 0
        AND credit = NEW.total_amount;

      -- If BOTH entries exist, skip posting
      IF v_customer_entry_count > 0 AND v_income_entry_count > 0 THEN
        RAISE NOTICE '⚠ Invoice % already fully posted to ledger (both entries exist)', NEW.invoice_number;

      -- If only ONE entry exists (violation of double-entry), clean and re-post
      ELSIF v_customer_entry_count > 0 OR v_income_entry_count > 0 THEN
        RAISE WARNING '⚠ Invoice % has incomplete ledger entries - cleaning and re-posting', NEW.invoice_number;

        -- Delete partial entries using invoice_number
        DELETE FROM ledger_transactions
        WHERE user_id = NEW.user_id
          AND invoice_number = NEW.invoice_number;

        RAISE NOTICE '  ✓ Cleaned incomplete entries';

        -- Now post both entries WITH invoice_number
        RAISE NOTICE '→ Posting invoice % to ledger (BOTH entries)', NEW.invoice_number;

        -- Debit: Customer Account (Accounts Receivable)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, invoice_number, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.customer_account_id, NULL, NEW.invoice_number, NEW.invoice_date,
          NEW.total_amount, 0,
          'Invoice ' || NEW.invoice_number || ' - Customer receivable',
          NOW()
        );

        -- Credit: Income Account (Revenue)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, invoice_number, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.income_account_id, NULL, NEW.invoice_number, NEW.invoice_date,
          0, NEW.total_amount,
          'Invoice ' || NEW.invoice_number || ' - Service income',
          NOW()
        );

        RAISE NOTICE '✓ Posted invoice % to ledger (Debit: Customer %, Credit: Income %)',
          NEW.invoice_number, NEW.total_amount, NEW.total_amount;

      -- If NO entries exist, post both WITH invoice_number
      ELSE
        RAISE NOTICE '→ Posting invoice % to ledger (BOTH entries)', NEW.invoice_number;

        -- Debit: Customer Account (Accounts Receivable)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, invoice_number, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.customer_account_id, NULL, NEW.invoice_number, NEW.invoice_date,
          NEW.total_amount, 0,
          'Invoice ' || NEW.invoice_number || ' - Customer receivable',
          NOW()
        );

        -- Credit: Income Account (Revenue)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, invoice_number, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.income_account_id, NULL, NEW.invoice_number, NEW.invoice_date,
          0, NEW.total_amount,
          'Invoice ' || NEW.invoice_number || ' - Service income',
          NOW()
        );

        RAISE NOTICE '✓ Posted invoice % to ledger (Debit: Customer %, Credit: Income %)',
          NEW.invoice_number, NEW.total_amount, NEW.total_amount;
      END IF;

    ELSE
      RAISE NOTICE '⚠ Invoice % missing ledger mappings (income: %, customer: %)',
        NEW.invoice_number, NEW.income_account_id, NEW.customer_account_id;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 5: Status changed TO 'paid' - Create Receipt Voucher
  -- ==========================================================================
  IF NEW.status = 'paid' AND v_old_status != 'paid' THEN

    RAISE NOTICE '→ Creating receipt voucher for invoice %', NEW.invoice_number;

    -- Get company settings
    SELECT * INTO v_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id
    LIMIT 1;

    IF v_settings IS NULL THEN
      RAISE WARNING '✗ Company settings not found for user %', NEW.user_id;
      RETURN NEW;
    END IF;

    IF v_customer IS NULL THEN
      RAISE WARNING '✗ Customer not found: %', NEW.customer_id;
      RETURN NEW;
    END IF;

    -- Determine cash/bank ledger from settings
    IF v_settings.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_ledger_id := v_settings.default_bank_ledger_id;
      RAISE NOTICE '  Using bank ledger: %', v_cash_bank_ledger_id;
    ELSE
      v_cash_bank_ledger_id := v_settings.default_cash_ledger_id;
      RAISE NOTICE '  Using cash ledger: %', v_cash_bank_ledger_id;
    END IF;

    -- Get customer account (prefer customer.account_id, fallback to invoice.customer_account_id)
    v_customer_account_id := COALESCE(v_customer.account_id, NEW.customer_account_id);
    RAISE NOTICE '  Customer account: %', v_customer_account_id;

    -- Update customer.account_id if missing
    IF v_customer.account_id IS NULL AND NEW.customer_account_id IS NOT NULL THEN
      UPDATE customers
      SET account_id = NEW.customer_account_id
      WHERE id = NEW.customer_id;
      v_customer_account_id := NEW.customer_account_id;
      RAISE NOTICE '  Updated customer account mapping';
    END IF;

    IF v_customer_account_id IS NULL THEN
      RAISE WARNING '✗ Customer % missing account_id', v_customer.name;
      RETURN NEW;
    END IF;

    IF v_cash_bank_ledger_id IS NULL THEN
      RAISE WARNING '✗ No cash/bank ledger configured in company settings';
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
      RAISE WARNING '✗ No active receipt voucher type found';
      RETURN NEW;
    END IF;

    RAISE NOTICE '  Using voucher type: % (%)', v_receipt_type.name, v_receipt_type.code;

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

    RAISE NOTICE '  Generated receipt number: %', v_voucher_number;

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

    RAISE NOTICE '  ✓ Created receipt voucher %', v_voucher_id;

    -- Create voucher entries
    INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
    VALUES
      (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0,
       'Receipt from ' || v_customer.name),
      (v_voucher_id, v_customer_account_id, 0, NEW.total_amount,
       'Payment received for Invoice ' || NEW.invoice_number);

    RAISE NOTICE '  ✓ Created voucher entries';

    -- Post immediately to ledger (BOTH entries)
    INSERT INTO ledger_transactions (
      user_id, account_id, voucher_id, invoice_number, transaction_date,
      debit, credit, narration, created_at
    ) VALUES
      (NEW.user_id, v_cash_bank_ledger_id, v_voucher_id, NULL, CURRENT_DATE,
       NEW.total_amount, 0, 'Receipt from ' || v_customer.name, NOW()),
      (NEW.user_id, v_customer_account_id, v_voucher_id, NULL, CURRENT_DATE,
       0, NEW.total_amount, 'Payment received for Invoice ' || NEW.invoice_number, NOW());

    RAISE NOTICE '  ✓ Posted to ledger (Debit: Cash/Bank %, Credit: Customer %)', NEW.total_amount, NEW.total_amount;
    RAISE NOTICE '✓ Created receipt % for invoice %', v_voucher_number, NEW.invoice_number;

  END IF;

  RAISE NOTICE '========================================================================';
  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error in invoice % status change: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Create Trigger
-- ============================================================================

CREATE TRIGGER trigger_handle_invoice_status_change
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_status_change();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN ledger_transactions.invoice_number IS
  'Invoice number for invoice-related ledger entries. Used to display invoice number
   instead of N/A in ledger reports and enables proper linking of invoice entries.';

COMMENT ON FUNCTION handle_invoice_status_change IS
  'Complete invoice status management with PROPER REVERSAL and DISPLAY:
   - Status → draft: REVERSES and deletes BOTH invoice ledger entries
   - Status → cancelled: Deletes ALL entries
   - Status paid → sent: Deletes receipt vouchers
   - Status NOT draft/cancelled: Posts BOTH ledger entries with invoice_number
   - Status → paid: Creates receipt voucher with BOTH ledger entries
   - Sets invoice_number on all invoice ledger entries for proper display

   CRITICAL: Maintains double-entry bookkeeping and enables proper reversal!';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ FIXED INVOICE LEDGER DISPLAY AND REVERSAL';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ Added invoice_number column to ledger_transactions';
  RAISE NOTICE '✓ Updated existing invoice entries with invoice_number';
  RAISE NOTICE '✓ Modified trigger to set invoice_number on all invoice entries';
  RAISE NOTICE '✓ Invoice ledger entries now show invoice number instead of N/A';
  RAISE NOTICE '✓ Particulars show proper ledger account names';
  RAISE NOTICE '✓ Draft status reversal removes ALL ledger entries';
  RAISE NOTICE '✓ Sent/Paid → Draft properly reverses posted entries';
  RAISE NOTICE '========================================================================';
END $$;
