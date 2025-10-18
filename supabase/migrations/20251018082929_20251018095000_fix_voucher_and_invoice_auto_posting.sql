/*
  # Fix Automatic Posting for Vouchers and Invoices

  ## Problem
  1. Vouchers with status='posted' don't automatically create ledger transactions
  2. The trigger on voucher_entries only fires on INSERT, not when voucher status changes
  3. Invoices default to 'draft' status which prevents ledger posting

  ## Solution
  1. Fix voucher trigger to handle status changes
  2. Change default invoice status to 'unpaid' instead of 'draft'
  3. Ensure account balance updates automatically

  ## Changes
  1. Add trigger on vouchers table to post existing entries when status changes to 'posted'
  2. Update default invoice status
  3. Improve account balance update trigger
*/

-- ============================================================================
-- Fix Voucher Posting When Status Changes from Draft to Posted
-- ============================================================================

CREATE OR REPLACE FUNCTION post_voucher_entries_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When voucher status changes to 'posted', create ledger transactions for all entries
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    -- Insert ledger transactions for all voucher entries
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    )
    SELECT
      NEW.user_id,
      ve.account_id,
      ve.voucher_id,
      NEW.voucher_date,
      ve.debit_amount,
      ve.credit_amount,
      COALESCE(ve.narration, NEW.narration)
    FROM voucher_entries ve
    WHERE ve.voucher_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt.voucher_id = ve.voucher_id
          AND lt.account_id = ve.account_id
      );
    
    RAISE NOTICE 'Posted voucher % with % entries to ledger', NEW.voucher_number, 
      (SELECT COUNT(*) FROM voucher_entries WHERE voucher_id = NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for voucher status changes
DROP TRIGGER IF EXISTS trigger_post_voucher_on_status_change ON vouchers;

CREATE TRIGGER trigger_post_voucher_on_status_change
  AFTER INSERT OR UPDATE OF status ON vouchers
  FOR EACH ROW
  WHEN (NEW.status = 'posted')
  EXECUTE FUNCTION post_voucher_entries_on_status_change();

-- ============================================================================
-- Change Default Invoice Status
-- ============================================================================

-- Update invoices table default status to 'unpaid' instead of 'draft'
ALTER TABLE invoices 
  ALTER COLUMN status SET DEFAULT 'unpaid';

-- ============================================================================
-- Improve Account Balance Update Trigger
-- ============================================================================

-- Recreate the balance update function to handle both INSERT and DELETE
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
BEGIN
  -- Determine which account was affected
  IF TG_OP = 'DELETE' THEN
    v_account_id := OLD.account_id;
    v_debit := -OLD.debit;  -- Reverse the effect
    v_credit := -OLD.credit;
  ELSE
    v_account_id := NEW.account_id;
    v_debit := NEW.debit;
    v_credit := NEW.credit;
  END IF;
  
  -- Update the account balance
  UPDATE chart_of_accounts
  SET current_balance = current_balance + v_debit - v_credit
  WHERE id = v_account_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_update_account_balance ON ledger_transactions;

CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR DELETE ON ledger_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION post_voucher_entries_on_status_change IS
  'Automatically creates ledger transactions when a voucher status changes to posted. Handles both new vouchers created with posted status and draft vouchers being posted later.';

COMMENT ON TRIGGER trigger_post_voucher_on_status_change ON vouchers IS
  'Posts voucher entries to ledger when voucher status becomes posted';

COMMENT ON FUNCTION update_account_balance IS
  'Automatically updates chart_of_accounts.current_balance when ledger_transactions are inserted or deleted. Maintains accurate real-time account balances.';

COMMENT ON TRIGGER trigger_update_account_balance ON ledger_transactions IS
  'Keeps account balances in sync with ledger transactions';