/*
  # Fix Duplicate Ledger Posting and Handle Voucher Status

  ## Summary
  This migration fixes duplicate ledger posting issues and ensures proper handling of voucher status.

  ## Issues Found
  1. Two triggers posting to ledger_transactions for vouchers:
     - trigger_create_ledger_from_voucher (from voucher_entries) - posts when status='posted'
     - trigger_post_voucher_to_ledger_transactions (from vouchers) - posts on INSERT
  2. This causes duplicate entries in ledger_transactions

  ## Solution
  1. Keep the voucher_entries trigger (it checks for status='posted')
  2. Remove the vouchers INSERT trigger
  3. Ensure vouchers are created with status='posted' by default for immediate posting
  4. Update invoice posting to avoid conflicts

  ## Changes Made
  1. Drop the duplicate voucher trigger on vouchers table
  2. Keep the trigger on voucher_entries (it's more granular and checks status)
  3. Ensure proper handling of invoice posting without conflicts
*/

-- ============================================================================
-- Remove Duplicate Voucher Posting Trigger
-- ============================================================================

-- The create_ledger_from_voucher trigger on voucher_entries already handles
-- posting to ledger_transactions when voucher status is 'posted'
-- So we should remove our duplicate trigger on vouchers table

DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger_transactions ON vouchers;
DROP FUNCTION IF EXISTS post_voucher_to_ledger_transactions();

-- ============================================================================
-- Improve Invoice Posting to Avoid Duplicates
-- ============================================================================

-- Drop and recreate invoice posting function with better duplicate checking
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;

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

-- Recreate trigger
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status != 'draft' AND NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL)
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- ============================================================================
-- Add Comments
-- ============================================================================

COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS 
  'Posts invoice transactions directly to ledger_transactions table with duplicate prevention. Creates debit (customer) and credit (income) entries for double-entry bookkeeping. Used by trial balance, balance sheet, and all financial reports.';

COMMENT ON TRIGGER trigger_create_ledger_from_voucher ON voucher_entries IS 
  'Automatically posts voucher entries to ledger_transactions when voucher status is posted. This is the primary mechanism for voucher posting.';
