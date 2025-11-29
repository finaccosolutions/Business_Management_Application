/*
  # Recreate Missing Task Due Date Calculation Functions
  
  ## Problem
  The function `calculate_task_due_date_for_period` was dropped but is still being called
  by `create_period_with_first_tasks`. This causes a "function does not exist" error.
  
  ## Solution
  Recreate the missing helper functions needed for task due date calculation.
  
  ## Functions Created
  1. get_month_name - Convert month number to month name
  2. calculate_task_due_date_for_period - Calculate due date for a task in a period
  3. get_monthly_task_months_in_period - Get all months where a monthly task appears
*/

-- Helper: Get month name from number
DROP FUNCTION IF EXISTS get_month_name(integer) CASCADE;

CREATE FUNCTION get_month_name(p_month_num INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_months TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'];
BEGIN
  IF p_month_num >= 1 AND p_month_num <= 12 THEN
    RETURN v_months[p_month_num];
  END IF;
  RETURN '';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper: Calculate the due date for a task within a specific period
DROP FUNCTION IF EXISTS calculate_task_due_date_for_period(uuid, date, date) CASCADE;

CREATE FUNCTION calculate_task_due_date_for_period(
  p_service_task_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_target_month INTEGER;
  v_target_year INTEGER;
  v_target_day INTEGER;
  v_last_day_of_month INTEGER;
BEGIN
  SELECT * INTO v_task FROM service_tasks WHERE id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN p_period_end_date + INTERVAL '10 days';
  END IF;
  
  -- If exact_due_date is set, use it
  IF v_task.exact_due_date IS NOT NULL THEN
    RETURN v_task.exact_due_date;
  END IF;
  
  -- If due_day_of_month is set (for monthly recurring tasks)
  IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
    v_target_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
    v_target_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
    
    -- Get the last day of the target month
    v_last_day_of_month := EXTRACT(DAY FROM (DATE(v_target_year || '-' || LPAD(v_target_month::TEXT, 2, '0') || '-01') 
                                    + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    
    -- Use the minimum of the specified day or the last day of month
    v_target_day := LEAST(v_task.due_day_of_month, v_last_day_of_month);
    
    v_due_date := DATE(v_target_year || '-' || LPAD(v_target_month::TEXT, 2, '0') || '-' || 
                       LPAD(v_target_day::TEXT, 2, '0'));
    
    RETURN v_due_date;
  END IF;
  
  -- Fallback: use due_date_offset_days from period end date
  IF v_task.due_date_offset_days IS NOT NULL THEN
    RETURN (p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL)::DATE;
  END IF;
  
  -- Default: 10 days after period end
  RETURN (p_period_end_date + INTERVAL '10 days')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Get all months a monthly recurring task should appear in within a quarter
DROP FUNCTION IF EXISTS get_monthly_task_months_in_period(uuid, date, date) CASCADE;

CREATE FUNCTION get_monthly_task_months_in_period(
  p_task_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS TABLE(month_num INTEGER, month_name TEXT, due_date DATE) AS $$
DECLARE
  v_task RECORD;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_year INTEGER;
  v_end_month INTEGER;
  v_due_date DATE;
  v_last_day INTEGER;
BEGIN
  SELECT * INTO v_task FROM service_tasks WHERE id = p_task_id;
  
  IF v_task IS NULL OR v_task.task_recurrence_type != 'monthly' THEN
    RETURN;
  END IF;
  
  v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  
  v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
  v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
  
  WHILE (v_current_year < v_end_year OR 
         (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
    
    -- Calculate due date for this month
    IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
      v_last_day := EXTRACT(DAY FROM (DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01') 
                            + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
      v_due_date := DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-' || 
                        LPAD(LEAST(v_task.due_day_of_month, v_last_day)::TEXT, 2, '0'));
    ELSE
      v_due_date := ((DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01') 
                    + INTERVAL '1 month' - INTERVAL '1 day')::DATE
                    + (COALESCE(v_task.due_date_offset_days, 10) || ' days')::INTERVAL)::DATE;
    END IF;
    
    RETURN QUERY
    SELECT v_current_month, get_month_name(v_current_month), v_due_date;
    
    v_current_month := v_current_month + 1;
    IF v_current_month > 12 THEN
      v_current_month := 1;
      v_current_year := v_current_year + 1;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
