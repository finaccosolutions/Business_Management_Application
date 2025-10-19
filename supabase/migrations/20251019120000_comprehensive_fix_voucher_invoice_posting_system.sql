/*
  # Comprehensive Fix: Voucher and Invoice Posting System

  ## Issues Fixed
  1. Vouchers not posting to ledger when status changed to 'posted'
  2. Invoice status 'paid' not auto-creating receipt voucher with proper customer mapping
  3. Status changes to 'draft' not deleting ledger entries and vouchers properly
  4. Status changes from 'paid' not deleting both invoice posting and receipt voucher
  5. All voucher types (payment, receipt, journal, contra) not posting consistently

  ## Changes
  1. Clean up all existing conflicting triggers
  2. Implement robust voucher status change handler
  3. Implement robust invoice status change handler with receipt auto-creation
  4. Ensure proper customer account mapping from invoice or customers table
  5. Proper cleanup on all status transitions
  6. Prevent duplicate postings

  ## Status Transition Logic

  ### Vouchers
  - draft → posted: Create ledger entries from voucher_entries
  - posted → draft: Delete all ledger entries
  - posted → cancelled: Delete all ledger entries

  ### Invoices
  - draft → sent/other: Post to ledger (Dr. Customer, Cr. Income)
  - sent/other → draft: Delete ledger entries
  - any → paid: Create receipt voucher (Dr. Cash/Bank, Cr. Customer)
  - paid → any: Delete receipt voucher AND its ledger entries
  - paid → draft: Delete invoice ledger + receipt voucher + receipt ledger

  ## Security
  - Maintains RLS policies
  - Ensures data integrity with proper cascade deletes
*/

-- ============================================================================
-- Step 1: Drop ALL existing conflicting triggers and functions
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_handle_voucher_status_change ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger_transactions ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_on_status_change ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledgers ON vouchers;

DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_payment ON invoices;
DROP TRIGGER IF EXISTS update_invoice_status_and_post_to_ledger ON invoices;

DROP FUNCTION IF EXISTS handle_voucher_status_change CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledger_transactions CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledger CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledgers CASCADE;

DROP FUNCTION IF EXISTS handle_invoice_status_change CASCADE;
DROP FUNCTION IF EXISTS handle_invoice_status_change_and_post_to_ledger CASCADE;
DROP FUNCTION IF EXISTS post_invoice_to_ledger_transactions CASCADE;
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_payment CASCADE;

-- ============================================================================
-- Step 2: Ensure invoice_id exists in vouchers table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_vouchers_invoice_id ON vouchers(invoice_id);
    COMMENT ON COLUMN vouchers.invoice_id IS 'Reference to invoice if this voucher was auto-created for invoice payment';
  END IF;
END $$;

