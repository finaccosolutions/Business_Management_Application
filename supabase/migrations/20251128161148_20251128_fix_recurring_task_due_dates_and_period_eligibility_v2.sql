/*
  # Fix Recurring Task Due Dates and Period Creation Eligibility

  ## Issues Fixed

  1. **Task Due Dates All Same**: When monthly recurring tasks are created in a period (e.g., quarterly),
     all tasks were showing the same due date instead of different dates for each month.
     
  2. **Wrong Period Creation Timing**: Periods were being created even when task due dates hadn't elapsed.
     - Correct logic: Only create a period when CURRENT_DATE > last_task_due_date_of_that_period
     
  3. **Inconsistent Logic Across Types**: Apply corrected logic uniformly for monthly, quarterly, yearly patterns
*/

-- Drop old functions
DROP FUNCTION IF EXISTS auto_generate_periods_and_tasks(uuid);

-- Helper: Check if a specific period is eligible for task creation based on all its task due dates
CREATE OR REPLACE FUNCTION check_period_eligibility(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
  v_latest_task_due_date DATE := NULL;
BEGIN
  FOR v_task IN
    SELECT 
      st.id,
      st.due_day_of_month,
      st.due_date_offset_days,
      st.exact_due_date,
      st.task_period_type,
      st.task_period_value,
      st.task_period_unit,
      st.task_recurrence_type
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
  LOOP
    IF v_task.task_period_type IS NULL THEN
      CONTINUE;
    END IF;

    DECLARE
      v_task_due_date DATE := NULL;
    BEGIN
      IF v_task.task_recurrence_type = 'monthly' THEN
        IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
          v_task_due_date := calculate_task_due_date_for_period(
            v_task.id,
            p_period_end_date - INTERVAL '1 day',
            p_period_end_date
          );
        ELSIF v_task.due_date_offset_days IS NOT NULL THEN
          v_task_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
        ELSE
          v_task_due_date := p_period_end_date + INTERVAL '10 days';
        END IF;
      ELSE
        IF v_task.due_date_offset_days IS NOT NULL THEN
          v_task_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
        ELSE
          v_task_due_date := p_period_end_date + INTERVAL '10 days';
        END IF;
      END IF;

      IF v_task_due_date IS NOT NULL THEN
        IF v_latest_task_due_date IS NULL OR v_task_due_date > v_latest_task_due_date THEN
          v_latest_task_due_date := v_task_due_date;
        END IF;
      END IF;
    END;
  END LOOP;

  IF v_latest_task_due_date IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN CURRENT_DATE > v_latest_task_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Rewrite: Calculate task due date for a specific period (handles monthly recurrence correctly)
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
  
  IF v_task.exact_due_date IS NOT NULL THEN
    RETURN v_task.exact_due_date;
  END IF;
  
  IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
    v_target_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
    v_target_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
    
    v_last_day_of_month := EXTRACT(DAY FROM (DATE(v_target_year || '-' || LPAD(v_target_month::TEXT, 2, '0') || '-01') 
                                    + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
    
    v_target_day := LEAST(v_task.due_day_of_month, v_last_day_of_month);
    
    v_due_date := DATE(v_target_year || '-' || LPAD(v_target_month::TEXT, 2, '0') || '-' || 
                       LPAD(v_target_day::TEXT, 2, '0'));
    
    RETURN v_due_date;
  END IF;
  
  IF v_task.due_date_offset_days IS NOT NULL THEN
    RETURN (p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL)::DATE;
  END IF;
  
  RETURN (p_period_end_date + INTERVAL '10 days')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Generate individual task due dates for each month in a period (for monthly recurring tasks)
CREATE OR REPLACE FUNCTION generate_monthly_task_due_dates(
  p_task_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS TABLE(month_num INTEGER, month_name TEXT, due_date DATE, task_title TEXT) AS $$
DECLARE
  v_task RECORD;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_year INTEGER;
  v_end_month INTEGER;
  v_due_date DATE;
  v_last_day INTEGER;
  v_task_title TEXT;
  v_months TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'];
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
    
    v_task_title := v_task.title || ' - ' || v_months[v_current_month];
    
    RETURN QUERY
    SELECT v_current_month, v_months[v_current_month], v_due_date, v_task_title;
    
    v_current_month := v_current_month + 1;
    IF v_current_month > 12 THEN
      v_current_month := 1;
      v_current_year := v_current_year + 1;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- Rewrite: Get tasks to add for a period with FIXED due dates and eligibility check
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
  v_period_start DATE;
BEGIN
  
  v_period_start := p_last_period_end_date + INTERVAL '1 day';
  
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
    
    -- Only include if the task's period has elapsed
    IF v_task_expiry_date <= CURRENT_DATE THEN
      
      -- Monthly recurring task: add one entry for each month with DIFFERENT due dates
      IF v_task.task_recurrence_type = 'monthly' THEN
        FOR v_monthly_months IN
          SELECT * FROM generate_monthly_task_due_dates(v_task.id, v_period_start, p_period_end_date)
        LOOP
          RETURN QUERY
          SELECT
            v_task.id,
            v_monthly_months.task_title,
            v_task.description,
            v_task.priority,
            v_task.estimated_hours,
            v_task.sort_order,
            v_monthly_months.due_date,
            COALESCE(v_task.default_assigned_to, NULL::UUID);
        END LOOP;
      ELSE
        -- Non-monthly recurring task
        RETURN QUERY
        SELECT
          v_task.id,
          v_task.title,
          v_task.description,
          v_task.priority,
          v_task.estimated_hours,
          v_task.sort_order,
          calculate_task_due_date_for_period(v_task.id, v_period_start, p_period_end_date),
          COALESCE(v_task.default_assigned_to, NULL::UUID);
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- Main auto-generation function with period eligibility check
CREATE OR REPLACE FUNCTION auto_generate_periods_and_tasks(p_work_id UUID)
RETURNS VOID AS $$
DECLARE
  v_work RECORD;
  v_current_period_end DATE;
  v_next_period_start DATE;
  v_next_period_end DATE;
  v_next_period_name TEXT;
  v_max_iterations INTEGER := 100;
  v_iteration INTEGER := 0;
  v_period_count INTEGER := 0;
  v_existing_period_count INTEGER;
  v_eligible BOOLEAN;
  v_quarter_info RECORD;
BEGIN
  
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  IF v_work IS NULL THEN RETURN; END IF;
  
  IF NOT v_work.is_recurring THEN RETURN; END IF;
  
  SELECT COALESCE(MAX(period_end_date), v_work.start_date - INTERVAL '1 day')
  INTO v_current_period_end
  FROM work_recurring_instances
  WHERE work_id = p_work_id;
  
  WHILE v_iteration < v_max_iterations LOOP
    v_iteration := v_iteration + 1;
    
    IF v_work.recurrence_pattern = 'monthly' THEN
      v_next_period_start := v_current_period_end + INTERVAL '1 day';
      v_next_period_end := DATE_TRUNC('month', v_next_period_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day';
      v_next_period_name := TO_CHAR(v_next_period_start, 'MMMM YYYY');
    
    ELSIF v_work.recurrence_pattern = 'quarterly' THEN
      v_next_period_start := v_current_period_end + INTERVAL '1 day';
      SELECT quarter_start, quarter_end, quarter_name
      INTO v_quarter_info
      FROM calculate_quarter_for_date(v_next_period_start);
      v_next_period_start := v_quarter_info.quarter_start;
      v_next_period_end := v_quarter_info.quarter_end;
      v_next_period_name := v_quarter_info.quarter_name;
    
    ELSIF v_work.recurrence_pattern = 'yearly' THEN
      v_next_period_start := v_current_period_end + INTERVAL '1 day';
      v_next_period_end := DATE_TRUNC('year', v_next_period_start)::DATE + INTERVAL '1 year' - INTERVAL '1 day';
      v_next_period_name := EXTRACT(YEAR FROM v_next_period_start)::TEXT;
    
    ELSE
      EXIT;
    END IF;
    
    IF v_next_period_end > CURRENT_DATE THEN
      EXIT;
    END IF;
    
    -- Check period eligibility
    v_eligible := check_period_eligibility(v_work.service_id, v_next_period_start, v_next_period_end);
    
    IF v_eligible THEN
      SELECT COUNT(*) INTO v_existing_period_count
      FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_period_start
      AND period_end_date = v_next_period_end;
      
      IF v_existing_period_count = 0 THEN
        INSERT INTO work_recurring_instances (
          work_id,
          period_name,
          period_start_date,
          period_end_date,
          status,
          created_at
        ) VALUES (
          p_work_id,
          v_next_period_name,
          v_next_period_start,
          v_next_period_end,
          'pending',
          NOW()
        );
        
        v_period_count := v_period_count + 1;
        
        INSERT INTO recurring_period_tasks (
          work_recurring_instance_id,
          service_task_id,
          title,
          description,
          due_date,
          priority,
          assigned_to,
          estimated_hours,
          status,
          sort_order,
          created_at
        )
        SELECT
          (SELECT id FROM work_recurring_instances 
           WHERE work_id = p_work_id 
           AND period_start_date = v_next_period_start 
           AND period_end_date = v_next_period_end),
          task_id,
          task_title,
          task_description,
          task_due_date,
          task_priority,
          task_assigned_to,
          task_estimated_hours,
          'pending',
          task_sort_order,
          NOW()
        FROM get_tasks_to_add_for_period(
          v_work.service_id,
          v_next_period_end,
          v_current_period_end
        );
      END IF;
    END IF;
    
    v_current_period_end := v_next_period_end;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
