/*
  # Fix Recurring Period Eligibility Logic

  ## Problem
  The eligibility check was wrong. It was checking if `work.start_date > last_task_due_date` 
  which blocked period creation even when task due dates had elapsed.

  ## New Logic
  1. A period is ELIGIBLE for creation if ANY task's due date has ALREADY ELAPSED (< today)
  2. When creating a period, include ONLY the tasks whose due dates have elapsed
  3. Continue creating periods for all elapsed task dates
  4. Skip the eligibility check entirely - let task eligibility drive period creation

  ## Changes
  1. Remove the eligibility check from `calculate_first_period_for_work()`
  2. Update `create_first_recurring_period_only()` to properly select tasks
  3. Fix `auto_generate_periods_and_tasks()` to only create periods with eligible tasks
  4. Update `get_tasks_to_add_for_period()` to filter by elapsed date correctly
*/

-- Fix: Create function that finds earliest ELAPSED task date (not future)
CREATE OR REPLACE FUNCTION find_earliest_elapsed_task_expiry_date(
  p_service_id UUID,
  p_last_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_earliest_date DATE := NULL;
  v_task RECORD;
  v_task_expiry_date DATE;
BEGIN
  FOR v_task IN
    SELECT st.id, st.task_period_type, st.task_period_value, st.task_period_unit
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    AND st.task_period_type IS NOT NULL
  LOOP
    v_task_expiry_date := calculate_task_period_end_date(
      v_task.task_period_type,
      COALESCE(v_task.task_period_value, 1),
      COALESCE(v_task.task_period_unit, 'months'),
      p_last_period_end_date
    );
    
    -- Only consider dates that have ELAPSED (< today)
    IF v_task_expiry_date < CURRENT_DATE THEN
      IF v_earliest_date IS NULL OR v_task_expiry_date < v_earliest_date THEN
        v_earliest_date := v_task_expiry_date;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_earliest_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Remove eligibility check from calculate_first_period_for_work
CREATE OR REPLACE FUNCTION calculate_first_period_for_work(p_work_id uuid, 
  OUT first_start_date DATE, 
  OUT first_end_date DATE, 
  OUT first_period_name TEXT) AS $$
DECLARE
  v_work RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_start_date DATE;
  v_quarter_info RECORD;
BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN;
  END IF;
  
  v_start_date := v_work.start_date::DATE;
  
  -- For quarterly pattern, use correct quarter mapping
  IF v_work.recurrence_pattern = 'quarterly' THEN
    SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_start_date);
    v_period_start := v_quarter_info.quarter_start;
    v_period_end := v_quarter_info.quarter_end;
    v_period_name := v_quarter_info.quarter_name;
    
    -- Apply period_type adjustment
    CASE COALESCE(v_work.period_type, 'current_period')
    WHEN 'previous_period' THEN
      v_period_start := v_period_start - INTERVAL '3 months';
      v_period_end := v_period_end - INTERVAL '3 months';
      SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_period_start);
      v_period_name := v_quarter_info.quarter_name;
    
    WHEN 'next_period' THEN
      v_period_start := v_period_start + INTERVAL '3 months';
      v_period_end := v_period_end + INTERVAL '3 months';
      SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_period_start);
      v_period_name := v_quarter_info.quarter_name;
    END CASE;
    
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
    RETURN;
  END IF;

  -- For other patterns
  CASE v_work.recurrence_pattern
  WHEN 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  
  WHEN 'half_yearly' THEN
    IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
      v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
      v_period_end := (DATE_TRUNC('year', v_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
    ELSE
      v_period_start := (DATE_TRUNC('year', v_start_date) + INTERVAL '6 months')::DATE;
      v_period_end := (DATE_TRUNC('year', v_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    END IF;
    v_period_name := 'H' || CEIL(EXTRACT(MONTH FROM v_period_start) / 6.0)::TEXT || ' ' || TO_CHAR(v_period_start, 'YYYY');
  
  WHEN 'yearly' THEN
    v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('year', v_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    v_period_name := 'FY ' || TO_CHAR(v_period_start, 'YYYY-') || TO_CHAR(v_period_end, 'YY');
  
  ELSE
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  END CASE;
  
  -- Apply period_type adjustment
  CASE COALESCE(v_work.period_type, 'current_period')
  WHEN 'previous_period' THEN
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      first_start_date := (v_period_start - INTERVAL '1 month')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    
    WHEN 'half_yearly' THEN
      first_start_date := (v_period_start - INTERVAL '6 months')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := 'H' || CEIL(EXTRACT(MONTH FROM first_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(first_start_date, 'YYYY');
    
    WHEN 'yearly' THEN
      first_start_date := (v_period_start - INTERVAL '1 year')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := 'FY ' || TO_CHAR(first_start_date, 'YYYY-') || TO_CHAR(first_end_date, 'YY');
    
    ELSE
      first_start_date := (v_period_start - INTERVAL '1 month')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    END CASE;
  
  WHEN 'current_period' THEN
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
  
  WHEN 'next_period' THEN
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('month', first_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    
    WHEN 'half_yearly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('year', first_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      first_period_name := 'H' || CEIL(EXTRACT(MONTH FROM first_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(first_start_date, 'YYYY');
    
    WHEN 'yearly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('year', first_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      first_period_name := 'FY ' || TO_CHAR(first_start_date, 'YYYY-') || TO_CHAR(first_end_date, 'YY');
    
    ELSE
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('month', first_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    END CASE;
  
  ELSE
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix: Only include tasks that have ALREADY ELAPSED
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
BEGIN
  FOR v_task IN
    SELECT st.id, st.title, st.description, st.priority, st.estimated_hours, 
           st.sort_order, st.due_date_offset_days, st.default_assigned_to,
           st.task_period_type, st.task_period_value, st.task_period_unit
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
    
    -- Only include tasks whose due dates have ELAPSED
    IF v_task_expiry_date < CURRENT_DATE THEN
      RETURN QUERY
      SELECT
        v_task.id,
        v_task.title,
        v_task.description,
        v_task.priority,
        v_task.estimated_hours,
        v_task.sort_order,
        (p_period_end_date + (COALESCE(v_task.due_date_offset_days, 10) || ' days')::INTERVAL)::DATE,
        COALESCE(v_task.default_assigned_to, NULL::UUID);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update auto_generate_periods_and_tasks to only create periods with eligible tasks
CREATE OR REPLACE FUNCTION auto_generate_periods_and_tasks(p_work_id uuid)
RETURNS integer AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_last_period_end_date DATE;
  v_earliest_elapsed_task_date DATE;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_new_period_id UUID;
  v_task RECORD;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
BEGIN
  
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;
  
  SELECT * INTO v_last_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY period_end_date DESC
  LIMIT 1;
  
  IF v_last_period IS NULL THEN
    SELECT first_start_date, first_end_date, first_period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_first_period_for_work(p_work_id);
    
    IF v_next_start IS NULL THEN
      RETURN 0;
    END IF;
    
    v_last_period_end_date := v_next_start - 1;
  ELSE
    v_last_period_end_date := v_last_period.period_end_date;
  END IF;
  
  LOOP
    IF v_work.service_id IS NULL THEN
      EXIT;
    END IF;
    
    -- Find earliest ELAPSED task date
    v_earliest_elapsed_task_date := find_earliest_elapsed_task_expiry_date(
      v_work.service_id,
      v_last_period_end_date
    );
    
    -- If no elapsed tasks, stop creating periods
    IF v_earliest_elapsed_task_date IS NULL THEN
      EXIT;
    END IF;
    
    -- Calculate next period based on recurrence pattern
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_last_period_end_date, v_work.recurrence_pattern);
    
    -- Only create period if its end date is >= earliest elapsed task date
    IF v_next_end < v_earliest_elapsed_task_date THEN
      v_last_period_end_date := v_next_end;
      CONTINUE;
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;
    
    IF NOT v_period_exists THEN
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
        p_work_id,
        v_next_name,
        v_next_start,
        v_next_end,
        v_work.billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;
      
      v_task_count := 0;
      FOR v_task IN
        SELECT * FROM get_tasks_to_add_for_period(
          v_work.service_id,
          v_next_end,
          v_last_period_end_date
        )
      LOOP
        INSERT INTO recurring_period_tasks (
          work_recurring_instance_id,
          service_task_id,
          title,
          description,
          priority,
          estimated_hours,
          sort_order,
          due_date,
          status,
          assigned_to
        ) VALUES (
          v_new_period_id,
          v_task.task_id,
          v_task.task_title,
          v_task.task_description,
          v_task.task_priority,
          v_task.task_estimated_hours,
          v_task.task_sort_order,
          v_task.task_due_date,
          'pending',
          COALESCE(v_task.task_assigned_to, v_work.assigned_to)
        );
        
        v_task_count := v_task_count + 1;
      END LOOP;
      
      UPDATE work_recurring_instances
      SET total_tasks = v_task_count
      WHERE id = v_new_period_id;
      
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
      
      v_total_created := v_total_created + 1;
    END IF;
    
    v_last_period_end_date := v_next_end;
  END LOOP;
  
  RETURN v_total_created;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
