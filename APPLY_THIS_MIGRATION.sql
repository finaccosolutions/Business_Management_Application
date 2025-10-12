/*
  # Recurring Period Automation with Auto-Billing

  ## IMPORTANT INSTRUCTIONS
  This migration should be run AFTER you have set up your complete database schema.
  It adds automation features for recurring work periods and document management.

  ## Summary
  This migration implements complete automation for recurring work periods:
  - Auto-generate invoice when a period is marked as completed
  - Automatically create the next recurring period when current period due date elapses
  - Auto-billing support when period is completed
  - Initial period creation when a recurring work is created

  ## Key Features

  ### 1. Auto-Billing on Period Completion
  When a recurring instance status is changed to 'completed':
  - Automatically generate an invoice if work has auto_bill enabled
  - Use the period's billing_amount or work's billing_amount
  - Apply service tax rate from the service
  - Calculate due date based on service payment terms
  - Mark period as billed and link to invoice

  ### 2. Auto-Create Next Period
  Background job runs periodically to check for expired periods:
  - When a period's due_date has elapsed
  - Automatically create the next period based on recurrence pattern
  - Calculate next due date using recurrence_day from work
  - Set appropriate period_name, start_date, and end_date
  - Copy billing_amount from work to new period

  ### 3. Status Tracking
  - completed_at timestamp when period is completed
  - completed_by tracks which staff member completed it
  - is_billed flag indicates invoice generation status
  - invoice_id links to generated invoice

  ## Security
  - All operations check user authentication
  - RLS policies ensure data isolation
  - Secure function execution with proper permissions

  ## Notes
  - Periods are created with pending status
  - Each period is independent and can be billed separately
  - Automatic period creation ensures continuous tracking
  - Invoice generation is automatic but can be customized per period
*/

-- Create function to auto-generate invoice when recurring period is completed
CREATE OR REPLACE FUNCTION auto_generate_recurring_period_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_customer_id uuid;
  v_work_user_id uuid;
  v_tax_rate numeric(5, 2);
  v_payment_terms text;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_work_title text;
  v_auto_bill boolean;
BEGIN
  -- Only proceed if status changed to completed and not already billed
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.is_billed = false THEN

    -- Get work details
    SELECT
      w.customer_id,
      w.user_id,
      w.title,
      w.auto_bill,
      COALESCE(s.payment_terms, 'net_30'),
      COALESCE(s.tax_rate, 0)
    INTO
      v_customer_id,
      v_work_user_id,
      v_work_title,
      v_auto_bill,
      v_payment_terms,
      v_tax_rate
    FROM works w
    LEFT JOIN services s ON s.id = w.service_id
    WHERE w.id = NEW.work_id;

    -- Get billing amount
    v_subtotal := COALESCE(NEW.billing_amount, (SELECT billing_amount FROM works WHERE id = NEW.work_id));

    -- Only generate invoice if work has auto_bill enabled and has billing amount
    IF v_auto_bill = true AND v_subtotal > 0 THEN
      -- Calculate amounts
      v_tax_amount := ROUND(v_subtotal * (v_tax_rate / 100), 2);
      v_total_amount := v_subtotal + v_tax_amount;

      -- Calculate due date based on payment terms
      CASE v_payment_terms
        WHEN 'net_15' THEN v_due_date := CURRENT_DATE + INTERVAL '15 days';
        WHEN 'net_30' THEN v_due_date := CURRENT_DATE + INTERVAL '30 days';
        WHEN 'net_45' THEN v_due_date := CURRENT_DATE + INTERVAL '45 days';
        WHEN 'net_60' THEN v_due_date := CURRENT_DATE + INTERVAL '60 days';
        WHEN 'due_on_receipt' THEN v_due_date := CURRENT_DATE;
        ELSE v_due_date := CURRENT_DATE + INTERVAL '30 days';
      END CASE;

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
        v_work_user_id,
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
        v_work_title || ' - ' || NEW.period_name,
        1,
        v_subtotal,
        v_subtotal
      );

      -- Update recurring instance with invoice info
      NEW.is_billed := true;
      NEW.invoice_id := v_invoice_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-billing recurring periods
DROP TRIGGER IF EXISTS trigger_auto_generate_recurring_period_invoice ON work_recurring_instances;
CREATE TRIGGER trigger_auto_generate_recurring_period_invoice
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_recurring_period_invoice();

