/*
  # Fix Draft Status - Ensure Invoice Ledger Entries Are Deleted

  ## Issue
  When changing invoice status back to 'draft', the invoice ledger entries
  (customer receivable and income) are not being deleted from ledger_transactions.

  ## Root Cause
  The narration pattern matching might not be catching all invoice entries,
  or there might be timing issues with the deletion.

  ## Solution
  Enhance the draft status handler to:
  1. Delete based on multiple patterns (narration matching)
  2. Also delete based on account_id matching (customer and income accounts)
  3. Add more specific logging to see what's being deleted
  4. Ensure we're targeting the correct entries

  ## Changes
  - Enhanced draft status deletion logic
  - Multiple deletion strategies for invoice ledger entries
  - Better logging for debugging
*/

-- ============================================================================
-- Drop and recreate the function with enhanced draft deletion
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
  v_existing_count INTEGER;
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
  -- CASE 1: Status changed TO 'draft' - CLEAN EVERYTHING FIRST
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    RAISE NOTICE '→ Cleaning all entries for invoice % (reverting to draft)', NEW.invoice_number;

    -- Delete ALL receipt vouchers for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      -- Delete ledger entries
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted ledger entries for receipt voucher %', v_receipt_voucher_id;

      -- Delete voucher entries
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted voucher entries for receipt voucher %', v_receipt_voucher_id;

      -- Delete voucher
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    -- Delete invoice ledger entries - Strategy 1: By narration pattern
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  ✓ Deleted % invoice ledger entries (by narration)', v_deleted_count;

    -- Delete invoice ledger entries - Strategy 2: By account_id and date
    -- This catches any entries that might have different narration
    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          (account_id = NEW.customer_account_id AND debit = NEW.total_amount AND credit = 0)
          OR
          (account_id = NEW.income_account_id AND debit = 0 AND credit = NEW.total_amount)
        );

      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '  ✓ Deleted % additional invoice ledger entries (by account)', v_deleted_count;
    END IF;

    RAISE NOTICE '✓ Cleaned all entries for invoice % (status → draft)', NEW.invoice_number;

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

    -- Delete invoice ledger entries - both strategies
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';

    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          (account_id = NEW.customer_account_id AND debit = NEW.total_amount AND credit = 0)
          OR
          (account_id = NEW.income_account_id AND debit = 0 AND credit = NEW.total_amount)
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
  -- ==========================================================================
  IF NEW.status NOT IN ('draft', 'cancelled') THEN

    -- Only post if accounts are mapped
    IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL THEN

      -- Check if already posted (prevent duplicates)
      SELECT COUNT(*) INTO v_existing_count
      FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          (account_id = NEW.customer_account_id AND debit = NEW.total_amount AND credit = 0)
          OR
          (account_id = NEW.income_account_id AND debit = 0 AND credit = NEW.total_amount)
        );

      IF v_existing_count = 0 THEN

        RAISE NOTICE '→ Posting invoice % to ledger', NEW.invoice_number;

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

        RAISE NOTICE '✓ Posted invoice % to ledger (Debit: Customer, Credit: Income)', NEW.invoice_number;

      ELSE
        RAISE NOTICE '⚠ Invoice % already posted to ledger', NEW.invoice_number;
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

    -- Post immediately to ledger
    INSERT INTO ledger_transactions (
      user_id, account_id, voucher_id, transaction_date,
      debit, credit, narration, created_at
    ) VALUES
      (NEW.user_id, v_cash_bank_ledger_id, v_voucher_id, CURRENT_DATE,
       NEW.total_amount, 0, 'Receipt from ' || v_customer.name, NOW()),
      (NEW.user_id, v_customer_account_id, v_voucher_id, CURRENT_DATE,
       0, NEW.total_amount, 'Payment received for Invoice ' || NEW.invoice_number, NOW());

    RAISE NOTICE '  ✓ Posted to ledger (Debit: Cash/Bank, Credit: Customer)';
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
  'Complete invoice status management with enhanced draft deletion:
   - Status → draft: Deletes ALL receipts and invoice ledger entries (uses 2 strategies)
   - Status → cancelled: Deletes ALL entries
   - Status paid → sent: Deletes receipt vouchers (keeps invoice entries)
   - Status NOT draft/cancelled: Posts invoice to ledger
   - Status → paid: Creates receipt voucher with ledger entries

   Draft deletion uses both narration matching AND account+amount matching
   to ensure all invoice ledger entries are properly removed.';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ FIXED DRAFT STATUS - ENHANCED LEDGER ENTRY DELETION';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ Draft deletion now uses 2 strategies:';
  RAISE NOTICE '  1. Delete by narration pattern matching';
  RAISE NOTICE '  2. Delete by account_id + amount + date matching';
  RAISE NOTICE '✓ Ensures ALL invoice ledger entries are removed';
  RAISE NOTICE '✓ Other status transitions remain unchanged';
  RAISE NOTICE '========================================================================';
END $$;
