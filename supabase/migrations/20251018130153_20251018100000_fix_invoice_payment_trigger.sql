/*
  # Fix Invoice Payment Trigger - Correct Column Reference

  ## Problem
  The auto_create_receipt_on_invoice_payment function references a non-existent column 'default_ledger_id' 
  from customers table. The correct column name is 'account_id'.

  ## Solution
  Update the function to use the correct column name 'account_id' instead of 'default_ledger_id'.
*/

-- Drop and recreate the function with correct column reference
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_payment() CASCADE;

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

    -- Get customer's ledger account (CORRECTED: use account_id instead of default_ledger_id)
    SELECT account_id INTO v_customer_ledger_id
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

-- Recreate the trigger
CREATE TRIGGER auto_create_receipt_on_invoice_payment
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_receipt_on_invoice_payment();

COMMENT ON FUNCTION auto_create_receipt_on_invoice_payment IS
  'Creates a receipt voucher automatically when an invoice status changes to paid. Uses account_id from customers table.';
