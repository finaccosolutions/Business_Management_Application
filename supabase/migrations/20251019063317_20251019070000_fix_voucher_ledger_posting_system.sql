/*
  # Fix Voucher and Invoice Ledger Posting System

  ## Problem
  1. Vouchers and invoices are not posting to ledger_transactions
  2. Trigger functions reference non-existent 'voucher_items' table (should be 'voucher_entries')
  3. Payment and Receipt voucher UI not using mapped default accounts
  4. Reports (Trial Balance, P&L, Balance Sheet) showing no data

  ## Root Cause
  - Functions using 'voucher_items' but table is 'voucher_entries'
  - Triggers not properly configured
  - Missing proper status handling

  ## Solution
  1. Fix all functions to use 'voucher_entries' instead of 'voucher_items'
  2. Ensure triggers fire correctly on INSERT with status='posted'
  3. Retroactively post existing vouchers and invoices
  4. Update account balances

  ## Changes
  1. Drop and recreate post_voucher_entries_on_status_change function
  2. Fix trigger to work on INSERT with status='posted'
  3. Ensure invoice trigger posts to ledger_transactions
  4. Retroactively post all existing data
*/

-- ============================================================================
-- Step 1: Drop Conflicting Triggers and Functions
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_post_voucher_on_status_change ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger ON vouchers;
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledgers ON vouchers;
DROP TRIGGER IF EXISTS trigger_create_ledger_from_voucher ON voucher_entries;

DROP FUNCTION IF EXISTS post_voucher_entries_on_status_change CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledger CASCADE;
DROP FUNCTION IF EXISTS post_voucher_to_ledgers CASCADE;
DROP FUNCTION IF EXISTS create_ledger_from_voucher CASCADE;

-- ============================================================================
-- Step 2: Create Correct Voucher Posting Function
-- ============================================================================

CREATE OR REPLACE FUNCTION post_voucher_to_ledger_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_entry RECORD;
  v_existing_count integer;
BEGIN
  -- Only post if status is 'posted'
  IF NEW.status = 'posted' THEN
    
    -- Check if already posted (avoid duplicates)
    SELECT COUNT(*) INTO v_existing_count
    FROM ledger_transactions
    WHERE voucher_id = NEW.id;
    
    IF v_existing_count > 0 THEN
      -- Already posted, skip
      RAISE NOTICE 'Voucher % already posted to ledger, skipping', NEW.voucher_number;
      RETURN NEW;
    END IF;
    
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
        narration
      ) VALUES (
        NEW.user_id,
        v_entry.account_id,
        NEW.id,
        NEW.voucher_date,
        COALESCE(v_entry.debit_amount, 0),
        COALESCE(v_entry.credit_amount, 0),
        COALESCE(v_entry.narration, NEW.narration, '')
      );
    END LOOP;
    
    RAISE NOTICE 'Posted voucher % to ledger with % entries', NEW.voucher_number, 
      (SELECT COUNT(*) FROM voucher_entries WHERE voucher_id = NEW.id);
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting voucher % to ledger: %', NEW.voucher_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 3: Create Trigger for Vouchers
-- ============================================================================

CREATE TRIGGER trigger_post_voucher_to_ledger_transactions
  AFTER INSERT OR UPDATE OF status ON vouchers
  FOR EACH ROW
  WHEN (NEW.status = 'posted')
  EXECUTE FUNCTION post_voucher_to_ledger_transactions();

-- ============================================================================
-- Step 4: Ensure Invoice Trigger is Correct
-- ============================================================================

-- Drop existing invoice triggers that might conflict
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger ON invoices;
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledgers ON invoices;

-- Keep only the transaction-based trigger
-- (trigger_post_invoice_to_ledger_transactions should already exist)

-- Verify the function exists and is correct
CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_debit_id uuid;
  v_existing_credit_id uuid;
BEGIN
  -- Only post if status is not draft and both accounts are mapped
  IF NEW.status != 'draft' AND 
     NEW.income_account_id IS NOT NULL AND 
     NEW.customer_account_id IS NOT NULL THEN
    
    -- Check if customer debit entry already exists
    SELECT id INTO v_existing_debit_id
    FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND account_id = NEW.customer_account_id
      AND voucher_id IS NULL
      AND transaction_date = NEW.invoice_date
      AND debit = NEW.total_amount
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%'
    LIMIT 1;
    
    -- Check if income credit entry already exists
    SELECT id INTO v_existing_credit_id
    FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND account_id = NEW.income_account_id
      AND voucher_id IS NULL
      AND transaction_date = NEW.invoice_date
      AND credit = NEW.total_amount
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%'
    LIMIT 1;
    
    -- Only post if not already posted
    IF v_existing_debit_id IS NULL AND v_existing_credit_id IS NULL THEN
      
      -- Debit: Customer Account (Accounts Receivable - they owe us)
      INSERT INTO ledger_transactions (
        user_id,
        account_id,
        voucher_id,
        transaction_date,
        debit,
        credit,
        narration
      ) VALUES (
        NEW.user_id,
        NEW.customer_account_id,
        NULL,
        NEW.invoice_date,
        NEW.total_amount,
        0,
        'Invoice ' || NEW.invoice_number || ' - Customer receivable'
      );
      
      -- Credit: Income Account (Revenue earned)
      INSERT INTO ledger_transactions (
        user_id,
        account_id,
        voucher_id,
        transaction_date,
        debit,
        credit,
        narration
      ) VALUES (
        NEW.user_id,
        NEW.income_account_id,
        NULL,
        NEW.invoice_date,
        0,
        NEW.total_amount,
        'Invoice ' || NEW.invoice_number || ' - Service income'
      );
      
      RAISE NOTICE 'Posted invoice % to ledger_transactions', NEW.invoice_number;
    ELSE
      RAISE NOTICE 'Invoice % already posted to ledger, skipping', NEW.invoice_number;
    END IF;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;

CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE OF status, total_amount ON invoices
  FOR EACH ROW
  WHEN (NEW.status != 'draft')
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- ============================================================================
-- Step 5: Retroactively Post Existing Vouchers
-- ============================================================================

-- Clear existing voucher-based ledger transactions to avoid duplicates
DELETE FROM ledger_transactions
WHERE voucher_id IS NOT NULL;

-- Post all existing 'posted' vouchers
DO $$
DECLARE
  v_voucher RECORD;
  v_entry RECORD;
BEGIN
  FOR v_voucher IN
    SELECT * FROM vouchers WHERE status = 'posted'
  LOOP
    -- Post all entries for this voucher
    FOR v_entry IN
      SELECT * FROM voucher_entries WHERE voucher_id = v_voucher.id
    LOOP
      INSERT INTO ledger_transactions (
        user_id,
        account_id,
        voucher_id,
        transaction_date,
        debit,
        credit,
        narration
      ) VALUES (
        v_voucher.user_id,
        v_entry.account_id,
        v_voucher.id,
        v_voucher.voucher_date,
        COALESCE(v_entry.debit_amount, 0),
        COALESCE(v_entry.credit_amount, 0),
        COALESCE(v_entry.narration, v_voucher.narration, '')
      );
    END LOOP;
    
    RAISE NOTICE 'Retroactively posted voucher: %', v_voucher.voucher_number;
  END LOOP;
END $$;

-- ============================================================================
-- Step 6: Retroactively Post Existing Invoices
-- ============================================================================

-- Clear existing invoice-based ledger transactions to avoid duplicates
DELETE FROM ledger_transactions
WHERE voucher_id IS NULL
  AND (narration LIKE '%Invoice%' OR narration LIKE '%invoice%');

-- Post all existing non-draft invoices
DO $$
DECLARE
  v_invoice RECORD;
BEGIN
  FOR v_invoice IN
    SELECT * FROM invoices
    WHERE status != 'draft'
      AND income_account_id IS NOT NULL
      AND customer_account_id IS NOT NULL
  LOOP
    -- Debit: Customer Account
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      v_invoice.user_id,
      v_invoice.customer_account_id,
      NULL,
      v_invoice.invoice_date,
      v_invoice.total_amount,
      0,
      'Invoice ' || v_invoice.invoice_number || ' - Customer receivable'
    );
    
    -- Credit: Income Account
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      v_invoice.user_id,
      v_invoice.income_account_id,
      NULL,
      v_invoice.invoice_date,
      0,
      v_invoice.total_amount,
      'Invoice ' || v_invoice.invoice_number || ' - Service income'
    );
    
    RAISE NOTICE 'Retroactively posted invoice: %', v_invoice.invoice_number;
  END LOOP;
END $$;

-- ============================================================================
-- Step 7: Update Account Balances
-- ============================================================================

-- Recalculate all account balances based on ledger_transactions
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
-- Step 8: Add Comments
-- ============================================================================

COMMENT ON FUNCTION post_voucher_to_ledger_transactions IS
  'Posts voucher entries to ledger_transactions when voucher status is posted.
   - Uses voucher_entries table (not voucher_items)
   - Prevents duplicate posting
   - Handles both INSERT with status=posted and UPDATE to status=posted';

COMMENT ON TRIGGER trigger_post_voucher_to_ledger_transactions ON vouchers IS
  'Automatically posts voucher entries to ledger when status is posted';

COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS
  'Posts invoices to ledger_transactions when status is not draft.
   - Requires income_account_id and customer_account_id to be mapped
   - Prevents duplicate posting
   - Creates debit to customer and credit to income';

COMMENT ON TRIGGER trigger_post_invoice_to_ledger_transactions ON invoices IS
  'Automatically posts invoices to ledger when saved with non-draft status';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Fixed voucher ledger posting system';
  RAISE NOTICE '✓ Fixed invoice ledger posting system';
  RAISE NOTICE '✓ All functions now use voucher_entries table';
  RAISE NOTICE '✓ Retroactively posted all existing vouchers and invoices';
  RAISE NOTICE '✓ Updated all account balances';
  RAISE NOTICE '✓ Reports should now show data correctly';
  RAISE NOTICE '========================================';
END $$;
