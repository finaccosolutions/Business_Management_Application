/*
  # Complete Fix for Voucher and Invoice Status Changes and Posting

  ## Issues Fixed
  1. Vouchers not posting to ledger_transactions when status changed to 'posted'
  2. Invoice status 'paid' not creating receipt voucher automatically
  3. Status change from 'posted'/'sent' back to 'draft' not deleting ledger entries
  4. Status change from 'paid' back to other status not deleting receipt voucher
  5. Proper handling of all status transitions

  ## Changes
  1. Enhanced voucher status change trigger to handle all transitions
  2. Enhanced invoice status change trigger to handle all transitions
  3. Auto-create receipt voucher when invoice becomes 'paid'
  4. Auto-delete ledger entries when status becomes 'draft'
  5. Auto-delete receipt voucher when invoice status changes from 'paid'
  6. Prevent duplicate posting
*/

-- ============================================================================
-- Drop All Existing Triggers and Functions
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger_transactions ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_on_status_change ON vouchers;
DROP TRIGGER IF EXISTS trigger_handle_voucher_status_change ON vouchers;
DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_payment ON invoices;
DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;

DROP FUNCTION IF EXISTS post_voucher_to_ledger_transactions CASCADE;
DROP FUNCTION IF EXISTS handle_voucher_status_change CASCADE;
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_payment CASCADE;
DROP FUNCTION IF EXISTS handle_invoice_status_change CASCADE;
DROP FUNCTION IF EXISTS post_invoice_to_ledger_transactions CASCADE;

-- ============================================================================
-- Function: Handle Voucher Status Changes
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

      RAISE NOTICE 'Posted voucher % to ledger', NEW.voucher_number;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed FROM 'posted' TO 'draft' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status = 'posted' THEN

    -- Delete all ledger entries for this voucher
    DELETE FROM ledger_transactions
    WHERE voucher_id = NEW.id;

    RAISE NOTICE 'Deleted ledger entries for voucher % (status changed to draft)', NEW.voucher_number;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed FROM 'posted' TO 'cancelled' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'cancelled' AND v_old_status = 'posted' THEN

    -- Delete all ledger entries for this voucher
    DELETE FROM ledger_transactions
    WHERE voucher_id = NEW.id;

    RAISE NOTICE 'Deleted ledger entries for voucher % (status changed to cancelled)', NEW.voucher_number;

  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error handling voucher status change for %: %', NEW.voucher_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Handle Voucher Status Changes
-- ============================================================================

CREATE TRIGGER trigger_handle_voucher_status_change
  AFTER INSERT OR UPDATE OF status ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION handle_voucher_status_change();

-- ============================================================================
-- Function: Handle Invoice Status Changes
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
  v_receipt_voucher_id UUID;
  v_existing_count INTEGER;