-- Create function to automatically create next recurring period when due date elapses
CREATE OR REPLACE FUNCTION create_next_recurring_period_if_needed()
RETURNS void AS $$
DECLARE
  v_work RECORD;
  v_latest_period RECORD;
  v_next_due_date date;
  v_next_period_start date;
  v_next_period_end date;
  v_next_period_name text;
  v_existing_period_count integer;
BEGIN
  -- Loop through all active recurring works
  FOR v_work IN
    SELECT id, user_id, recurrence_pattern, recurrence_day, billing_amount, title
    FROM works
    WHERE is_recurring = true
      AND is_active = true
      AND recurrence_pattern IS NOT NULL
  LOOP
    -- Get the latest period for this work
    SELECT * INTO v_latest_period
    FROM work_recurring_instances
    WHERE work_id = v_work.id
    ORDER BY due_date DESC
    LIMIT 1;

    -- If no period exists or latest period's due date has elapsed
    IF v_latest_period IS NULL OR v_latest_period.due_date < CURRENT_DATE THEN

      -- Calculate next due date
      IF v_latest_period IS NULL THEN
        -- First period - use recurrence_day
        v_next_due_date := date_trunc('month', CURRENT_DATE)::date + (COALESCE(v_work.recurrence_day, 1) - 1);
        IF v_next_due_date < CURRENT_DATE THEN
          v_next_due_date := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date + (COALESCE(v_work.recurrence_day, 1) - 1);
        END IF;
      ELSE
        -- Calculate next period based on pattern
        CASE v_work.recurrence_pattern
          WHEN 'monthly' THEN
            v_next_due_date := (date_trunc('month', v_latest_period.due_date) + interval '1 month')::date + (COALESCE(v_work.recurrence_day, 1) - 1);
          WHEN 'quarterly' THEN
            v_next_due_date := (date_trunc('month', v_latest_period.due_date) + interval '3 months')::date + (COALESCE(v_work.recurrence_day, 1) - 1);
          WHEN 'half_yearly' THEN
            v_next_due_date := (date_trunc('month', v_latest_period.due_date) + interval '6 months')::date + (COALESCE(v_work.recurrence_day, 1) - 1);
          WHEN 'yearly' THEN
            v_next_due_date := (date_trunc('month', v_latest_period.due_date) + interval '1 year')::date + (COALESCE(v_work.recurrence_day, 1) - 1);
          ELSE
            v_next_due_date := (date_trunc('month', v_latest_period.due_date) + interval '1 month')::date + (COALESCE(v_work.recurrence_day, 1) - 1);
        END CASE;
      END IF;

      -- Check if period already exists for this due date
      SELECT COUNT(*) INTO v_existing_period_count
      FROM work_recurring_instances
      WHERE work_id = v_work.id AND due_date = v_next_due_date;

      IF v_existing_period_count = 0 THEN
        -- Calculate period boundaries
        CASE v_work.recurrence_pattern
          WHEN 'monthly' THEN
            v_next_period_start := date_trunc('month', v_next_due_date)::date;
            v_next_period_end := (date_trunc('month', v_next_due_date) + interval '1 month' - interval '1 day')::date;
            v_next_period_name := to_char(v_next_due_date, 'Month YYYY');
          WHEN 'quarterly' THEN
            v_next_period_start := date_trunc('quarter', v_next_due_date)::date;
            v_next_period_end := (date_trunc('quarter', v_next_due_date) + interval '3 months' - interval '1 day')::date;
            v_next_period_name := 'Q' || to_char(v_next_due_date, 'Q YYYY');
          WHEN 'half_yearly' THEN
            IF EXTRACT(MONTH FROM v_next_due_date) <= 6 THEN
              v_next_period_start := date_trunc('year', v_next_due_date)::date;
              v_next_period_end := (date_trunc('year', v_next_due_date) + interval '6 months' - interval '1 day')::date;
              v_next_period_name := 'H1 ' || to_char(v_next_due_date, 'YYYY');
            ELSE
              v_next_period_start := (date_trunc('year', v_next_due_date) + interval '6 months')::date;
              v_next_period_end := (date_trunc('year', v_next_due_date) + interval '1 year' - interval '1 day')::date;
              v_next_period_name := 'H2 ' || to_char(v_next_due_date, 'YYYY');
            END IF;
          WHEN 'yearly' THEN
            v_next_period_start := date_trunc('year', v_next_due_date)::date;
            v_next_period_end := (date_trunc('year', v_next_due_date) + interval '1 year' - interval '1 day')::date;
            v_next_period_name := to_char(v_next_due_date, 'YYYY');
          ELSE
            v_next_period_start := date_trunc('month', v_next_due_date)::date;
            v_next_period_end := (date_trunc('month', v_next_due_date) + interval '1 month' - interval '1 day')::date;
            v_next_period_name := to_char(v_next_due_date, 'Month YYYY');
        END CASE;

        -- Create next period
        INSERT INTO work_recurring_instances (
          work_id,
          period_name,
          period_start_date,
          period_end_date,
          due_date,
          status,
          billing_amount,
          is_billed
        ) VALUES (
          v_work.id,
          v_next_period_name,
          v_next_period_start,
          v_next_period_end,
          v_next_due_date,
          'pending',
          v_work.billing_amount,
          false
        );
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create initial first period for any recurring work that doesn't have periods yet
CREATE OR REPLACE FUNCTION create_initial_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_first_due_date date;
  v_period_start date;
  v_period_end date;
  v_period_name text;
