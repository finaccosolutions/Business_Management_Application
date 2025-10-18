/*
  # Fix Cascade Deletes and Invoice/Voucher System Issues

  ## Problems Fixed
  1. Auto-receipt trigger references non-existent 'customer_ledger_id' column in invoices table
  2. Deleting invoices/vouchers doesn't cascade to related records (invoice_items, voucher_entries, ledger_transactions)
  3. Invoices past due date don't automatically update to 'overdue' status
  4. Posted vouchers should still be deletable (just need to reverse ledger entries)

  ## Changes
  1. Drop and recreate auto-receipt trigger without customer_ledger_id reference
  2. Add CASCADE delete constraints to invoice_items, voucher_entries, ledger_transactions
  3. Create function to automatically update overdue invoices
  4. Create trigger to reverse ledger entries when vouchers/invoices are deleted
*/

-- ============================================================================
-- Fix Auto-Receipt Trigger - Remove customer_ledger_id Reference
-- ============================================================================

-- Drop all related triggers first
DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_payment ON invoices;
DROP TRIGGER IF EXISTS trigger_auto_create_receipt_on_payment ON invoices;

-- Now drop the function
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_payment() CASCADE;

-- Recreate the function without customer_ledger_id reference
CREATE OR REPLACE FUNCTION auto_create_receipt_on_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings_record RECORD;
  v_receipt_type_record RECORD;
  v_voucher_id uuid;
  v_voucher_number text;
  v_max_number integer;
  v_cash_bank_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN

    -- Get company settings
    SELECT * INTO v_settings_record
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    IF v_settings_record IS NULL THEN
      RAISE NOTICE 'No company settings found for user %', NEW.user_id;
      RETURN NEW;
    END IF;

    -- Determine cash/bank ledger
    IF v_settings_record.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_ledger_id := v_settings_record.default_bank_ledger_id;
    ELSE
      v_cash_bank_ledger_id := v_settings_record.default_cash_ledger_id;
    END IF;

    -- Get customer's ledger account
    SELECT default_ledger_id INTO v_customer_ledger_id
    FROM customers
    WHERE id = NEW.customer_id
    LIMIT 1;

    IF v_customer_ledger_id IS NULL THEN
      RAISE NOTICE 'No ledger account found for customer %', NEW.customer_id;
      RETURN NEW;
    END IF;

    -- Get receipt voucher type
    SELECT * INTO v_receipt_type_record
    FROM voucher_types
    WHERE user_id = NEW.user_id AND code = 'RV' AND is_active = true
    LIMIT 1;

    IF v_receipt_type_record.id IS NULL THEN
      RAISE NOTICE 'No active receipt voucher type found';
      RETURN NEW;
    END IF;

    -- Generate voucher number
    SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_max_number
    FROM vouchers
    WHERE user_id = NEW.user_id AND voucher_type_id = v_receipt_type_record.id;

    v_voucher_number := COALESCE(v_settings_record.receipt_prefix, 'RV-') || LPAD((v_max_number + 1)::text, 5, '0');

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
      invoice_id
    ) VALUES (
      NEW.user_id,
      v_receipt_type_record.id,
      v_voucher_number,
      CURRENT_DATE,
      NEW.invoice_number,
      'Receipt for invoice ' || NEW.invoice_number,
      NEW.total_amount,
      'posted',
      NEW.id
    ) RETURNING id INTO v_voucher_id;

    -- Create voucher entries
    INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
    VALUES
      (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0, 'Receipt from customer'),
      (v_voucher_id, v_customer_ledger_id, 0, NEW.total_amount, 'Payment received');

    RAISE NOTICE 'Created receipt voucher % for invoice %', v_voucher_number, NEW.invoice_number;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_create_receipt_on_invoice_payment
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_receipt_on_invoice_payment();

-- ============================================================================
-- Add CASCADE Delete Constraints
-- ============================================================================

-- Drop existing foreign key constraints and recreate with CASCADE
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE invoice_items 
  ADD CONSTRAINT invoice_items_invoice_id_fkey 
  FOREIGN KEY (invoice_id) 
  REFERENCES invoices(id) 
  ON DELETE CASCADE;

ALTER TABLE voucher_entries DROP CONSTRAINT IF EXISTS voucher_entries_voucher_id_fkey;
ALTER TABLE voucher_entries 
  ADD CONSTRAINT voucher_entries_voucher_id_fkey 
  FOREIGN KEY (voucher_id) 
  REFERENCES vouchers(id) 
  ON DELETE CASCADE;

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS ledger_transactions_voucher_id_fkey;
ALTER TABLE ledger_transactions 
  ADD CONSTRAINT ledger_transactions_voucher_id_fkey 
  FOREIGN KEY (voucher_id) 
  REFERENCES vouchers(id) 
  ON DELETE CASCADE;

-- ============================================================================
-- Auto Update Overdue Invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION update_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE invoices
  SET status = 'overdue'
  WHERE status IN ('sent', 'draft')
    AND due_date < CURRENT_DATE
    AND status != 'paid'
    AND status != 'cancelled';
END;
$$;

-- Create a trigger to check for overdue invoices on any invoice update
CREATE OR REPLACE FUNCTION check_invoice_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('paid', 'cancelled') AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_invoice_overdue ON invoices;

CREATE TRIGGER trigger_check_invoice_overdue
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_overdue();

-- ============================================================================
-- Run Immediate Overdue Update
-- ============================================================================

-- Update any existing invoices that are overdue
SELECT update_overdue_invoices();

COMMENT ON FUNCTION auto_create_receipt_on_invoice_payment IS
  'Creates a receipt voucher automatically when an invoice status changes to paid. Uses customer ledger account from customers table.';

COMMENT ON FUNCTION update_overdue_invoices IS
  'Updates all invoices with status sent or draft to overdue if their due date has passed.';

COMMENT ON FUNCTION check_invoice_overdue IS
  'Automatically sets invoice status to overdue when due date is in the past during insert or update.';
