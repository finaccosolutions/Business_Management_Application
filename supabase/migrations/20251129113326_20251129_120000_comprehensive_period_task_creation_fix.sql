/*
  # Comprehensive Fix for Recurring Work Period and Task Creation

  ## Problem Analysis
  1. Current logic only creates tasks with sort_order = 0 (first tasks)
  2. Doesn't check if last task due date has elapsed before creating period
  3. Doesn't handle mixed recurrence types (monthly in quarterly, etc.)
  4. Backfill logic doesn't properly respect work start date
  5. November period incorrectly created for start dates 28-11-2025 and 7-11-2025 on current date 29-11-2025

  ## Solution
  Implement task-driven period creation where:
  - Periods are only created when the last task due date of that period has elapsed
  - All applicable tasks are added (monthly, quarterly, yearly based on period type)
  - Backfill is done from work start date respecting task due dates
  - Mixed recurrences are handled correctly

  ## Key Functions
  1. get_tasks_for_period - Get all applicable service tasks for a period
  2. get_period_last_task_due_date - Calculate last task due date for a period
  3. should_create_period - Determine if period should be created
  4. create_period_with_all_applicable_tasks - Create period and add all tasks
  5. backfill_recurring_work_periods - Backfill from start date to current date
*/

-- ============================================
-- Helper: Get all applicable service tasks for a period type
-- ============================================

DROP FUNCTION IF EXISTS get_tasks_for_period(uuid, text, date, date) CASCADE;

