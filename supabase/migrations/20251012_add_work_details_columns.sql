/*
  # Add Work Details Columns

  ## Overview
  Adds missing columns to the works table for comprehensive work management:
  - work_location: Location where work is performed
  - department: Department responsible for the work
  - requirements: Detailed requirements and instructions
  - deliverables: Expected deliverables upon completion

  ## Changes
  1. Add new columns to works table with proper defaults
  2. These fields are optional (nullable) to maintain backward compatibility

  ## Security
  - No RLS changes needed (already covered by existing policies)
*/

-- Add missing columns to works table
DO $$
BEGIN
  -- Add work_location column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'work_location'
  ) THEN
    ALTER TABLE works ADD COLUMN work_location text;
  END IF;

  -- Add department column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'department'
  ) THEN
    ALTER TABLE works ADD COLUMN department text;
  END IF;

  -- Add requirements column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'requirements'
  ) THEN
    ALTER TABLE works ADD COLUMN requirements text;
  END IF;

  -- Add deliverables column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'deliverables'
  ) THEN
    ALTER TABLE works ADD COLUMN deliverables text;
  END IF;
END $$;

-- Create or replace function to auto-generate invoice for recurring instances
CREATE OR REPLACE FUNCTION auto_generate_recurring_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_work_record record;
  v_customer_id uuid;
  v_tax_rate numeric(5, 2);
  v_payment_terms text;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
BEGIN
  -- Only proceed if instance is completed and not already billed
  IF NEW.status = 'completed' AND
     NEW.is_billed = false AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get work information
    SELECT w.*, w.customer_id
    INTO v_work_record
    FROM works w
    WHERE w.id = NEW.work_id;

    v_customer_id := v_work_record.customer_id;

    -- Get service info for tax rate and payment terms
    SELECT COALESCE(payment_terms, 'net_30'), COALESCE(tax_rate, 18)
    INTO v_payment_terms, v_tax_rate
    FROM services
    WHERE id = v_work_record.service_id;

    -- Calculate amounts
    v_subtotal := NEW.billing_amount;
    v_tax_amount := ROUND(v_subtotal * (v_tax_rate / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date
    IF v_payment_terms = 'net_15' THEN
      v_due_date := CURRENT_DATE + INTERVAL '15 days';
    ELSIF v_payment_terms = 'net_30' THEN
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    ELSIF v_payment_terms = 'net_45' THEN
      v_due_date := CURRENT_DATE + INTERVAL '45 days';
    ELSIF v_payment_terms = 'net_60' THEN
      v_due_date := CURRENT_DATE + INTERVAL '60 days';
    ELSIF v_payment_terms = 'due_on_receipt' THEN
      v_due_date := CURRENT_DATE;
    ELSE
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    -- Generate invoice number
    v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8);

    -- Create invoice
    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status,
      notes
    ) VALUES (
      v_work_record.user_id,
      v_customer_id,
      NEW.work_id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for recurring period: ' || NEW.period_name
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item
    INSERT INTO invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      amount
    ) VALUES (
      v_invoice_id,
      v_work_record.title || ' - ' || NEW.period_name,
      1,
      v_subtotal,
      v_total_amount
    );

    -- Update recurring instance
    UPDATE work_recurring_instances
    SET is_billed = true,
        invoice_id = v_invoice_id
    WHERE id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for recurring instances
DROP TRIGGER IF EXISTS trigger_auto_generate_recurring_invoice ON work_recurring_instances;
CREATE TRIGGER trigger_auto_generate_recurring_invoice
  AFTER INSERT OR UPDATE OF status ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_recurring_invoice();

-- Create function to increment work hours
CREATE OR REPLACE FUNCTION increment_work_hours(work_id uuid, hours_to_add numeric)
RETURNS void AS $$
BEGIN
  UPDATE works
  SET actual_duration_hours = COALESCE(actual_duration_hours, 0) + hours_to_add,
      updated_at = now()
  WHERE id = work_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
