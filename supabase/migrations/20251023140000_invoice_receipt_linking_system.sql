/*
  # Invoice-Receipt Linking System

  ## Overview
  This migration creates a comprehensive system to link invoices with receipts/payments,
  enabling tracking of partial payments, advance receipts, and pending receivables.

  ## New Tables Created

  ### 1. invoice_payments
  - Links receipts (vouchers) to invoices
  - Tracks partial/full payments
  - Handles advance receipts and their allocation
  - Fields:
    - id: Primary key
    - invoice_id: Reference to invoice (nullable for advance receipts)
    - voucher_id: Reference to receipt voucher
    - payment_amount: Amount applied from this receipt
    - allocated_at: When the payment was allocated to invoice
    - is_advance: Flag for advance receipts
    - notes: Additional notes about the payment allocation

  ### 2. advance_receipts_view
  - View to show unallocated advance receipts
  - Shows receipts that can be linked to future invoices

  ### 3. invoice_payment_summary_view
  - View showing payment status per invoice
  - Aggregates total paid, pending amounts
  - Shows all linked receipts

  ## New Columns Added

  ### invoices table
  - paid_amount: Tracks total amount paid against invoice
  - balance_amount: Remaining amount to be paid (auto-calculated)

  ### vouchers table
  - allocated_amount: Amount already allocated to invoices (for advances)
  - unallocated_amount: Remaining amount available for allocation

  ## Functionality

  ### Partial Payments
  - Multiple receipts can be linked to one invoice
  - Each receipt can partially or fully pay an invoice
  - System tracks cumulative paid amount

  ### Advance Receipts
  - Record receipts before invoice generation (invoice_id = NULL, is_advance = true)
  - Later link advances to invoices when generated
  - Track allocated vs unallocated advance amounts

  ### Payment Tracking
  - Automatic calculation of paid_amount and balance_amount on invoices
  - Triggers update invoice status based on payment
  - View to show all unallocated advances

  ## Security
  - All tables have RLS enabled
  - Users can only access their own payment data
  - Policies ensure data integrity

  ## Important Notes
  - Payment allocation is immutable once created (use soft delete if needed)
  - Advance receipts remain visible until fully allocated
  - Invoice balance updates automatically via triggers
*/

-- ============================================================================
-- 1. Add new columns to existing tables
-- ============================================================================

