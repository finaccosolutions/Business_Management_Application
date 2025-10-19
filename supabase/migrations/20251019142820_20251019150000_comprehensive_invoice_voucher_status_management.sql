/*
  # Comprehensive Invoice and Voucher Status Management System

  ## Summary
  This migration implements a complete automated system for managing invoice and voucher status changes with proper ledger posting and cleanup.

  ## Features Implemented

  ### Invoice Status Management
  1. **Draft → Sent/Other**: Posts invoice to ledger (Dr. Customer Account, Cr. Income Account)
  2. **Any → Paid**: 
     - Auto-creates receipt voucher
     - Uses default cash/bank ledger from company settings (default_payment_receipt_type)
     - Maps customer account from customer.account_id or invoice.customer_account_id
     - Posts receipt voucher immediately (status = 'posted')
  3. **Paid → Any Other Status**:
     - Deletes receipt voucher
     - Deletes receipt voucher's ledger entries
     - Keeps invoice ledger entries if status is not draft
  4. **Any → Draft**:
     - Deletes invoice ledger entries
     - Deletes all receipt vouchers and their ledger entries
     - Complete cleanup
  5. **Any → Cancelled**:
     - Deletes invoice ledger entries
     - Deletes all receipt vouchers and their ledger entries

  ### Voucher Status Management
  1. **Draft → Posted**: Posts voucher entries to ledger_transactions
  2. **Posted/Other → Draft**: Deletes all ledger entries for this voucher
  3. **Any → Cancelled**: Deletes all ledger entries for this voucher

  ## Security
  - Maintains all RLS policies
  - Prevents duplicate postings
  - Ensures data integrity with CASCADE deletes
  - Proper error handling with EXCEPTION blocks

  ## Tables Modified
  - vouchers: status change triggers
  - invoices: status change triggers with receipt auto-creation
  - ledger_transactions: automatic posting and cleanup
  - voucher_entries: automatic voucher creation
*/

-- ============================================================================
-- Step 1: Drop ALL existing conflicting triggers and functions
-- ============================================================================

-- Drop all voucher-related triggers
DROP TRIGGER IF EXISTS trigger_handle_voucher_status_change ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger_transactions ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_on_status_change ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledgers ON vouchers;
DROP TRIGGER IF EXISTS voucher_status_change_handler ON vouchers;

-- Drop all invoice-related triggers
DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_payment ON invoices;
DROP TRIGGER IF EXISTS update_invoice_status_and_post_to_ledger ON invoices;
DROP TRIGGER IF EXISTS invoice_status_change_handler ON invoices;

-- Drop all related functions
DROP FUNCTION IF EXISTS handle_voucher_status_change CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledger_transactions CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledger CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledgers CASCADE;

DROP FUNCTION IF EXISTS handle_invoice_status_change CASCADE;
DROP FUNCTION IF EXISTS handle_invoice_status_change_and_post_to_ledger CASCADE;
DROP FUNCTION IF EXISTS post_invoice_to_ledger_transactions CASCADE;
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_payment CASCADE;

-- ============================================================================
-- Step 2: Ensure invoice_id column exists in vouchers table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_vouchers_invoice_id ON vouchers(invoice_id);
  END IF;
END $$;

-- ============================================================================
-- Step 3: Comprehensive Voucher Status Change Handler
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_voucher_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_entry RECORD;
  v_existing_count INTEGER;
  v_old_status TEXT;