BEGIN
  -- Get old status (handle INSERT case)
  v_old_status := COALESCE(OLD.status, 'draft');

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
        AND user_id = NEW.user_id;

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

        RAISE NOTICE 'Posted invoice % to ledger', NEW.invoice_number;
      END IF;

    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed FROM non-draft TO 'draft' - Delete Ledger Entries
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    -- Delete ledger entries for this invoice
    DELETE FROM ledger_transactions
    WHERE narration LIKE '%Invoice ' || NEW.invoice_number || '%'
      AND voucher_id IS NULL
      AND user_id = NEW.user_id;

    RAISE NOTICE 'Deleted ledger entries for invoice % (status changed to draft)', NEW.invoice_number;

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

    IF v_settings IS NOT NULL THEN

      -- Determine cash/bank ledger
      IF v_settings.default_payment_receipt_type = 'bank' THEN
        v_cash_bank_ledger_id := v_settings.default_bank_ledger_id;
      ELSE
        v_cash_bank_ledger_id := v_settings.default_cash_ledger_id;
      END IF;

      -- Get customer's ledger account
      SELECT * INTO v_customer
      FROM customers
      WHERE id = NEW.customer_id
      LIMIT 1;

      IF v_customer.account_id IS NOT NULL AND v_cash_bank_ledger_id IS NOT NULL THEN

        -- Get receipt voucher type
        SELECT * INTO v_receipt_type
        FROM voucher_types
        WHERE user_id = NEW.user_id
          AND (code = 'RV' OR code = 'ITMRCT')
          AND is_active = true
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
            SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_max_number
            FROM vouchers
            WHERE user_id = NEW.user_id AND voucher_type_id = v_receipt_type.id;

            v_voucher_number := COALESCE(v_settings.receipt_prefix, 'RV-') || LPAD((v_max_number + 1)::text, 5, '0');

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
              'Receipt for invoice ' || NEW.invoice_number,
              NEW.total_amount,
              'posted',
              NEW.id,
              NEW.user_id,
              NOW()
            ) RETURNING id INTO v_voucher_id;

            -- Create voucher entries
            INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
            VALUES
              (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0, 'Receipt from customer'),
              (v_voucher_id, v_customer.account_id, 0, NEW.total_amount, 'Payment received');

            RAISE NOTICE 'Created receipt voucher % for invoice %', v_voucher_number, NEW.invoice_number;

          END IF;

        END IF;

      END IF;

    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 4: Status changed FROM 'paid' - Delete Receipt Voucher and Ledger
  -- ==========================================================================
  IF NEW.status != 'paid' AND v_old_status = 'paid' THEN

    -- Find and delete the receipt voucher created for this invoice
    SELECT id INTO v_receipt_voucher_id
    FROM vouchers
    WHERE user_id = NEW.user_id
      AND invoice_id = NEW.id
    LIMIT 1;

    IF v_receipt_voucher_id IS NOT NULL THEN

      -- Delete ledger entries for this receipt voucher
      DELETE FROM ledger_transactions
      WHERE voucher_id = v_receipt_voucher_id;

      -- Delete voucher entries
      DELETE FROM voucher_entries
      WHERE voucher_id = v_receipt_voucher_id;

      -- Delete the voucher itself
      DELETE FROM vouchers
      WHERE id = v_receipt_voucher_id;

      RAISE NOTICE 'Deleted receipt voucher for invoice % (status changed from paid)', NEW.invoice_number;

    END IF;

  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error handling invoice status change for %: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Handle Invoice Status Changes
-- ============================================================================

CREATE TRIGGER trigger_handle_invoice_status_change
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_status_change();

-- ============================================================================
-- Add invoice_id column to vouchers if it doesn't exist
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_vouchers_invoice_id ON vouchers(invoice_id);
    COMMENT ON COLUMN vouchers.invoice_id IS 'Reference to invoice if this voucher was auto-created for an invoice payment';
  END IF;
END $$;

-- ============================================================================
-- Update Account Balances
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
-- Comments
-- ============================================================================

COMMENT ON FUNCTION handle_voucher_status_change IS
  'Handles all voucher status transitions:
   - TO posted: Posts entries to ledger_transactions
   - FROM posted TO draft: Deletes ledger entries
   - FROM posted TO cancelled: Deletes ledger entries';

COMMENT ON TRIGGER trigger_handle_voucher_status_change ON vouchers IS
  'Automatically manages ledger entries based on voucher status changes';

COMMENT ON FUNCTION handle_invoice_status_change IS
  'Handles all invoice status transitions:
   - TO non-draft: Posts to ledger_transactions
   - FROM non-draft TO draft: Deletes ledger entries
   - TO paid: Creates receipt voucher (posted)
   - FROM paid: Deletes receipt voucher and ledger entries';

COMMENT ON TRIGGER trigger_handle_invoice_status_change ON invoices IS
  'Automatically manages ledger entries and receipt vouchers based on invoice status changes';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Fixed voucher status change handling';
  RAISE NOTICE '✓ Fixed invoice status change handling';
  RAISE NOTICE '✓ Vouchers now post to ledger when status = posted';
  RAISE NOTICE '✓ Invoices now post to ledger when status != draft';
  RAISE NOTICE '✓ Invoice status = paid now auto-creates receipt voucher';
  RAISE NOTICE '✓ Status change to draft now deletes ledger entries';
  RAISE NOTICE '✓ Status change from paid now deletes receipt voucher';
  RAISE NOTICE '✓ All account balances updated';
  RAISE NOTICE '========================================';
END $$;