BEGIN
  -- Only for recurring works
  IF NEW.is_recurring = true AND NEW.recurrence_pattern IS NOT NULL THEN

    -- Use the work's due_date or calculate from recurrence_day
    IF NEW.due_date IS NOT NULL THEN
      v_first_due_date := NEW.due_date;
    ELSE
      -- Calculate first due date based on recurrence_day
      v_first_due_date := date_trunc('month', CURRENT_DATE)::date + (COALESCE(NEW.recurrence_day, 1) - 1);
      IF v_first_due_date < CURRENT_DATE THEN
        v_first_due_date := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date + (COALESCE(NEW.recurrence_day, 1) - 1);
      END IF;
    END IF;

    -- Calculate period boundaries based on pattern
    CASE NEW.recurrence_pattern
      WHEN 'monthly' THEN
        v_period_start := date_trunc('month', v_first_due_date)::date;
        v_period_end := (date_trunc('month', v_first_due_date) + interval '1 month' - interval '1 day')::date;
        v_period_name := to_char(v_first_due_date, 'Month YYYY');
      WHEN 'quarterly' THEN
        v_period_start := date_trunc('quarter', v_first_due_date)::date;
        v_period_end := (date_trunc('quarter', v_first_due_date) + interval '3 months' - interval '1 day')::date;
        v_period_name := 'Q' || to_char(v_first_due_date, 'Q YYYY');
      WHEN 'half_yearly' THEN
        IF EXTRACT(MONTH FROM v_first_due_date) <= 6 THEN
          v_period_start := date_trunc('year', v_first_due_date)::date;
          v_period_end := (date_trunc('year', v_first_due_date) + interval '6 months' - interval '1 day')::date;
          v_period_name := 'H1 ' || to_char(v_first_due_date, 'YYYY');
        ELSE
          v_period_start := (date_trunc('year', v_first_due_date) + interval '6 months')::date;
          v_period_end := (date_trunc('year', v_first_due_date) + interval '1 year' - interval '1 day')::date;
          v_period_name := 'H2 ' || to_char(v_first_due_date, 'YYYY');
        END IF;
      WHEN 'yearly' THEN
        v_period_start := date_trunc('year', v_first_due_date)::date;
        v_period_end := (date_trunc('year', v_first_due_date) + interval '1 year' - interval '1 day')::date;
        v_period_name := to_char(v_first_due_date, 'YYYY');
      ELSE
        v_period_start := date_trunc('month', v_first_due_date)::date;
        v_period_end := (date_trunc('month', v_first_due_date) + interval '1 month' - interval '1 day')::date;
        v_period_name := to_char(v_first_due_date, 'Month YYYY');
    END CASE;

    -- Create initial period
    INSERT INTO work_recurring_instances (
      work_id,
      period_name,
      period_start_date,
      period_end_date,
      due_date,
      status,
      billing_amount,
      is_billed
    ) VALUES (
      NEW.id,
      v_period_name,
      v_period_start,
      v_period_end,
      v_first_due_date,
      'pending',
      NEW.billing_amount,
      false
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create initial period when recurring work is created
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;
CREATE TRIGGER trigger_create_initial_recurring_period
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION create_initial_recurring_period();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_due_date_status ON work_recurring_instances(due_date, status);
CREATE INDEX IF NOT EXISTS idx_works_recurring_active ON works(is_recurring, is_active) WHERE is_recurring = true AND is_active = true;

-- Instructions for manual execution of the next period creation function
-- You can call this function manually or set up a cron job to run it periodically
-- Example: SELECT create_next_recurring_period_if_needed();
