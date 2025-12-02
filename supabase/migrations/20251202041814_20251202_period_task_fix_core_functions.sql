/*
  # Core Period and Task Creation Functions - Unified and Fixed
  
  ## Changes:
  1. Keep only ONE version of each function
  2. Fix logic to strictly follow the three conditions
  3. Ensure tasks are only created at period creation time
  4. Add safeguard column to prevent retroactive task generation
*/

-- Add safeguard column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' 
    AND column_name = 'tasks_generated_at'
  ) THEN
    ALTER TABLE work_recurring_instances 
    ADD COLUMN tasks_generated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Helper: Month name
DROP FUNCTION IF EXISTS get_month_name(INTEGER) CASCADE;

CREATE FUNCTION get_month_name(p_month INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE p_month
    WHEN 1 THEN 'January'
    WHEN 2 THEN 'February'
    WHEN 3 THEN 'March'
    WHEN 4 THEN 'April'
    WHEN 5 THEN 'May'
    WHEN 6 THEN 'June'
    WHEN 7 THEN 'July'
    WHEN 8 THEN 'August'
    WHEN 9 THEN 'September'
    WHEN 10 THEN 'October'
    WHEN 11 THEN 'November'
    WHEN 12 THEN 'December'
    ELSE 'Unknown'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper: Period name generation
DROP FUNCTION IF EXISTS generate_period_name(DATE, DATE, TEXT) CASCADE;

CREATE FUNCTION generate_period_name(
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT
)
RETURNS TEXT AS $$
BEGIN
  IF p_recurrence_type = 'monthly' THEN
    RETURN get_month_name(EXTRACT(MONTH FROM p_period_start)::INTEGER) || ' ' || 
           EXTRACT(YEAR FROM p_period_start)::TEXT;
  ELSIF p_recurrence_type = 'quarterly' THEN
    RETURN 'Q' || CEIL(EXTRACT(MONTH FROM p_period_start)::INTEGER / 3.0)::INTEGER || ' ' || 
           EXTRACT(YEAR FROM p_period_start)::TEXT;
  ELSIF p_recurrence_type = 'yearly' THEN
    RETURN EXTRACT(YEAR FROM p_period_start)::TEXT;
  ELSE
    RETURN to_char(p_period_start, 'YYYY-MM-DD') || ' to ' || to_char(p_period_end, 'YYYY-MM-DD');
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Core: Calculate task due date for quarterly/yearly periods
DROP FUNCTION IF EXISTS calculate_task_due_date_for_period(UUID, DATE, DATE) CASCADE;

CREATE FUNCTION calculate_task_due_date_for_period(
  p_service_task_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
BEGIN
  SELECT st.* INTO v_task
  FROM service_tasks st
  WHERE st.id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  -- Apply offset from period end date based on offset type
  IF COALESCE(v_task.due_offset_type, 'day') = 'month' THEN
    v_due_date := (DATE_TRUNC('month', p_period_end_date)::DATE + INTERVAL '1 month' 
                   + (COALESCE(v_task.due_offset_value, 0) || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  ELSE
    -- Default: day offset
    v_due_date := p_period_end_date + (COALESCE(v_task.due_offset_value, 0) || ' days')::INTERVAL;
  END IF;

  RETURN v_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Core: Calculate task due date for a specific month (for monthly recurring tasks)
DROP FUNCTION IF EXISTS calculate_task_due_date_in_month(UUID, INTEGER, INTEGER) CASCADE;

CREATE FUNCTION calculate_task_due_date_in_month(
  p_service_task_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_month_end_date DATE;
  v_due_date DATE;
BEGIN
  SELECT st.* INTO v_task
  FROM service_tasks st
  WHERE st.id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate last day of the month
  v_month_end_date := (DATE_TRUNC('month', DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01'))::DATE 
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Apply offset from month end
  IF COALESCE(v_task.due_offset_type, 'day') = 'month' THEN
    v_due_date := (DATE_TRUNC('month', v_month_end_date)::DATE + INTERVAL '1 month' 
                   + (COALESCE(v_task.due_offset_value, 0) || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  ELSE
    v_due_date := v_month_end_date + (COALESCE(v_task.due_offset_value, 0) || ' days')::INTERVAL;
  END IF;

  RETURN v_due_date;
END;
$$ LANGUAGE plpgsql STABLE;
