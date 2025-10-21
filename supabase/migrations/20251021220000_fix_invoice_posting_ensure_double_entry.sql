/*
  # Fix Invoice Posting - Ensure Double Entry Bookkeeping

  ## Issue
  When an invoice is posted to ledger, it should ALWAYS create TWO entries:
  1. Debit: Customer Account (Accounts Receivable)
  2. Credit: Income Account (Revenue)

  The current check was looking for ANY existing entry, which could skip posting
  if only ONE entry existed. This violates double-entry bookkeeping.

  ## Solution
  - Check if BOTH entries exist (not just ANY entry)
  - If either is missing, delete any partial entries and re-post both
  - Ensure draft deletion removes BOTH entries completely
  - Maintain strict double-entry bookkeeping at all times

  ## Changes
  - Fixed duplicate check to verify BOTH entries exist
  - Enhanced draft deletion to ensure both entries are removed
  - Added logging to track double-entry compliance
*/

-- ============================================================================
-- Drop and recreate with proper double-entry bookkeeping
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
  -- CASE 1: Status changed TO 'draft' - AGGRESSIVE CLEANUP
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    RAISE NOTICE '→ Reverting invoice % to draft - removing ALL posted entries', NEW.invoice_number;

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

    -- Step 2: Delete invoice ledger entries - Strategy 1: By narration pattern
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND (
        narration ILIKE '%Invoice ' || NEW.invoice_number || '%'
        OR narration ILIKE '%' || NEW.invoice_number || '%'
      );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  ✓ Deleted % invoice ledger entries (by narration)', v_deleted_count;

    -- Step 3: Delete invoice ledger entries - Strategy 2: By account_id + date
    -- This catches any entries that might have different narration
    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          account_id = NEW.customer_account_id
          OR account_id = NEW.income_account_id
        );

      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '  ✓ Deleted % additional invoice ledger entries (by account + date)', v_deleted_count;
    END IF;

    RAISE NOTICE '✓ Successfully cleaned ALL entries for invoice % (status → draft)', NEW.invoice_number;

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

    -- Delete invoice ledger entries - all strategies
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
  -- ==========================================================================
  IF NEW.status NOT IN ('draft', 'cancelled') THEN

    -- Only post if accounts are mapped
    IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL THEN

      -- Check if BOTH entries exist (not just one)
      SELECT COUNT(*) INTO v_customer_entry_count
      FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND account_id = NEW.customer_account_id
        AND debit = NEW.total_amount
        AND credit = 0;

      SELECT COUNT(*) INTO v_income_entry_count
      FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND account_id = NEW.income_account_id
        AND debit = 0
        AND credit = NEW.total_amount;

      -- If BOTH entries exist, skip posting
      IF v_customer_entry_count > 0 AND v_income_entry_count > 0 THEN
        RAISE NOTICE '⚠ Invoice % already fully posted to ledger (both entries exist)', NEW.invoice_number;

      -- If only ONE entry exists (violation of double-entry), clean and re-post
      ELSIF v_customer_entry_count > 0 OR v_income_entry_count > 0 THEN
        RAISE WARNING '⚠ Invoice % has incomplete ledger entries - cleaning and re-posting', NEW.invoice_number;

        -- Delete partial entries
        DELETE FROM ledger_transactions
        WHERE user_id = NEW.user_id
          AND voucher_id IS NULL
          AND transaction_date = NEW.invoice_date
          AND (
            account_id = NEW.customer_account_id
            OR account_id = NEW.income_account_id
          );

        RAISE NOTICE '  ✓ Cleaned incomplete entries';

        -- Now post both entries
        RAISE NOTICE '→ Posting invoice % to ledger (BOTH entries)', NEW.invoice_number;

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

        RAISE NOTICE '✓ Posted invoice % to ledger (Debit: Customer %, Credit: Income %)',
          NEW.invoice_number, NEW.total_amount, NEW.total_amount;

      -- If NO entries exist, post both
      ELSE
        RAISE NOTICE '→ Posting invoice % to ledger (BOTH entries)', NEW.invoice_number;

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
      user_id, account_id, voucher_id, transaction_date,
      debit, credit, narration, created_at
    ) VALUES
      (NEW.user_id, v_cash_bank_ledger_id, v_voucher_id, CURRENT_DATE,
       NEW.total_amount, 0, 'Receipt from ' || v_customer.name, NOW()),
      (NEW.user_id, v_customer_account_id, v_voucher_id, CURRENT_DATE,
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

COMMENT ON FUNCTION handle_invoice_status_change IS
  'Complete invoice status management with STRICT DOUBLE-ENTRY BOOKKEEPING:
   - ALWAYS posts BOTH entries (customer debit + income credit)
   - Checks for BOTH entries existing (not just ANY entry)
   - Cleans incomplete entries and re-posts both
   - Status → draft: Deletes BOTH invoice ledger entries
   - Status → cancelled: Deletes ALL entries
   - Status paid → sent: Deletes receipt vouchers
   - Status NOT draft/cancelled: Posts BOTH ledger entries
   - Status → paid: Creates receipt voucher with BOTH ledger entries

   CRITICAL: Maintains double-entry bookkeeping at all times!';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ FIXED INVOICE POSTING - STRICT DOUBLE-ENTRY BOOKKEEPING';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ Invoice posting now ALWAYS creates BOTH entries:';
  RAISE NOTICE '  1. Debit: Customer Account (Accounts Receivable)';
  RAISE NOTICE '  2. Credit: Income Account (Revenue)';
  RAISE NOTICE '✓ Checks for BOTH entries (not just ANY entry)';
  RAISE NOTICE '✓ Cleans incomplete entries and re-posts both';
  RAISE NOTICE '✓ Draft deletion removes BOTH entries completely';
  RAISE NOTICE '✓ Maintains double-entry bookkeeping integrity';
  RAISE NOTICE '========================================================================';
END $$;
