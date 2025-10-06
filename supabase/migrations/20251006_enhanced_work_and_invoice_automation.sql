/*
  # Enhanced Work Management and Automatic Invoice Generation

  ## Overview
  This migration enhances the work management system with automatic invoice generation
  for completed works and improved recurring work period management.

  ## Changes

  ### 1. Add Missing Columns to Works Table
  - `work_type`: Regular or recurring work identifier
  - `is_active`: For recurring works to control if they should continue
  - `auto_bill`: Flag to enable automatic billing on completion

  ### 2. Add Missing Columns to Services Table
  - `recurrence_day`: Day of month for recurring services
  - `auto_generate_work`: Auto-generate work for recurring services
  - `payment_terms`: Default payment terms (net_30, net_15, due_on_receipt)

  ### 3. Add Columns to work_recurring_instances Table
  - `invoice_id`: Link to auto-generated invoice
  - `billing_amount`: Amount for this period
  - `is_billed`: Whether this period has been billed

  ### 4. Create Database Function for Auto Invoice Generation
  - Trigger function to automatically create invoice when work is completed
  - Creates invoice with line items based on work billing amount

  ### 5. Create Trigger for Work Completion
  - Automatically generates invoice when work status changes to 'completed'
  - Only generates if auto_bill is enabled and amount is specified

  ## Security
  - All tables maintain RLS policies
  - Users can only access their own data
*/

-- Add missing columns to works table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'work_type'
  ) THEN
    ALTER TABLE works ADD COLUMN work_type text DEFAULT 'regular';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE works ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'auto_bill'
  ) THEN
    ALTER TABLE works ADD COLUMN auto_bill boolean DEFAULT true;
  END IF;
END $$;

-- Add missing columns to services table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_day'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_day integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'auto_generate_work'
  ) THEN
    ALTER TABLE services ADD COLUMN auto_generate_work boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE services ADD COLUMN payment_terms text DEFAULT 'net_30';
  END IF;
END $$;

-- Add columns to work_recurring_instances table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'billing_amount'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN billing_amount numeric(10, 2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'is_billed'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN is_billed boolean DEFAULT false;
  END IF;
END $$;

-- Create function to auto-generate invoice for completed work
CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_customer_id uuid;
  v_service record;
BEGIN
  -- Only proceed if work is completed, auto_bill is enabled, and has billing amount
  IF NEW.status = 'completed' AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get customer_id and service info
    v_customer_id := NEW.customer_id;

    SELECT payment_terms INTO v_service
    FROM services
    WHERE id = NEW.service_id;

    -- Calculate due date based on payment terms
    IF v_service.payment_terms = 'net_15' THEN
      v_due_date := CURRENT_DATE + INTERVAL '15 days';
    ELSIF v_service.payment_terms = 'net_30' THEN
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    ELSIF v_service.payment_terms = 'due_on_receipt' THEN
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
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status
    ) VALUES (
      NEW.user_id,
      v_customer_id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      NEW.billing_amount,
      0,
      NEW.billing_amount,
      'draft'
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
      'Work: ' || NEW.title,
      1,
      NEW.billing_amount,
      NEW.billing_amount
    );

    -- Update work billing status
    UPDATE works
    SET billing_status = 'billed'
    WHERE id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic invoice generation
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER INSERT OR UPDATE OF status ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();

-- Create function to auto-generate invoice for completed recurring period
CREATE OR REPLACE FUNCTION auto_generate_recurring_period_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_work record;
  v_service record;
  v_billing_amount numeric(10, 2);
BEGIN
  -- Only proceed if period is completed and not yet billed
  IF NEW.status = 'completed' AND
     NEW.is_billed = false AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get work and service info
    SELECT w.*, s.payment_terms, s.default_price, w.billing_amount as work_billing_amount
    INTO v_work, v_service.payment_terms, v_service.default_price, v_billing_amount
    FROM works w
    JOIN services s ON w.service_id = s.id
    WHERE w.id = NEW.work_id AND w.auto_bill = true;

    -- Use recurring instance billing amount, or fall back to work billing amount, or service default price
    IF NEW.billing_amount IS NOT NULL AND NEW.billing_amount > 0 THEN
      v_billing_amount := NEW.billing_amount;
    ELSIF v_billing_amount IS NOT NULL AND v_billing_amount > 0 THEN
      v_billing_amount := v_billing_amount;
    ELSIF v_service.default_price IS NOT NULL THEN
      v_billing_amount := v_service.default_price;
    ELSE
      -- No billing amount available, skip invoice generation
      RETURN NEW;
    END IF;

    -- Only proceed if work has auto_bill enabled
    IF v_work.auto_bill = true THEN
      -- Calculate due date
      IF v_service.payment_terms = 'net_15' THEN
        v_due_date := CURRENT_DATE + INTERVAL '15 days';
      ELSIF v_service.payment_terms = 'net_30' THEN
        v_due_date := CURRENT_DATE + INTERVAL '30 days';
      ELSIF v_service.payment_terms = 'due_on_receipt' THEN
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
        invoice_number,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        total_amount,
        status
      ) VALUES (
        v_work.user_id,
        v_work.customer_id,
        v_invoice_number,
        CURRENT_DATE,
        v_due_date,
        v_billing_amount,
        0,
        v_billing_amount,
        'draft'
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
        'Work: ' || v_work.title || ' - Period: ' || NEW.period_name,
        1,
        v_billing_amount,
        v_billing_amount
      );

      -- Update recurring instance
      UPDATE work_recurring_instances
      SET is_billed = true, invoice_id = v_invoice_id
      WHERE id = NEW.id;

    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic recurring period invoice generation
DROP TRIGGER IF EXISTS trigger_auto_generate_recurring_period_invoice ON work_recurring_instances;
CREATE TRIGGER trigger_auto_generate_recurring_period_invoice
  AFTER INSERT OR UPDATE OF status ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_recurring_period_invoice();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_works_is_recurring ON works(is_recurring);
CREATE INDEX IF NOT EXISTS idx_works_is_active ON works(is_active);
CREATE INDEX IF NOT EXISTS idx_works_work_type ON works(work_type);
CREATE INDEX IF NOT EXISTS idx_works_auto_bill ON works(auto_bill);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_invoice_id ON work_recurring_instances(invoice_id);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_is_billed ON work_recurring_instances(is_billed);
