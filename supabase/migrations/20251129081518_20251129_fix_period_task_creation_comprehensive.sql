/*
  # Comprehensive Fix for Period and Task Creation System
  
  ## Problem Statement
  The current system had several issues preventing correct period and task creation:
  1. First task identification was only checking monthly tasks, not task_period
  2. Period eligibility logic didn't account for non-monthly first tasks
  3. Task recurrence filtering wasn't considering task_period column
  4. Month iteration for quarterly/yearly was not properly scoped to each period
  5. Start date validation wasn't properly implemented

  ## Solution
  - Properly identify first tasks using task_period column
  - Calculate first task last day based on actual task recurrence patterns
  - Filter tasks by both recurrence_type and task_period
  - Fix month iteration logic for quarterly/yearly periods
  - Implement proper start date validation

  ## Key Changes
  1. Updated get_first_task_last_day_of_period to use task_period
  2. Updated get_tasks_to_create_for_period to properly filter by task_period and date
  3. Fixed month iteration for quarterly periods (exactly 3 months)
  4. Fixed month iteration for yearly periods (exactly 12 months)
  5. Improved backfill logic to check work start_date
*/

-- Drop functions that will be recreated
DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS should_create_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_to_create_for_period(uuid, date, date, date) CASCADE;
DROP FUNCTION IF EXISTS generate_periods_for_recurring_work(uuid) CASCADE;
DROP FUNCTION IF EXISTS create_period_with_first_tasks(uuid, date, date) CASCADE;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get month name from number (1-12)
CREATE OR REPLACE FUNCTION get_month_name(p_month INTEGER)
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
    ELSE ''
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate due date for a task in a specific month
CREATE OR REPLACE FUNCTION calculate_task_due_date_for_month(
  p_service_task_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_due_day INTEGER;
  v_last_day_of_month INTEGER;
BEGIN
  SELECT * INTO v_task FROM service_tasks WHERE id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  v_last_day_of_month := EXTRACT(DAY FROM (
    DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01') 
    + INTERVAL '1 month' - INTERVAL '1 day'
  ))::INTEGER;

  v_due_day := COALESCE(v_task.due_day_of_month, 20);
  v_due_day := LEAST(v_due_day, v_last_day_of_month);

  RETURN DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-' || LPAD(v_due_day::TEXT, 2, '0'));
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CORE PERIOD AND TASK CREATION LOGIC
-- ============================================

-- Get the last day of the first task for a period
-- First task is the one with earliest due date in the first month of the period
CREATE OR REPLACE FUNCTION get_first_task_last_day_of_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_first_month INTEGER := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_first_year INTEGER := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_min_due_date DATE;
  v_service_id UUID;
  v_work_recurrence TEXT;
BEGIN
  -- Get service and work recurrence
  SELECT w.service_id, s.recurrence_type 
  INTO v_service_id, v_work_recurrence
  FROM works w
  JOIN services s ON s.id = w.service_id
  WHERE w.id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get minimum due date among all first tasks
  -- For Monthly: all monthly tasks are first tasks in their respective months
  -- For Quarterly: tasks with task_period = 'monthly' in first month are first tasks
  -- For Yearly: tasks with task_period = 'monthly' in first month are first tasks
  SELECT MIN(calculate_task_due_date_for_month(st.id, v_first_month, v_first_year))
  INTO v_min_due_date
  FROM service_tasks st
  WHERE st.service_id = v_service_id
    AND st.is_active = TRUE
    AND (
      -- For monthly recurrence, all tasks are potential first tasks
      (v_work_recurrence = 'monthly' AND st.task_recurrence_type = 'monthly')
      OR
      -- For quarterly/yearly, first tasks must appear in first month (monthly task_period)
      (v_work_recurrence IN ('quarterly', 'yearly') AND st.task_period = 'monthly')
    );

  RETURN v_min_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if a period should be created by current date
CREATE OR REPLACE FUNCTION should_create_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_first_task_last_day DATE;
BEGIN
  v_first_task_last_day := get_first_task_last_day_of_period(p_work_id, p_period_start_date, p_period_end_date);
  
  RETURN v_first_task_last_day IS NOT NULL AND CURRENT_DATE > v_first_task_last_day;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get all tasks that should be created for a period on a given check date
CREATE OR REPLACE FUNCTION get_tasks_to_create_for_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_check_date DATE
)
RETURNS TABLE(service_task_id UUID, task_title TEXT, due_date DATE, is_first_task BOOLEAN) AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_month_idx INTEGER;
  v_period_start_month INTEGER := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_period_start_year INTEGER := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_st RECORD;
  v_task_due_date DATE;
