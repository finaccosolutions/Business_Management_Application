/*
  # Auto-Update Work Billing Status Based on Invoices

  1. Changes
    - Creates a trigger to automatically update work billing_status when invoice is created or updated
    - Updates billing_status to 'billed' when invoice status is 'sent' or 'paid'
    - Updates billing_status to 'paid' when invoice status is 'paid'
    - Updates billing_status back to 'not_billed' when invoice is deleted or status changes to 'draft' or 'cancelled'

  2. Security
    - Trigger runs with security definer to ensure proper permissions
*/

-- Function to update work billing status based on invoice status
CREATE OR REPLACE FUNCTION update_work_billing_status_from_invoice()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_id UUID;
BEGIN
  -- Get work_id from invoice
  IF TG_OP = 'DELETE' THEN
    v_work_id := OLD.work_id;
  ELSE
    v_work_id := NEW.work_id;
  END IF;

  -- Skip if work_id is null
  IF v_work_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Update work billing status based on invoice status
  IF TG_OP = 'DELETE' OR (NEW.status IN ('draft', 'cancelled')) THEN
    -- Check if there are other non-draft/cancelled invoices for this work
    IF NOT EXISTS (
      SELECT 1 FROM invoices
      WHERE work_id = v_work_id
        AND status NOT IN ('draft', 'cancelled')
        AND id != COALESCE(NEW.id, OLD.id)
    ) THEN
      -- No other invoices, set to not_billed
      UPDATE works
      SET billing_status = 'not_billed',
          updated_at = NOW()
      WHERE id = v_work_id;
    END IF;
  ELSIF NEW.status = 'paid' THEN
    -- Invoice is paid, update work to paid
    UPDATE works
    SET billing_status = 'paid',
        updated_at = NOW()
    WHERE id = v_work_id;
  ELSIF NEW.status = 'sent' THEN
    -- Invoice is sent, update work to billed (if not already paid)
    UPDATE works
    SET billing_status = 'billed',
        updated_at = NOW()
    WHERE id = v_work_id
      AND billing_status != 'paid';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_work_billing_on_invoice_change ON invoices;
DROP TRIGGER IF EXISTS update_work_billing_on_invoice_delete ON invoices;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER update_work_billing_on_invoice_change
  AFTER INSERT OR UPDATE OF status, work_id
  ON invoices
  FOR EACH ROW
  WHEN (NEW.work_id IS NOT NULL)
  EXECUTE FUNCTION update_work_billing_status_from_invoice();

-- Create trigger for DELETE
CREATE TRIGGER update_work_billing_on_invoice_delete
  AFTER DELETE
  ON invoices
  FOR EACH ROW
  WHEN (OLD.work_id IS NOT NULL)
  EXECUTE FUNCTION update_work_billing_status_from_invoice();
