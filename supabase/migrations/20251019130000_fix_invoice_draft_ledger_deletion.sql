/*
  # Fix Invoice Status Change to Draft - Delete Ledger Postings

  1. Changes
    - Add trigger to delete voucher entries when invoice status changes to draft
    - Ensures that when invoice is moved back to draft, all ledger postings are removed
    - Updates existing invoice status update trigger to handle draft status

  2. Security
    - Maintains RLS policies
    - Ensures data integrity

  3. Important Notes
    - When invoice status changes FROM any status TO draft, vouchers and voucher entries are deleted
    - When invoice status changes FROM draft TO other status, vouchers are created (existing behavior)
*/

-- Drop existing invoice status update trigger if exists
DROP TRIGGER IF EXISTS update_invoice_status_and_post_to_ledger ON invoices;
DROP FUNCTION IF EXISTS handle_invoice_status_change_and_post_to_ledger();

-- Create comprehensive function to handle invoice status changes
CREATE OR REPLACE FUNCTION handle_invoice_status_change_and_post_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher_type_id uuid;
  v_voucher_id uuid;
  v_customer_account_id uuid;
  v_income_account_id uuid;
BEGIN
  -- Check if status changed
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN

    -- CASE 1: Status changed TO draft - Delete all vouchers and entries
    IF NEW.status = 'draft' THEN
      -- Delete voucher entries first (foreign key constraint)
      DELETE FROM voucher_entries
      WHERE voucher_id IN (
        SELECT id FROM vouchers WHERE invoice_id = NEW.id
      );

      -- Delete vouchers
      DELETE FROM vouchers WHERE invoice_id = NEW.id;

      RETURN NEW;
    END IF;

    -- CASE 2: Status changed FROM draft to another status - Create vouchers
    IF OLD.status = 'draft' AND NEW.status != 'draft' THEN
      -- Check if ledger accounts are configured
      IF NEW.income_account_id IS NULL OR NEW.customer_account_id IS NULL THEN
        -- Skip ledger posting if accounts not configured
        RETURN NEW;
      END IF;

      -- Get voucher type for ITM INV (Item Invoice)
      SELECT id INTO v_voucher_type_id
      FROM voucher_types
      WHERE code = 'ITMINV' AND user_id = NEW.user_id
      LIMIT 1;

      -- If voucher type doesn't exist, skip
      IF v_voucher_type_id IS NULL THEN
        RETURN NEW;
      END IF;

      -- Check if voucher already exists for this invoice
      SELECT id INTO v_voucher_id
      FROM vouchers
      WHERE invoice_id = NEW.id
      LIMIT 1;

      -- Only create voucher if it doesn't exist
      IF v_voucher_id IS NULL THEN
        -- Create voucher
        INSERT INTO vouchers (
          user_id,
          voucher_type_id,
          voucher_number,
          voucher_date,
          reference_number,
          narration,
          total_amount,
          status,
          created_by,
          invoice_id
        ) VALUES (
          NEW.user_id,
          v_voucher_type_id,
          NEW.invoice_number,
          NEW.invoice_date,
          'INV-' || NEW.invoice_number,
          'Auto-generated from Invoice ' || NEW.invoice_number,
          NEW.total_amount,
          'posted',
          NEW.user_id,
          NEW.id
        ) RETURNING id INTO v_voucher_id;

        -- Create voucher entries (Dr. Customer, Cr. Income)
        INSERT INTO voucher_entries (
          voucher_id,
          account_id,
          debit_amount,
          credit_amount,
          narration
        ) VALUES
        (
          v_voucher_id,
          NEW.customer_account_id,
          NEW.total_amount,
          0,
          'Invoice ' || NEW.invoice_number || ' - Customer receivable'
        ),
        (
          v_voucher_id,
          NEW.income_account_id,
          0,
          NEW.total_amount,
          'Invoice ' || NEW.invoice_number || ' - Sales revenue'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice status changes
CREATE TRIGGER update_invoice_status_and_post_to_ledger
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_status_change_and_post_to_ledger();
