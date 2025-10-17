/*
  # Auto Receipt Voucher Creation on Invoice Payment

  ## Summary
  Create receipt voucher automatically when invoice status changes to 'paid'

  ## Changes
  1. Trigger to create receipt voucher when invoice is marked as paid
  2. Receipt voucher uses cash/bank ledger (debit) and customer ledger (credit)
  3. Uses default_payment_receipt_type from settings to determine cash vs bank
*/

-- Function to create receipt voucher on invoice payment
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
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN

    SELECT * INTO v_settings_record
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    IF v_settings_record.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_ledger_id := v_settings_record.default_bank_ledger_id;
    ELSE
      v_cash_bank_ledger_id := v_settings_record.default_cash_ledger_id;
    END IF;

    SELECT * INTO v_receipt_type_record
    FROM voucher_types
    WHERE user_id = NEW.user_id AND code = 'RECEIPT' AND is_active = true
    LIMIT 1;

    IF v_receipt_type_record.id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_max_number
    FROM vouchers
    WHERE user_id = NEW.user_id AND voucher_type_id = v_receipt_type_record.id;

    v_voucher_number := COALESCE(v_settings_record.receipt_prefix, 'RV-') || LPAD((v_max_number + 1)::text, 5, '0');

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

    INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
    VALUES
      (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0, 'Receipt from customer'),
      (v_voucher_id, NEW.customer_ledger_id, 0, NEW.total_amount, 'Payment received');

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_payment ON invoices;

CREATE TRIGGER auto_create_receipt_on_invoice_payment
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_receipt_on_invoice_payment();