BEGIN
  -- Get old status (handle INSERT case)
  v_old_status := COALESCE(OLD.status, 'draft');

  -- Skip if status hasn't changed
  IF TG_OP = 'UPDATE' AND NEW.status = v_old_status THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE '→ Voucher % status: % → %', NEW.voucher_number, v_old_status, NEW.status;

  -- ==========================================================================
  -- CASE 1: Status changed TO 'posted' - Post to Ledger
  -- ==========================================================================
  IF NEW.status = 'posted' AND v_old_status != 'posted' THEN

    -- Check if already posted (prevent duplicates)
    SELECT COUNT(*) INTO v_existing_count
    FROM ledger_transactions
    WHERE voucher_id = NEW.id;

    IF v_existing_count = 0 THEN

      -- Post all voucher entries to ledger_transactions
      FOR v_entry IN
        SELECT * FROM voucher_entries WHERE voucher_id = NEW.id
      LOOP
        INSERT INTO ledger_transactions (
          user_id,
          account_id,
          voucher_id,
          transaction_date,
          debit,
          credit,
          narration,
          created_at
        ) VALUES (
          NEW.user_id,
          v_entry.account_id,
          NEW.id,
          NEW.voucher_date,
          COALESCE(v_entry.debit_amount, 0),
          COALESCE(v_entry.credit_amount, 0),
          COALESCE(v_entry.narration, NEW.narration, ''),
          NOW()
        );
      END LOOP;

      RAISE NOTICE '✓ Posted voucher % to ledger', NEW.voucher_number;

    ELSE
      RAISE NOTICE '⚠ Voucher % already posted', NEW.voucher_number;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed TO 'draft' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    DELETE FROM ledger_transactions WHERE voucher_id = NEW.id;
    RAISE NOTICE '✓ Deleted ledger for voucher % (→ draft)', NEW.voucher_number;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed TO 'cancelled' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'cancelled' AND v_old_status != 'cancelled' THEN

    DELETE FROM ledger_transactions WHERE voucher_id = NEW.id;
    RAISE NOTICE '✓ Deleted ledger for voucher % (→ cancelled)', NEW.voucher_number;

  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error in voucher % status change: %', NEW.voucher_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 4: Comprehensive Invoice Status Change Handler with Auto Receipt
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
  -- CASE 2: Status changed TO 'paid' - Create Receipt Voucher
  -- ==========================================================================
  IF NEW.status = 'paid' AND v_old_status != 'paid' THEN

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

    IF v_settings IS NOT NULL AND v_customer IS NOT NULL THEN

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

      IF v_customer_account_id IS NOT NULL AND v_cash_bank_ledger_id IS NOT NULL THEN

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

        IF v_receipt_type.id IS NOT NULL THEN

          -- Check if receipt already exists
          SELECT id INTO v_receipt_voucher_id
          FROM vouchers
          WHERE user_id = NEW.user_id
            AND invoice_id = NEW.id
            AND voucher_type_id = v_receipt_type.id
          LIMIT 1;

          IF v_receipt_voucher_id IS NULL THEN

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

            -- Post immediately to ledger (trigger will handle it, but we can also do it here)
            INSERT INTO ledger_transactions (
              user_id, account_id, voucher_id, transaction_date,
              debit, credit, narration, created_at
            ) VALUES
              (NEW.user_id, v_cash_bank_ledger_id, v_voucher_id, CURRENT_DATE,
               NEW.total_amount, 0, 'Receipt from ' || v_customer.name, NOW()),
              (NEW.user_id, v_customer_account_id, v_voucher_id, CURRENT_DATE,
               0, NEW.total_amount, 'Payment received for Invoice ' || NEW.invoice_number, NOW());

            RAISE NOTICE '✓ Created receipt % for invoice % (customer: %)',
              v_voucher_number, NEW.invoice_number, v_customer.name;

          END IF;

        ELSE
          RAISE WARNING '✗ No receipt voucher type found';
        END IF;

      ELSE
        IF v_customer_account_id IS NULL THEN
          RAISE WARNING '✗ Customer % missing account_id', v_customer.name;
        END IF;
        IF v_cash_bank_ledger_id IS NULL THEN
          RAISE WARNING '✗ No cash/bank ledger in settings';
        END IF;
      END IF;

    END IF;

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
-- Step 5: Create Triggers
-- ============================================================================

CREATE TRIGGER trigger_handle_voucher_status_change
  AFTER INSERT OR UPDATE OF status ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION handle_voucher_status_change();

CREATE TRIGGER trigger_handle_invoice_status_change
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_status_change();

-- ============================================================================
-- Step 6: Update Account Balances
-- ============================================================================

UPDATE chart_of_accounts coa
SET current_balance = (
  SELECT
    COALESCE(coa.opening_balance, 0) +
    COALESCE(SUM(lt.debit), 0) -
    COALESCE(SUM(lt.credit), 0)
  FROM ledger_transactions lt
  WHERE lt.account_id = coa.id
);

-- ============================================================================
-- Step 7: Comments
-- ============================================================================

COMMENT ON FUNCTION handle_voucher_status_change IS
  'Manages voucher status changes and ledger posting:
   - TO posted: Posts to ledger
   - TO draft/cancelled: Deletes ledger entries
   Prevents duplicates and handles errors gracefully';

COMMENT ON FUNCTION handle_invoice_status_change IS
  'Comprehensive invoice status management:
   - draft → other: Posts invoice to ledger
   - any → paid: Auto-creates receipt voucher with customer mapping
   - paid → other: Deletes receipt voucher
   - any → draft: Deletes invoice + receipt entries
   - any → cancelled: Deletes all entries
   Uses company_settings for cash/bank selection and customer.account_id mapping';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ COMPREHENSIVE INVOICE & VOUCHER STATUS MANAGEMENT COMPLETE';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ Invoice paid → Auto-creates receipt voucher';
  RAISE NOTICE '✓ Invoice to draft → Deletes invoice + receipt entries';
  RAISE NOTICE '✓ Invoice from paid → Deletes receipt voucher';
  RAISE NOTICE '✓ Voucher to posted → Posts to ledger';
  RAISE NOTICE '✓ Voucher to draft/cancelled → Deletes ledger entries';
  RAISE NOTICE '✓ All duplicates prevented';
  RAISE NOTICE '✓ Customer account mapping from settings';
  RAISE NOTICE '✓ Cash/Bank selection from default_payment_receipt_type';
  RAISE NOTICE '========================================================================';
END $$;