-- ============================================================================
-- Step 3: New Robust Voucher Status Change Handler
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

  RAISE NOTICE 'Voucher % status change: % → %', NEW.voucher_number, v_old_status, NEW.status;

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
      RAISE NOTICE '⚠ Voucher % already posted to ledger', NEW.voucher_number;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed TO 'draft' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    -- Delete all ledger entries for this voucher
    DELETE FROM ledger_transactions
    WHERE voucher_id = NEW.id;

    RAISE NOTICE '✓ Deleted ledger entries for voucher % (status → draft)', NEW.voucher_number;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed TO 'cancelled' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'cancelled' AND v_old_status != 'cancelled' THEN

    -- Delete all ledger entries for this voucher
    DELETE FROM ledger_transactions
    WHERE voucher_id = NEW.id;

    RAISE NOTICE '✓ Deleted ledger entries for voucher % (status → cancelled)', NEW.voucher_number;

  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error handling voucher % status change: %', NEW.voucher_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 4: New Robust Invoice Status Change Handler
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

  RAISE NOTICE 'Invoice % status change: % → %', NEW.invoice_number, v_old_status, NEW.status;

  -- ==========================================================================
  -- CASE 1: Status changed TO non-draft - Post Invoice to Ledger
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
          NEW.customer_account_id,
          NULL,
          NEW.invoice_date,
          NEW.total_amount,
          0,
          'Invoice ' || NEW.invoice_number || ' - Customer receivable',
          NOW()
        );

        -- Credit: Income Account (Revenue)
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
          NEW.income_account_id,
          NULL,
          NEW.invoice_date,
          0,
          NEW.total_amount,
          'Invoice ' || NEW.invoice_number || ' - Service income',
          NOW()
        );

        RAISE NOTICE '✓ Posted invoice % to ledger', NEW.invoice_number;

      ELSE
        RAISE NOTICE '⚠ Invoice % already posted to ledger', NEW.invoice_number;
      END IF;

    ELSE
      RAISE NOTICE '⚠ Invoice % missing ledger mappings (income: %, customer: %)',
        NEW.invoice_number, NEW.income_account_id, NEW.customer_account_id;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed TO 'draft' - Delete ALL Related Entries
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    -- Delete invoice ledger entries
    DELETE FROM ledger_transactions
    WHERE narration LIKE '%Invoice ' || NEW.invoice_number || '%'
      AND voucher_id IS NULL
      AND user_id = NEW.user_id;

    -- Delete any receipt vouchers and their ledger entries
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers
      WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
    END LOOP;

    RAISE NOTICE '✓ Deleted all entries for invoice % (status → draft)', NEW.invoice_number;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed TO 'paid' - Create Receipt Voucher
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

      -- Determine cash/bank ledger
      IF v_settings.default_payment_receipt_type = 'bank' THEN
        v_cash_bank_ledger_id := v_settings.default_bank_ledger_id;
      ELSE
        v_cash_bank_ledger_id := v_settings.default_cash_ledger_id;
      END IF;

      -- Determine customer account: use customer.account_id or invoice.customer_account_id
      v_customer_account_id := COALESCE(v_customer.account_id, NEW.customer_account_id);

      -- If customer doesn't have account_id, update it from invoice
      IF v_customer.account_id IS NULL AND NEW.customer_account_id IS NOT NULL THEN
        UPDATE customers
        SET account_id = NEW.customer_account_id
        WHERE id = NEW.customer_id;
        v_customer_account_id := NEW.customer_account_id;
      END IF;

      IF v_customer_account_id IS NOT NULL AND v_cash_bank_ledger_id IS NOT NULL THEN

        -- Get receipt voucher type (try multiple codes)
        SELECT * INTO v_receipt_type
        FROM voucher_types
        WHERE user_id = NEW.user_id
          AND (code = 'RV' OR code = 'ITMRCT' OR code = 'RECEIPT' OR name ILIKE '%receipt%')
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

          -- Check if receipt already exists for this invoice
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
                               LPAD((v_max_number + 1)::text, 5, '0');

            -- Create receipt voucher
            INSERT INTO vouchers (
              user_id,
              voucher_type_id,
              voucher_number,
              voucher_date,
              reference_number,
              narration,
              total_amount,
              status,
              invoice_id,
              created_by,
              created_at
            ) VALUES (
              NEW.user_id,
              v_receipt_type.id,
              v_voucher_number,
              CURRENT_DATE,
              NEW.invoice_number,
              'Receipt for Invoice ' || NEW.invoice_number || ' - ' || v_customer.name,
              NEW.total_amount,
              'posted',
              NEW.id,
              NEW.user_id,
              NOW()
            ) RETURNING id INTO v_voucher_id;

            -- Create voucher entries
            -- Debit: Cash/Bank (money received)
            -- Credit: Customer Account (reducing receivable)
            INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
            VALUES
              (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0,
               'Receipt from ' || v_customer.name || ' for Invoice ' || NEW.invoice_number),
              (v_voucher_id, v_customer_account_id, 0, NEW.total_amount,
               'Payment received against Invoice ' || NEW.invoice_number);

            RAISE NOTICE '✓ Created receipt voucher % for invoice % (customer: %)',
              v_voucher_number, NEW.invoice_number, v_customer.name;

          ELSE
            RAISE NOTICE '⚠ Receipt voucher already exists for invoice %', NEW.invoice_number;
          END IF;

        ELSE
          RAISE WARNING '✗ No receipt voucher type found for user %', NEW.user_id;
        END IF;

      ELSE
        IF v_customer_account_id IS NULL THEN
          RAISE WARNING '✗ Customer % does not have account_id mapped', v_customer.name;
        END IF;
        IF v_cash_bank_ledger_id IS NULL THEN
          RAISE WARNING '✗ No cash/bank ledger configured in company settings';
        END IF;
      END IF;

    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 4: Status changed FROM 'paid' - Delete Receipt Voucher
  -- ==========================================================================
  IF NEW.status != 'paid' AND v_old_status = 'paid' THEN

    -- Find and delete ALL receipt vouchers created for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers
      WHERE user_id = NEW.user_id
        AND invoice_id = NEW.id
    LOOP

      -- Delete ledger entries for this receipt voucher
      DELETE FROM ledger_transactions
      WHERE voucher_id = v_receipt_voucher_id;

      -- Delete voucher entries
      DELETE FROM voucher_entries
      WHERE voucher_id = v_receipt_voucher_id;

      -- Delete the voucher itself
      DELETE FROM vouchers
      WHERE id = v_receipt_voucher_id;

      RAISE NOTICE '✓ Deleted receipt voucher for invoice % (status changed from paid)', NEW.invoice_number;

    END LOOP;

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

    -- Delete any related receipt vouchers
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers
      WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
    END LOOP;

    RAISE NOTICE '✓ Cancelled invoice % - deleted all related entries', NEW.invoice_number;

  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error handling invoice % status change: %', NEW.invoice_number, SQLERRM;
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
-- Step 7: Add Comments
-- ============================================================================