BEGIN
  -- Get service and recurrence
  SELECT w.service_id, s.recurrence_type 
  INTO v_service_id, v_recurrence_type
  FROM works w
  JOIN services s ON s.id = w.service_id
  WHERE w.id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
  v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
  v_month_idx := 0;

  -- Iterate through months in period
  WHILE (v_current_year < v_end_year OR 
         (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
    
    v_month_idx := v_month_idx + 1;

    FOR v_st IN
      SELECT st.id, st.title, st.task_recurrence_type, st.task_period
      FROM service_tasks st
      WHERE st.service_id = v_service_id
        AND st.is_active = TRUE
    LOOP
      v_task_due_date := calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year);
      
      -- MONTHLY RECURRENCE: Create all monthly tasks
      IF v_recurrence_type = 'monthly' THEN
        IF v_st.task_recurrence_type = 'monthly' AND v_task_due_date <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            v_task_due_date,
            (v_month_idx = 1)::BOOLEAN;
        END IF;
      
      -- QUARTERLY RECURRENCE: Create monthly and quarterly tasks appropriately
      ELSIF v_recurrence_type = 'quarterly' THEN
        -- Monthly tasks appear in every month (first 3 of period are when they appear for this quarter)
        IF v_st.task_period = 'monthly' AND v_task_due_date <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title || ' - ' || get_month_name(v_current_month),
            v_task_due_date,
            (v_month_idx = 1)::BOOLEAN;
        END IF;
        
        -- Quarterly tasks appear in 3rd month of quarter
        IF v_st.task_period = 'quarterly' AND v_month_idx = 3 AND v_task_due_date <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            v_task_due_date,
            FALSE::BOOLEAN;
        END IF;
      
      -- YEARLY RECURRENCE: Create monthly, quarterly, and yearly tasks appropriately
      ELSIF v_recurrence_type = 'yearly' THEN
        -- Monthly tasks appear in every month
        IF v_st.task_period = 'monthly' AND v_task_due_date <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title || ' - ' || get_month_name(v_current_month),
            v_task_due_date,
            (v_month_idx = 1)::BOOLEAN;
        END IF;
        
        -- Quarterly tasks appear in months 3, 6, 9, 12 (end of each quarter)
        IF v_st.task_period = 'quarterly' AND v_month_idx IN (3, 6, 9, 12) AND v_task_due_date <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            v_task_due_date,
            FALSE::BOOLEAN;
        END IF;
        
        -- Yearly tasks appear in 12th month
        IF v_st.task_period = 'yearly' AND v_month_idx = 12 AND v_task_due_date <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            v_task_due_date,
            FALSE::BOOLEAN;
        END IF;
      END IF;
    END LOOP;

    v_current_month := v_current_month + 1;
    IF v_current_month > 12 THEN
      v_current_month := 1;
      v_current_year := v_current_year + 1;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PERIOD LIFECYCLE FUNCTIONS
-- ============================================

-- Generate periods for a recurring work based on task eligibility
CREATE OR REPLACE FUNCTION generate_periods_for_recurring_work(p_work_id UUID)
RETURNS TABLE(period_start_date DATE, period_end_date DATE, period_name TEXT) AS $$
DECLARE
  v_work_id UUID;
  v_start_date DATE;
  v_service_id UUID;
  v_current_date DATE := CURRENT_DATE;
  v_period_start DATE;
  v_period_end DATE;
  v_recurrence TEXT;
BEGIN
  SELECT id, start_date, service_id INTO v_work_id, v_start_date, v_service_id
  FROM works WHERE id = p_work_id;

  IF v_work_id IS NULL THEN
    RETURN;
  END IF;

  SELECT recurrence_type INTO v_recurrence FROM services WHERE id = v_service_id;

  v_period_start := DATE_TRUNC('month', v_start_date)::DATE;

  -- For monthly: each month is a period
  IF v_recurrence = 'monthly' THEN
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      IF should_create_period(p_work_id, v_period_start, v_period_end) THEN
        RETURN QUERY SELECT v_period_start, v_period_end, TO_CHAR(v_period_start, 'Month YYYY');
      END IF;
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  ELSIF v_recurrence = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      IF should_create_period(p_work_id, v_period_start, v_period_end) THEN
        RETURN QUERY SELECT v_period_start, v_period_end, 
          'Q' || CEIL(EXTRACT(MONTH FROM v_period_start)::NUMERIC / 3)::TEXT || ' ' || EXTRACT(YEAR FROM v_period_start)::TEXT;
      END IF;
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  ELSIF v_recurrence = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      IF should_create_period(p_work_id, v_period_start, v_period_end) THEN
        RETURN QUERY SELECT v_period_start, v_period_end, EXTRACT(YEAR FROM v_period_start)::TEXT;
      END IF;
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create period and add first tasks
CREATE OR REPLACE FUNCTION create_period_with_first_tasks(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS UUID AS $$
DECLARE
  v_period_id UUID;
  v_task RECORD;
BEGIN
  INSERT INTO work_recurring_instances (
    work_id, period_start_date, period_end_date, period_name, status, created_at, updated_at
  ) VALUES (
    p_work_id, p_period_start_date, p_period_end_date, 
    TO_CHAR(p_period_start_date, 'Month YYYY'), 'pending', now(), now()
  ) RETURNING id INTO v_period_id;

  FOR v_task IN
    SELECT * FROM get_tasks_to_create_for_period(
      p_work_id, p_period_start_date, p_period_end_date, CURRENT_DATE
    ) WHERE is_first_task = TRUE
  LOOP
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id, service_task_id, title, due_date, 
      status, priority, created_at, updated_at
    ) VALUES (
      v_period_id, v_task.service_task_id, v_task.task_title, v_task.due_date,
      'pending', 'medium', now(), now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- WORK LIFECYCLE FUNCTIONS
-- ============================================

-- Handle initial period/task creation on work insert
CREATE OR REPLACE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_period_record RECORD;
BEGIN
  IF NEW.is_recurring = FALSE THEN
    RETURN NEW;
  END IF;

  FOR v_period_record IN
    SELECT * FROM generate_periods_for_recurring_work(NEW.id)
  LOOP
    PERFORM create_period_with_first_tasks(
      NEW.id, 
      v_period_record.period_start_date, 
      v_period_record.period_end_date
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add tasks to period on due date
CREATE OR REPLACE FUNCTION add_tasks_to_period_on_due_date(
  p_work_id UUID,
  p_period_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_task RECORD;
  v_period_start_date DATE;
  v_period_end_date DATE;
  v_tasks_added INTEGER := 0;
BEGIN
  SELECT period_start_date, period_end_date 
  INTO v_period_start_date, v_period_end_date
  FROM work_recurring_instances WHERE id = p_period_id;

  IF v_period_start_date IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_task IN
    SELECT * FROM get_tasks_to_create_for_period(
      p_work_id, v_period_start_date, v_period_end_date, CURRENT_DATE
    ) WHERE is_first_task = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM recurring_period_tasks
        WHERE work_recurring_instance_id = p_period_id
          AND service_task_id = get_tasks_to_create_for_period.service_task_id
      )
  LOOP
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id, service_task_id, title, due_date,
      status, priority, created_at, updated_at
    ) VALUES (
      p_period_id, v_task.service_task_id, v_task.task_title, v_task.due_date,
      'pending', 'medium', now(), now()
    )
    ON CONFLICT DO NOTHING;
    
    v_tasks_added := v_tasks_added + 1;
  END LOOP;

  RETURN v_tasks_added;
END;
$$ LANGUAGE plpgsql;

-- Auto-create next period when applicable
CREATE OR REPLACE FUNCTION auto_create_next_period_on_schedule()
RETURNS TABLE(work_id UUID, period_id UUID, action TEXT) AS $$
DECLARE
  v_work RECORD;
  v_periods RECORD;
  v_period_id UUID;
BEGIN
  FOR v_work IN
    SELECT id FROM works
    WHERE is_recurring = TRUE AND is_active = TRUE
  LOOP
    FOR v_periods IN
      SELECT period_start_date, period_end_date, period_name
      FROM generate_periods_for_recurring_work(v_work.id)
      WHERE NOT EXISTS (
        SELECT 1 FROM work_recurring_instances
        WHERE work_id = v_work.id
          AND period_start_date = generate_periods_for_recurring_work.period_start_date
          AND period_end_date = generate_periods_for_recurring_work.period_end_date
      )
    LOOP
      v_period_id := create_period_with_first_tasks(
        v_work.id,
        v_periods.period_start_date,
        v_periods.period_end_date
      );
      
      RETURN QUERY SELECT v_work.id, v_period_id, 'created'::TEXT;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add tasks to existing periods when their due dates elapse
CREATE OR REPLACE FUNCTION auto_add_tasks_to_periods()
RETURNS TABLE(period_id UUID, tasks_added INTEGER) AS $$
DECLARE
  v_period RECORD;
  v_task_count INTEGER;
BEGIN
  FOR v_period IN
    SELECT id, work_id FROM work_recurring_instances
    WHERE status != 'completed'
  LOOP
    v_task_count := add_tasks_to_period_on_due_date(v_period.work_id, v_period.id);
    
    IF v_task_count > 0 THEN
      RETURN QUERY SELECT v_period.id, v_task_count;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER SETUP
-- ============================================

DROP TRIGGER IF EXISTS handle_recurring_work_insert ON works;

CREATE TRIGGER handle_recurring_work_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
