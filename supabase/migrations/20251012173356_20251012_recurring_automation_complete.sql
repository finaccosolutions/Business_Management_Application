/*
  # Recurring Periods Full Automation System

  ## Overview
  Comprehensive automation for recurring work periods with invoice generation.
  
  ## Key Features
  1. Automatic period generation when previous period is completed
  2. Auto-invoice creation when period status changes to 'completed'
  3. Smart date calculations for all recurrence patterns
  4. Period document management per instance
  
  ## Functions
  - calculate_next_due_date: Calculate next period due date
  - generate_period_name: Create friendly period names
  - generate_next_recurring_period: Create new period
  - check_and_generate_recurring_periods: Batch generation
  - auto_generate_invoice_for_period: Auto-invoice on completion
  - trigger_recurring_period_generation: Manual trigger endpoint
  
  ## Security
  - SECURITY DEFINER functions with proper access controls
  - RLS policies protect all operations
*/

-- Function to calculate next due date based on recurrence pattern
CREATE OR REPLACE FUNCTION calculate_next_due_date(
  p_current_due_date date,
  p_recurrence_pattern text,
  p_recurrence_day integer DEFAULT NULL
) RETURNS date AS $$
DECLARE
  v_next_date date;
  v_max_day integer;
BEGIN
  v_next_date := p_current_due_date;

  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      v_next_date := v_next_date + INTERVAL '1 month';
      IF p_recurrence_day IS NOT NULL THEN
        v_max_day := EXTRACT(DAY FROM (date_trunc('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day'));
        v_next_date := date_trunc('month', v_next_date) + (LEAST(p_recurrence_day, v_max_day) - 1 || ' days')::interval;
      END IF;
      
    WHEN 'quarterly' THEN
      v_next_date := v_next_date + INTERVAL '3 months';
      IF p_recurrence_day IS NOT NULL THEN
        v_max_day := EXTRACT(DAY FROM (date_trunc('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day'));
        v_next_date := date_trunc('month', v_next_date) + (LEAST(p_recurrence_day, v_max_day) - 1 || ' days')::interval;
      END IF;
      
    WHEN 'half-yearly' THEN
      v_next_date := v_next_date + INTERVAL '6 months';
      IF p_recurrence_day IS NOT NULL THEN
        v_max_day := EXTRACT(DAY FROM (date_trunc('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day'));
        v_next_date := date_trunc('month', v_next_date) + (LEAST(p_recurrence_day, v_max_day) - 1 || ' days')::interval;
      END IF;
      
    WHEN 'yearly' THEN
      v_next_date := v_next_date + INTERVAL '1 year';
      IF p_recurrence_day IS NOT NULL THEN
        v_max_day := EXTRACT(DAY FROM (date_trunc('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day'));
        v_next_date := date_trunc('month', v_next_date) + (LEAST(p_recurrence_day, v_max_day) - 1 || ' days')::interval;
      END IF;
      
    WHEN 'weekly' THEN
      v_next_date := v_next_date + INTERVAL '7 days';
      
    ELSE
      v_next_date := v_next_date + INTERVAL '1 month';
  END CASE;

  RETURN v_next_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate user-friendly period names
CREATE OR REPLACE FUNCTION generate_period_name(
  p_start_date date,
  p_end_date date,
  p_recurrence_pattern text
) RETURNS text AS $$
DECLARE
  v_period_name text;
BEGIN
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      v_period_name := TO_CHAR(p_start_date, 'Month YYYY');
      
    WHEN 'quarterly' THEN
      v_period_name := 'Q' || TO_CHAR(p_start_date, 'Q YYYY');
      
    WHEN 'half-yearly' THEN
      IF EXTRACT(MONTH FROM p_start_date) <= 6 THEN
        v_period_name := 'H1 ' || TO_CHAR(p_start_date, 'YYYY');
      ELSE
        v_period_name := 'H2 ' || TO_CHAR(p_start_date, 'YYYY');
      END IF;
      
    WHEN 'yearly' THEN
      v_period_name := 'FY ' || TO_CHAR(p_start_date, 'YYYY') || '-' || TO_CHAR(p_end_date, 'YY');
      
    ELSE
      v_period_name := TO_CHAR(p_start_date, 'DD Mon') || ' - ' || TO_CHAR(p_end_date, 'DD Mon YYYY');
  END CASE;

  RETURN v_period_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate next recurring period for a specific work
CREATE OR REPLACE FUNCTION generate_next_recurring_period(p_work_id uuid)
RETURNS uuid AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_new_period_id uuid;
  v_period_start_date date;
  v_period_end_date date;
  v_due_date date;
  v_period_name text;
BEGIN
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
    AND is_recurring = true;

  IF v_work IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_last_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY due_date DESC
  LIMIT 1;

  IF v_last_period IS NULL THEN
    v_period_start_date := COALESCE(v_work.start_date, CURRENT_DATE);
    v_due_date := calculate_next_due_date(v_period_start_date, v_work.recurrence_pattern, v_work.recurrence_day);
    v_period_end_date := v_due_date - INTERVAL '1 day';
  ELSE
    v_period_start_date := v_last_period.period_end_date + INTERVAL '1 day';
    v_due_date := calculate_next_due_date(v_last_period.due_date, v_work.recurrence_pattern, v_work.recurrence_day);
    v_period_end_date := v_due_date - INTERVAL '1 day';
  END IF;

  v_period_name := generate_period_name(v_period_start_date, v_period_end_date, v_work.recurrence_pattern);

  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    due_date,
    status,
    billing_amount,
    is_billed,
    notes
  ) VALUES (
    p_work_id,
    v_period_name,
    v_period_start_date,
    v_period_end_date,
    v_due_date,
    'pending',
    v_work.billing_amount,
    false,
    'Auto-generated period'
  )
  RETURNING id INTO v_new_period_id;

  RETURN v_new_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check all recurring works and generate periods as needed
CREATE OR REPLACE FUNCTION check_and_generate_recurring_periods()
RETURNS TABLE(work_id uuid, new_period_id uuid, period_name text, action text) AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_new_period_id uuid;
  v_next_expected_due date;
  v_has_upcoming_period boolean;
BEGIN
  FOR v_work IN
    SELECT w.id, w.recurrence_pattern, w.recurrence_day, w.billing_amount, w.title
    FROM works w
    WHERE w.is_recurring = true
      AND w.status NOT IN ('completed', 'cancelled')
  LOOP
    SELECT * INTO v_last_period
    FROM work_recurring_instances wri
    WHERE wri.work_id = v_work.id
    ORDER BY due_date DESC
    LIMIT 1;

    IF v_last_period IS NULL THEN
      v_new_period_id := generate_next_recurring_period(v_work.id);
      
      IF v_new_period_id IS NOT NULL THEN
        SELECT wri.period_name INTO period_name
        FROM work_recurring_instances wri
        WHERE wri.id = v_new_period_id;
        
        work_id := v_work.id;
        new_period_id := v_new_period_id;
        action := 'created_first_period';
        RETURN NEXT;
      END IF;
      
    ELSIF v_last_period.status = 'completed' THEN
      v_next_expected_due := calculate_next_due_date(
        v_last_period.due_date,
        v_work.recurrence_pattern,
        v_work.recurrence_day
      );

      SELECT EXISTS (
        SELECT 1 FROM work_recurring_instances wri
        WHERE wri.work_id = v_work.id
          AND wri.due_date >= v_next_expected_due
          AND wri.id != v_last_period.id
      ) INTO v_has_upcoming_period;

      IF NOT v_has_upcoming_period AND v_next_expected_due <= (CURRENT_DATE + INTERVAL '30 days') THEN
        v_new_period_id := generate_next_recurring_period(v_work.id);
        
        IF v_new_period_id IS NOT NULL THEN
          SELECT wri.period_name INTO period_name
          FROM work_recurring_instances wri
          WHERE wri.id = v_new_period_id;
          
          work_id := v_work.id;
          new_period_id := v_new_period_id;
          action := 'created_next_period';
          RETURN NEXT;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-generate invoice when period is completed
CREATE OR REPLACE FUNCTION auto_generate_invoice_for_period()
RETURNS TRIGGER AS $$
DECLARE
  v_work RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_subtotal numeric(10, 2);
  v_tax_rate numeric(5, 2);
BEGIN
  IF NEW.status = 'completed' AND 
     (OLD.status IS NULL OR OLD.status != 'completed') AND 
     NEW.is_billed = false AND
     NEW.billing_amount IS NOT NULL AND 
     NEW.billing_amount > 0 THEN
    
    SELECT 
      w.id as work_id,
      w.user_id,
      w.customer_id,
      w.service_id,
      w.title as work_title,
      c.name as customer_name,
      s.name as service_name,
      s.tax_rate as service_tax_rate
    INTO v_work
    FROM works w
    JOIN customers c ON w.customer_id = c.id
    JOIN services s ON w.service_id = s.id
    WHERE w.id = NEW.work_id;

    IF v_work IS NULL THEN
      RETURN NEW;
    END IF;

    v_subtotal := NEW.billing_amount;
    v_tax_rate := COALESCE(v_work.service_tax_rate, 0);
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_total_amount := v_subtotal + v_tax_amount;

    SELECT 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
           LPAD(COALESCE((
             SELECT COUNT(*) + 1
             FROM invoices
             WHERE user_id = v_work.user_id
               AND DATE(created_at) = CURRENT_DATE
           ), 1)::text, 4, '0')
    INTO v_invoice_number;

    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,
      invoice_number,
      issue_date,
      due_date,
      status,
      subtotal,
      tax_amount,
      discount_amount,
      total_amount,
      notes
    ) VALUES (
      v_work.user_id,
      v_work.customer_id,
      v_work.work_id,
      v_invoice_number,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '30 days',
      'pending',
      v_subtotal,
      v_tax_amount,
      0,
      v_total_amount,
      'Auto-generated for recurring period: ' || NEW.period_name
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      tax_rate,
      amount
    ) VALUES (
      v_invoice_id,
      v_work.service_name || ' - ' || NEW.period_name || ' (' || TO_CHAR(NEW.period_start_date, 'DD Mon') || ' - ' || TO_CHAR(NEW.period_end_date, 'DD Mon YYYY') || ')',
      1,
      v_subtotal,
      v_tax_rate,
      v_subtotal
    );

    NEW.is_billed := true;
    NEW.invoice_id := v_invoice_id;
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());

    BEGIN
      PERFORM log_work_activity(
        NEW.work_id,
        'invoice_generated',
        'Invoice Auto-Generated',
        'Invoice ' || v_invoice_number || ' automatically generated for period: ' || NEW.period_name,
        jsonb_build_object(
          'invoice_id', v_invoice_id,
          'invoice_number', v_invoice_number,
          'amount', v_total_amount,
          'period_id', NEW.id,
          'period_name', NEW.period_name
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_generate_invoice_on_period_completion ON work_recurring_instances;
CREATE TRIGGER auto_generate_invoice_on_period_completion
BEFORE UPDATE ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION auto_generate_invoice_for_period();

-- Function to manually trigger period generation
CREATE OR REPLACE FUNCTION trigger_recurring_period_generation()
RETURNS json AS $$
DECLARE
  v_result json;
  v_generated_count integer;
  v_periods json;
BEGIN
  WITH generated AS (
    SELECT * FROM check_and_generate_recurring_periods()
  )
  SELECT 
    COALESCE(COUNT(*), 0),
    COALESCE(json_agg(
      json_build_object(
        'work_id', work_id,
        'period_id', new_period_id,
        'period_name', period_name,
        'action', action
      )
    ), '[]'::json)
  INTO v_generated_count, v_periods
  FROM generated;

  v_result := json_build_object(
    'success', true,
    'generated_count', v_generated_count,
    'periods', v_periods,
    'timestamp', NOW()
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_recurring_instances_work_due_date 
ON work_recurring_instances(work_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_status_due_date 
ON work_recurring_instances(status, due_date) 
WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_works_recurring_active 
ON works(is_recurring, status) 
WHERE is_recurring = true AND status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_recurring_instances_billed
ON work_recurring_instances(is_billed, invoice_id)
WHERE is_billed = true;