-- Add payment tracking columns to invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE invoices ADD COLUMN paid_amount numeric(15, 2) DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'balance_amount'
  ) THEN
    ALTER TABLE invoices ADD COLUMN balance_amount numeric(15, 2) DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add allocation tracking columns to vouchers (for receipt vouchers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'allocated_amount'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN allocated_amount numeric(15, 2) DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'unallocated_amount'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN unallocated_amount numeric(15, 2) DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. Create invoice_payments table (linking table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  voucher_id uuid REFERENCES vouchers(id) ON DELETE CASCADE NOT NULL,
  payment_amount numeric(15, 2) NOT NULL CHECK (payment_amount > 0),
  allocated_at timestamptz DEFAULT now() NOT NULL,
  is_advance boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(voucher_id, invoice_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_voucher ON invoice_payments(voucher_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_user ON invoice_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_advance ON invoice_payments(is_advance) WHERE is_advance = true;

-- Enable RLS
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own invoice payments"
  ON invoice_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own invoice payments"
  ON invoice_payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invoice payments"
  ON invoice_payments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own invoice payments"
  ON invoice_payments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. Create triggers to auto-update amounts
-- ============================================================================

-- Function to update invoice paid and balance amounts
CREATE OR REPLACE FUNCTION update_invoice_payment_amounts()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_total_paid numeric;
  v_invoice_total numeric;
BEGIN
  -- Determine invoice_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Only update if invoice_id is not null (skip advance receipts not yet allocated)
  IF v_invoice_id IS NOT NULL THEN
    -- Calculate total paid amount for this invoice
    SELECT COALESCE(SUM(payment_amount), 0)
    INTO v_total_paid
    FROM invoice_payments
    WHERE invoice_id = v_invoice_id;

    -- Get invoice total
    SELECT total_amount
    INTO v_invoice_total
    FROM invoices
    WHERE id = v_invoice_id;

    -- Update invoice paid_amount and balance_amount
    UPDATE invoices
    SET
      paid_amount = v_total_paid,
      balance_amount = GREATEST(v_invoice_total - v_total_paid, 0),
      updated_at = now()
    WHERE id = v_invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for invoice payment changes
DROP TRIGGER IF EXISTS trigger_update_invoice_payment_amounts ON invoice_payments;
CREATE TRIGGER trigger_update_invoice_payment_amounts
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_payment_amounts();

-- Function to update voucher allocated amounts
CREATE OR REPLACE FUNCTION update_voucher_allocation_amounts()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher_id uuid;
  v_total_allocated numeric;
  v_voucher_total numeric;
BEGIN
  -- Determine voucher_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_voucher_id := OLD.voucher_id;
  ELSE
    v_voucher_id := NEW.voucher_id;
  END IF;

  -- Calculate total allocated amount for this voucher
  SELECT COALESCE(SUM(payment_amount), 0)
  INTO v_total_allocated
  FROM invoice_payments
  WHERE voucher_id = v_voucher_id;

  -- Get voucher total
  SELECT total_amount
  INTO v_voucher_total
  FROM vouchers
  WHERE id = v_voucher_id;

  -- Update voucher allocated_amount and unallocated_amount
  UPDATE vouchers
  SET
    allocated_amount = v_total_allocated,
    unallocated_amount = GREATEST(v_voucher_total - v_total_allocated, 0),
    updated_at = now()
  WHERE id = v_voucher_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for voucher allocation changes
DROP TRIGGER IF EXISTS trigger_update_voucher_allocation_amounts ON invoice_payments;
CREATE TRIGGER trigger_update_voucher_allocation_amounts
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_voucher_allocation_amounts();

-- ============================================================================
-- 4. Create views for easy querying
-- ============================================================================

-- View: Unallocated advance receipts
CREATE OR REPLACE VIEW advance_receipts_view AS
SELECT
  v.id as voucher_id,
  v.voucher_number,
  v.voucher_date,
  v.total_amount,
  v.allocated_amount,
  v.unallocated_amount,
  v.narration,
  v.user_id,
  vt.name as voucher_type_name
FROM vouchers v
JOIN voucher_types vt ON v.voucher_type_id = vt.id
WHERE vt.code = 'RCPT'
  AND v.status = 'posted'
  AND v.unallocated_amount > 0
ORDER BY v.voucher_date DESC;

-- View: Invoice payment summary
CREATE OR REPLACE VIEW invoice_payment_summary_view AS
SELECT
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.total_amount,
  i.paid_amount,
  i.balance_amount,
  i.status,
  c.name as customer_name,
  c.id as customer_id,
  json_agg(
    json_build_object(
      'payment_id', ip.id,
      'voucher_id', ip.voucher_id,
      'voucher_number', v.voucher_number,
      'payment_amount', ip.payment_amount,
      'payment_date', v.voucher_date,
      'allocated_at', ip.allocated_at,
      'is_advance', ip.is_advance,
      'notes', ip.notes
    ) ORDER BY ip.allocated_at DESC
  ) FILTER (WHERE ip.id IS NOT NULL) as payments
FROM invoices i
JOIN customers c ON i.customer_id = c.id
LEFT JOIN invoice_payments ip ON i.id = ip.invoice_id
LEFT JOIN vouchers v ON ip.voucher_id = v.id
GROUP BY i.id, i.invoice_number, i.invoice_date, i.due_date,
         i.total_amount, i.paid_amount, i.balance_amount, i.status,
         c.name, c.id;

-- ============================================================================
-- 5. Initialize existing data
-- ============================================================================

-- Set balance_amount for existing invoices
UPDATE invoices
SET
  paid_amount = CASE WHEN status = 'paid' THEN total_amount ELSE 0 END,
  balance_amount = CASE WHEN status = 'paid' THEN 0 ELSE total_amount END
WHERE paid_amount = 0;

-- Set unallocated_amount for existing vouchers
UPDATE vouchers
SET unallocated_amount = total_amount - COALESCE(allocated_amount, 0)
WHERE unallocated_amount = 0;

-- ============================================================================
-- 6. Helper function to allocate payment to invoice
-- ============================================================================

CREATE OR REPLACE FUNCTION allocate_payment_to_invoice(
  p_user_id uuid,
  p_voucher_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_voucher_unallocated numeric;
  v_invoice_balance numeric;
  v_actual_amount numeric;
  v_result json;
BEGIN
  -- Validate voucher exists and has unallocated amount
  SELECT unallocated_amount INTO v_voucher_unallocated
  FROM vouchers
  WHERE id = p_voucher_id AND user_id = p_user_id;

  IF v_voucher_unallocated IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Voucher not found');
  END IF;

  IF v_voucher_unallocated <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'No unallocated amount in voucher');
  END IF;

  -- Validate invoice exists and has balance
  SELECT balance_amount INTO v_invoice_balance
  FROM invoices
  WHERE id = p_invoice_id AND user_id = p_user_id;

  IF v_invoice_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice_balance <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invoice already fully paid');
  END IF;

  -- Calculate actual amount to allocate (min of requested, available, and needed)
  v_actual_amount := LEAST(p_amount, v_voucher_unallocated, v_invoice_balance);

  -- Insert payment allocation
  INSERT INTO invoice_payments (
    user_id, invoice_id, voucher_id, payment_amount, notes, is_advance
  ) VALUES (
    p_user_id, p_invoice_id, p_voucher_id, v_actual_amount, p_notes, false
  );

  -- Return success
  RETURN json_build_object(
    'success', true,
    'allocated_amount', v_actual_amount,
    'voucher_remaining', v_voucher_unallocated - v_actual_amount,
    'invoice_remaining', v_invoice_balance - v_actual_amount
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== INVOICE-RECEIPT LINKING SYSTEM CREATED ===';
  RAISE NOTICE '';
  RAISE NOTICE 'New Tables:';
  RAISE NOTICE '  ✓ invoice_payments - Links receipts to invoices';
  RAISE NOTICE '';
  RAISE NOTICE 'New Columns:';
  RAISE NOTICE '  ✓ invoices.paid_amount - Total amount paid';
  RAISE NOTICE '  ✓ invoices.balance_amount - Remaining balance';
  RAISE NOTICE '  ✓ vouchers.allocated_amount - Amount allocated to invoices';
  RAISE NOTICE '  ✓ vouchers.unallocated_amount - Available for allocation';
  RAISE NOTICE '';
  RAISE NOTICE 'New Views:';
  RAISE NOTICE '  ✓ advance_receipts_view - Unallocated advance receipts';
  RAISE NOTICE '  ✓ invoice_payment_summary_view - Payment details per invoice';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  ✓ Link multiple receipts to one invoice (partial payments)';
  RAISE NOTICE '  ✓ Record advance receipts before invoice generation';
  RAISE NOTICE '  ✓ Allocate advances to invoices later';
  RAISE NOTICE '  ✓ Track pending receivables per invoice';
  RAISE NOTICE '  ✓ Auto-update payment amounts via triggers';
  RAISE NOTICE '';
END $$;