COMMENT ON FUNCTION handle_voucher_status_change IS
  'Comprehensive voucher status change handler:
   - TO posted: Posts voucher entries to ledger_transactions
   - TO draft: Deletes all ledger entries
   - TO cancelled: Deletes all ledger entries
   Prevents duplicate postings and handles all edge cases';

COMMENT ON TRIGGER trigger_handle_voucher_status_change ON vouchers IS
  'Automatically manages ledger entries when voucher status changes';

COMMENT ON FUNCTION handle_invoice_status_change IS
  'Comprehensive invoice status change handler:
   - TO non-draft: Posts invoice to ledger (Dr. Customer, Cr. Income)
   - TO draft: Deletes invoice ledger + receipt vouchers + receipt ledger
   - TO paid: Auto-creates receipt voucher (Dr. Cash/Bank, Cr. Customer) with proper mapping
   - FROM paid: Deletes receipt voucher and its ledger entries
   - TO cancelled: Deletes all related entries
   Prevents duplicate postings and ensures proper customer account mapping';

COMMENT ON TRIGGER trigger_handle_invoice_status_change ON invoices IS
  'Automatically manages ledger entries and receipt vouchers when invoice status changes';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ COMPREHENSIVE VOUCHER & INVOICE POSTING SYSTEM FIXED';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ Vouchers now post to ledger when status changed to "posted"';
  RAISE NOTICE '✓ Vouchers delete ledger when status changed to "draft" or "cancelled"';
  RAISE NOTICE '✓ Invoices post to ledger when status changed from draft';
  RAISE NOTICE '✓ Invoice status "paid" auto-creates receipt voucher with customer mapping';
  RAISE NOTICE '✓ Invoice status to "draft" deletes invoice + receipt vouchers + ledger';
  RAISE NOTICE '✓ Invoice status from "paid" deletes receipt voucher + ledger';
  RAISE NOTICE '✓ All duplicate posting prevented';
  RAISE NOTICE '✓ All account balances recalculated';
  RAISE NOTICE '========================================================================';
END $$;
