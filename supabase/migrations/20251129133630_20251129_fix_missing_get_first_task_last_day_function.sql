/*
  # Fix Missing get_first_task_last_day_of_period Function
  
  ## Problem
  - Function `get_first_task_last_day_of_period(uuid, date, date)` is being called in `should_create_period`
  - But this function doesn't exist in the database
  - Error: "function get_first_task_last_day_of_period(uuid, date, date) does not exist"
  
  ## Solution
  - Create the missing function that calculates the last day of first tasks in a period
  - This function determines when all first tasks for a period are completed
  - Used by `should_create_period` to determine if next period should be created
  
  ## Implementation
  - Function takes work_id, period_start_date, period_end_date
  - Returns the latest due date among all first tasks for that period
  - Returns NULL if no tasks exist
*/

-- Create the missing function that calculates first task's last due date
DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(uuid, date, date) CASCADE;

CREATE FUNCTION get_first_task_last_day_of_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_last_due_date DATE := NULL;
  v_task RECORD;
  v_due_date DATE;
BEGIN
  -- Get the service and recurrence type from the work
  SELECT s.id, s.recurrence_type
  INTO v_service_id, v_recurrence_type
  FROM works w
  JOIN services s ON w.service_id = s.id
  WHERE w.id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Find all first tasks (task_period_type = 'first' or just monthly tasks for monthly recurrence)
  FOR v_task IN
    SELECT st.id, st.task_recurrence_type, st.due_day_of_month, 
           st.due_date_offset_days, st.exact_due_date, st.task_period_type
    FROM service_tasks st
    WHERE st.service_id = v_service_id
      AND st.is_active = TRUE
      AND (st.task_period_type IS NULL OR st.task_period_type = 'monthly')
  LOOP
    -- Calculate due date for this task
    v_due_date := calculate_task_due_date_for_period(
      v_task.id,
      p_period_start_date,
      p_period_end_date
    );
    
    IF v_due_date IS NOT NULL THEN
      IF v_last_due_date IS NULL OR v_due_date > v_last_due_date THEN
        v_last_due_date := v_due_date;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_last_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Ensure the helper function exists
DROP FUNCTION IF EXISTS calculate_task_due_date_for_month(uuid, integer, integer) CASCADE;

CREATE FUNCTION calculate_task_due_date_for_month(
  p_task_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_last_day_of_month INTEGER;
  v_target_day INTEGER;
BEGIN
  SELECT * INTO v_task FROM service_tasks WHERE id = p_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- If exact_due_date is set, use it
  IF v_task.exact_due_date IS NOT NULL THEN
    RETURN v_task.exact_due_date;
  END IF;
  
  -- If due_day_of_month is set
  IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
    -- Get the last day of the month
    v_last_day_of_month := EXTRACT(DAY FROM (DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01') 
                                  + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    
    -- Use the minimum of the specified day or the last day of month
    v_target_day := LEAST(v_task.due_day_of_month, v_last_day_of_month);
    
    v_due_date := DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-' || 
                       LPAD(v_target_day::TEXT, 2, '0'));
    
    RETURN v_due_date;
  END IF;
  
  -- Fallback: use due_date_offset_days from period end date
  IF v_task.due_date_offset_days IS NOT NULL THEN
    v_due_date := DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01') 
                  + INTERVAL '1 month' - INTERVAL '1 day'
                  + (v_task.due_date_offset_days || ' days')::INTERVAL;
    RETURN v_due_date::DATE;
  END IF;
  
  -- Default: end of month + 10 days
  RETURN (DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01') 
          + INTERVAL '1 month' - INTERVAL '1 day'
          + INTERVAL '10 days')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;
