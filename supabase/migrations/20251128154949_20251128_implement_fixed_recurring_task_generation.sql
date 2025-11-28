/*
  # Fix Recurring Task Due Dates and Names for Quarterly Works

  ## Overview
  This migration fixes three critical issues with quarterly recurring works:
  
  1. **Due Date Accuracy**: Tasks now calculate due dates based on the `due_day_of_month` 
     and `due_offset_type` from service tasks, ensuring accurate dates for monthly recurring 
     tasks within quarterly periods.
  
  2. **Monthly Task Naming**: When a task recurs monthly within a quarterly period, the task 
     title now automatically includes the month name (e.g., "GST Payment - July", 
     "GST Payment - August", "GST Payment - September").
  
  3. **Period Eligibility**: Tasks are only added for periods whose last day has elapsed 
     (CURRENT_DATE > period_end_date), ensuring future periods don't get premature tasks.

  ## Key Changes
  - New helper: `get_month_name()` - converts month number to name
  - Enhanced: `calculate_task_due_date_for_period()` - proper due date calculation per month
  - New helper: `get_monthly_task_months_in_period()` - lists all months where a monthly task appears
  - Rewritten: `get_tasks_to_add_for_period()` - supports monthly recurring tasks with month suffixes
*/

-- Helper: Get month name from number
CREATE OR REPLACE FUNCTION get_month_name(p_month_num INTEGER)
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
CREATE OR REPLACE FUNCTION calculate_task_due_date_for_period(
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
CREATE OR REPLACE FUNCTION get_monthly_task_months_in_period(
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
      -- Use offset if no specific day
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

-- Main: Get tasks to add for a period (FIXED VERSION)
CREATE OR REPLACE FUNCTION get_tasks_to_add_for_period(
  p_service_id UUID,
  p_period_end_date DATE,
  p_last_period_end_date DATE
)
RETURNS TABLE(
  task_id UUID,
  task_title TEXT,
  task_description TEXT,
  task_priority TEXT,
  task_estimated_hours NUMERIC,
  task_sort_order INTEGER,
  task_due_date DATE,
  task_assigned_to UUID
) AS $$
DECLARE
  v_task RECORD;
  v_task_expiry_date DATE;
  v_monthly_months RECORD;
BEGIN
  
  FOR v_task IN
    SELECT st.id, st.title, st.description, st.priority, st.estimated_hours, 
           st.sort_order, st.due_date_offset_days, st.default_assigned_to,
           st.task_period_type, st.task_period_value, st.task_period_unit,
           st.task_recurrence_type, st.due_day_of_month
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.sort_order
  LOOP
    v_task_expiry_date := calculate_task_period_end_date(
      v_task.task_period_type,
      COALESCE(v_task.task_period_value, 1),
      COALESCE(v_task.task_period_unit, 'months'),
      p_last_period_end_date
    );
    
    -- Only include if the task's period has elapsed (last day has passed)
    IF v_task_expiry_date <= CURRENT_DATE THEN
      
      -- If monthly recurring task, add one entry for each month in the period
      IF v_task.task_recurrence_type = 'monthly' THEN
        FOR v_monthly_months IN
          SELECT * FROM get_monthly_task_months_in_period(v_task.id, 
            p_last_period_end_date + INTERVAL '1 day', 
            p_period_end_date)
        LOOP
          RETURN QUERY
          SELECT
            v_task.id,
            v_task.title || ' - ' || v_monthly_months.month_name,
            v_task.description,
            v_task.priority,
            v_task.estimated_hours,
            v_task.sort_order,
            v_monthly_months.due_date,
            COALESCE(v_task.default_assigned_to, NULL::UUID);
        END LOOP;
      ELSE
        -- Non-monthly recurring task - add once per period
        RETURN QUERY
        SELECT
          v_task.id,
          v_task.title,
          v_task.description,
          v_task.priority,
          v_task.estimated_hours,
          v_task.sort_order,
          calculate_task_due_date_for_period(v_task.id, p_last_period_end_date + INTERVAL '1 day', p_period_end_date),
          COALESCE(v_task.default_assigned_to, NULL::UUID);
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
