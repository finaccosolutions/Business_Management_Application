/*
  # Fix create_initial_recurring_period and disable duplicate triggers

  1. Problems Fixed
    - Fix st.due_date_offset to st.due_date_offset_days in create_initial_recurring_period
    - Disable duplicate trigger trigger_create_initial_recurring_period (keep only trigger_handle_new_recurring_work_initial_period)
    - Both triggers do the same thing and cause conflicts

  2. Solution
    - Update create_initial_recurring_period function with correct column name
    - Drop the trigger_create_initial_recurring_period trigger to avoid duplication
    - Keep trigger_handle_new_recurring_work_initial_period as the active one
*/

-- Drop the duplicate trigger (we'll keep trigger_handle_new_recurring_work_initial_period)
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;

-- Update create_initial_recurring_period function with correct column reference
-- (Keep function in case it's used elsewhere, but fix the column name)
CREATE OR REPLACE FUNCTION create_initial_recurring_period()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_recurrence_pattern TEXT;
  v_recurrence_day INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_billing_amount NUMERIC;
  v_new_period_id UUID;
  v_year INTEGER;
  v_month INTEGER;
  v_quarter INTEGER;
BEGIN
  -- Only proceed if work is recurring and this is an INSERT
  IF NEW.is_recurring != TRUE OR TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Get work details
  v_recurrence_pattern := NEW.recurrence_pattern;
  v_recurrence_day := NEW.recurrence_day;
  v_billing_amount := NEW.billing_amount;
  v_year := EXTRACT(YEAR FROM NEW.start_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM NEW.start_date)::INTEGER;

  -- Calculate period dates based on recurrence pattern
  IF v_recurrence_pattern = 'monthly' THEN
    IF v_month = 1 THEN
      v_period_start := MAKE_DATE(v_year - 1, 12, 1);
      v_period_end := MAKE_DATE(v_year - 1, 12, 31);
      v_period_name := 'December ' || (v_year - 1)::TEXT;
    ELSE
      v_period_start := MAKE_DATE(v_year, v_month - 1, 1);
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month - 1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
    END IF;

  ELSIF v_recurrence_pattern = 'quarterly' THEN
    v_quarter := CEIL(v_month / 3.0)::INTEGER - 1;
    IF v_quarter = 0 THEN
      v_quarter := 4;
      v_year := v_year - 1;
    END IF;
    v_period_start := MAKE_DATE(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '3 months - 1 day')::DATE;
    v_period_name := 'Q' || v_quarter || ' ' || v_year::TEXT;

  ELSIF v_recurrence_pattern = 'yearly' THEN
    IF v_month <= 3 THEN
      v_period_start := MAKE_DATE(v_year - 2, 4, 1);
      v_period_end := MAKE_DATE(v_year - 1, 3, 31);
      v_period_name := 'FY ' || (v_year - 2)::TEXT || '-' || RIGHT((v_year - 1)::TEXT, 2);
    ELSE
      v_period_start := MAKE_DATE(v_year - 1, 4, 1);
      v_period_end := MAKE_DATE(v_year, 3, 31);
      v_period_name := 'FY ' || (v_year - 1)::TEXT || '-' || RIGHT(v_year::TEXT, 2);
    END IF;

  ELSIF v_recurrence_pattern = 'half_yearly' THEN
    IF v_month <= 6 THEN
      v_period_start := MAKE_DATE(v_year - 1, 7, 1);
      v_period_end := MAKE_DATE(v_year - 1, 12, 31);
      v_period_name := 'H2 ' || (v_year - 1)::TEXT;
    ELSE
      v_period_start := MAKE_DATE(v_year, 1, 1);
      v_period_end := MAKE_DATE(v_year, 6, 30);
      v_period_name := 'H1 ' || v_year::TEXT;
    END IF;

  ELSE
    -- Default: previous month
    IF v_month = 1 THEN
      v_period_start := MAKE_DATE(v_year - 1, 12, 1);
      v_period_end := MAKE_DATE(v_year - 1, 12, 31);
      v_period_name := 'December ' || (v_year - 1)::TEXT;
    ELSE
      v_period_start := MAKE_DATE(v_year, v_month - 1, 1);
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month - 1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
    END IF;
  END IF;

  -- Check if period already exists
  IF EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = NEW.id
    AND period_start_date = v_period_start
    AND period_end_date = v_period_end
  ) THEN
    RETURN NEW;
  END IF;

  -- Insert the first period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    billing_amount,
    status,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    NEW.id,
    v_period_name,
    v_period_start,
    v_period_end,
    v_billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks with FIXED column name: due_date_offset_days
  INSERT INTO recurring_period_tasks (
    work_recurring_instance_id,
    title,
    description,
    assigned_to,
    status,
    priority,
    estimated_hours,
    sort_order,
    due_date
  )
  SELECT
    v_new_period_id,
    st.title,
    st.description,
    NEW.assigned_to,
    'pending',
    st.priority,
    st.estimated_hours,
    st.sort_order,
    CASE
      WHEN st.due_date_offset_days IS NOT NULL THEN
        NEW.start_date + (st.due_date_offset_days || ' days')::INTERVAL
      ELSE
        NEW.start_date + INTERVAL '10 days'
    END
  FROM service_tasks st
  WHERE st.service_id = NEW.service_id
  ORDER BY st.sort_order;

  -- Update task counts
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_new_period_id
  )
  WHERE id = v_new_period_id;

  -- Copy documents
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    notes
  )
  SELECT
    v_new_period_id,
    wd.id,
    FALSE,
    NULL
  FROM work_documents wd
  WHERE wd.work_id = NEW.id;

  RETURN NEW;
END;
$$;