CREATE FUNCTION get_tasks_for_period(
  p_service_id UUID,
  p_period_type TEXT,  -- 'monthly', 'quarterly', 'yearly'
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS TABLE(
  service_task_id UUID,
  title TEXT,
  description TEXT,
  priority TEXT,
  estimated_hours NUMERIC,
  default_assigned_to UUID,
  sort_order INTEGER,
  task_recurrence_type TEXT,
  due_day_of_month INTEGER,
  due_date_offset_days INTEGER,
  exact_due_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id,
    st.title,
    st.description,
    st.priority,
    st.estimated_hours,
    st.default_assigned_to,
    st.sort_order,
    st.task_recurrence_type,
    st.due_day_of_month,
    st.due_date_offset_days,
    st.exact_due_date
  FROM service_tasks st
  WHERE st.service_id = p_service_id
  AND st.is_active = TRUE
  AND (
    -- Monthly tasks always included
    st.task_recurrence_type = 'monthly'
    -- Quarterly tasks included in quarterly/yearly periods
    OR (st.task_recurrence_type = 'quarterly' AND p_period_type IN ('quarterly', 'yearly'))
    -- Yearly tasks included in yearly periods
    OR (st.task_recurrence_type = 'yearly' AND p_period_type = 'yearly')
  )
  ORDER BY st.sort_order, st.id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Calculate single task due date for a specific date
-- ============================================

DROP FUNCTION IF EXISTS calculate_task_due_date_for_date(uuid, date) CASCADE;

CREATE FUNCTION calculate_task_due_date_for_date(
  p_service_task_id UUID,
  p_target_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_target_day INTEGER;
  v_last_day_of_month INTEGER;
  v_target_month INTEGER;
  v_target_year INTEGER;
BEGIN
  SELECT * INTO v_task FROM service_tasks WHERE id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN p_target_date + INTERVAL '10 days'::INTERVAL;
  END IF;
  
  -- If exact_due_date is set, use it
  IF v_task.exact_due_date IS NOT NULL THEN
    RETURN v_task.exact_due_date;
  END IF;
  
  -- If due_day_of_month is set (for monthly recurring tasks)
  IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
    v_target_year := EXTRACT(YEAR FROM p_target_date)::INTEGER;
    v_target_month := EXTRACT(MONTH FROM p_target_date)::INTEGER;
    
    -- Get the last day of the target month
    v_last_day_of_month := EXTRACT(DAY FROM (
      DATE(v_target_year || '-' || LPAD(v_target_month::TEXT, 2, '0') || '-01') 
      + INTERVAL '1 month' - INTERVAL '1 day'
    ))::INTEGER;
    
    -- Use the minimum of the specified day or the last day of month
    v_target_day := LEAST(v_task.due_day_of_month, v_last_day_of_month);
    
    v_due_date := DATE(v_target_year || '-' || LPAD(v_target_month::TEXT, 2, '0') || '-' || 
                       LPAD(v_target_day::TEXT, 2, '0'));
    
    RETURN v_due_date;
  END IF;
  
  -- Fallback: use due_date_offset_days from target date
  IF v_task.due_date_offset_days IS NOT NULL THEN
    RETURN (p_target_date + (v_task.due_date_offset_days || ' days')::INTERVAL)::DATE;
  END IF;
  
  -- Default: 10 days after target date
  RETURN (p_target_date + INTERVAL '10 days')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Get the last task due date for a period
-- ============================================

DROP FUNCTION IF EXISTS get_period_last_task_due_date(uuid, date, date) CASCADE;

CREATE FUNCTION get_period_last_task_due_date(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_period_type TEXT
)
RETURNS DATE AS $$
DECLARE
  v_max_due_date DATE := NULL;
  v_task_record RECORD;
  v_current_date DATE;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_due_date DATE;
BEGIN
  -- Get all applicable tasks for this period
  FOR v_task_record IN
    SELECT * FROM get_tasks_for_period(p_service_id, p_period_type, p_period_start_date, p_period_end_date)
  LOOP
    -- For monthly tasks in quarterly/yearly periods, get due date for each month
    IF v_task_record.task_recurrence_type = 'monthly' AND p_period_type IN ('quarterly', 'yearly') THEN
      v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
      v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
      
      WHILE (v_current_year < v_end_year OR 
             (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
        v_current_date := DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01');
        v_due_date := calculate_task_due_date_for_date(v_task_record.service_task_id, v_current_date);
        
        IF v_max_due_date IS NULL OR v_due_date > v_max_due_date THEN
          v_max_due_date := v_due_date;
        END IF;
        
        v_current_month := v_current_month + 1;
        IF v_current_month > 12 THEN
          v_current_month := 1;
          v_current_year := v_current_year + 1;
        END IF;
      END LOOP;
    ELSE
      -- For quarterly/yearly tasks or monthly tasks in monthly periods
      v_due_date := calculate_task_due_date_for_date(v_task_record.service_task_id, p_period_start_date);
      
      IF v_max_due_date IS NULL OR v_due_date > v_max_due_date THEN
        v_max_due_date := v_due_date;
      END IF;
    END IF;
  END LOOP;
  
  RETURN COALESCE(v_max_due_date, p_period_end_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Determine if period should be created
-- ============================================

DROP FUNCTION IF EXISTS should_create_period(uuid, date, date, text, date) CASCADE;

CREATE FUNCTION should_create_period(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_period_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_task_due_date DATE;
BEGIN
  -- Get the last task due date for this period
  v_last_task_due_date := get_period_last_task_due_date(p_service_id, p_period_start_date, p_period_end_date, p_period_type);
  
  -- Period should be created if last task due date has elapsed
  RETURN v_last_task_due_date <= p_current_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Create period with all applicable tasks
-- ============================================

DROP FUNCTION IF EXISTS create_period_with_all_applicable_tasks(uuid, date, date, text, date) CASCADE;

CREATE FUNCTION create_period_with_all_applicable_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_period_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_task_count INTEGER := 0;
  v_current_date DATE;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_month_name TEXT;
BEGIN
  -- Get work details
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if period should be created (last task due date elapsed)
  IF NOT should_create_period(v_service_id, p_period_start, p_period_end, p_period_type, p_current_date) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if this period already exists
  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;
  
  -- Create period if it doesn't exist
  IF v_work_recurring_instance_id IS NULL THEN
    v_period_name := 'Q' || CEIL(EXTRACT(MONTH FROM p_period_start)::NUMERIC / 3)::TEXT || ' ' || EXTRACT(YEAR FROM p_period_start)::TEXT;
    
    IF p_period_type = 'monthly' THEN
      v_period_name := TO_CHAR(p_period_start, 'Mon YYYY');
    ELSIF p_period_type = 'yearly' THEN
      v_period_name := EXTRACT(YEAR FROM p_period_start)::TEXT;
    END IF;
    
    INSERT INTO work_recurring_instances (
      work_id,
      period_start_date,
      period_end_date,
      instance_date,
      period_name,
      status,
      total_tasks,
      completed_tasks,
      all_tasks_completed,
      updated_at
    )
    VALUES (
      p_work_id,
      p_period_start,
      p_period_end,
      p_current_date,
      v_period_name,
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_work_recurring_instance_id;
  END IF;
  
  -- Add all applicable tasks
  FOR v_task_record IN
    SELECT * FROM get_tasks_for_period(v_service_id, p_period_type, p_period_start, p_period_end)
  LOOP
    -- For monthly tasks in quarterly/yearly periods, create one task per month
    IF v_task_record.task_recurrence_type = 'monthly' AND p_period_type IN ('quarterly', 'yearly') THEN
      v_current_year := EXTRACT(YEAR FROM p_period_start)::INTEGER;
      v_current_month := EXTRACT(MONTH FROM p_period_start)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end)::INTEGER;
      
      WHILE (v_current_year < v_end_year OR 
             (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
        v_current_date := DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01');
        v_month_name := TO_CHAR(v_current_date, 'Mon');
        v_task_due_date := calculate_task_due_date_for_date(v_task_record.service_task_id, v_current_date);
        
        INSERT INTO recurring_period_tasks (
          work_recurring_instance_id,
          service_task_id,
          title,
          description,
          due_date,
          status,
          priority,
          assigned_to,
          estimated_hours,
          sort_order,
          display_order,
          created_at,
          updated_at
        )
        VALUES (
          v_work_recurring_instance_id,
          v_task_record.service_task_id,
          v_task_record.title || ' (' || v_month_name || ')',
          v_task_record.description,
          v_task_due_date,
          'pending',
          v_task_record.priority,
          v_task_record.default_assigned_to,
          v_task_record.estimated_hours,
          v_task_record.sort_order,
          v_task_record.sort_order,
          NOW(),
          NOW()
        )
        ON CONFLICT (work_recurring_instance_id, service_task_id, due_date) DO NOTHING;
        
        v_task_count := v_task_count + 1;
        
        v_current_month := v_current_month + 1;
        IF v_current_month > 12 THEN
          v_current_month := 1;
          v_current_year := v_current_year + 1;
        END IF;
      END LOOP;
    ELSE
      -- For quarterly/yearly tasks or monthly tasks in monthly periods
      v_task_due_date := calculate_task_due_date_for_date(v_task_record.service_task_id, p_period_start);
      
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,
        description,
        due_date,
        status,
        priority,
        assigned_to,
        estimated_hours,
        sort_order,
        display_order,
        created_at,
        updated_at
      )
      VALUES (
        v_work_recurring_instance_id,
        v_task_record.service_task_id,
        v_task_record.title,
        v_task_record.description,
        v_task_due_date,
        'pending',
        v_task_record.priority,
        v_task_record.default_assigned_to,
        v_task_record.estimated_hours,
        v_task_record.sort_order,
        v_task_record.sort_order,
        NOW(),
        NOW()
      )
      ON CONFLICT (work_recurring_instance_id, service_task_id, due_date) DO NOTHING;
      
      v_task_count := v_task_count + 1;
    END IF;
  END LOOP;
  
  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Helper: Backfill recurring work periods and tasks
-- ============================================

DROP FUNCTION IF EXISTS backfill_recurring_work_periods(uuid, date, text, date) CASCADE;

CREATE FUNCTION backfill_recurring_work_periods(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS VOID AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_period_type TEXT;
BEGIN
  -- Determine period type based on recurrence
  v_period_type := p_recurrence_type;
  
  -- Handle monthly recurrence
  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'monthly', p_current_date
      );
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  -- Handle quarterly recurrence
  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date
      );
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  -- Handle yearly recurrence
  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'yearly', p_current_date
      );
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Main: Updated handle_recurring_work_creation function
-- ============================================

DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_start_date DATE;
  v_current_date DATE := CURRENT_DATE;
BEGIN
  -- Only handle recurring works
  IF COALESCE(NEW.is_recurring, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;
  
  -- Get service and work details
  SELECT s.id, s.recurrence_type
  INTO v_service_id, v_recurrence_type
  FROM services s WHERE s.id = NEW.service_id;
  
  IF v_service_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Determine start date
  v_start_date := COALESCE(NEW.start_date, CURRENT_DATE);
  
  -- Backfill periods and tasks from start date to current date
  PERFORM backfill_recurring_work_periods(
    NEW.id,
    v_start_date,
    v_recurrence_type,
    v_current_date
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Ensure trigger exists
-- ============================================

DROP TRIGGER IF EXISTS handle_recurring_work_insert ON works;

CREATE TRIGGER handle_recurring_work_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
