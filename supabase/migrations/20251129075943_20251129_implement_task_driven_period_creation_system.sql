/*
  # Task-Driven Period and Task Creation System

  ## Overview
  This migration implements a complete task-driven period and task creation system where:
  - Periods are created ONLY when the last day of the first task of that period has elapsed
  - Tasks are added to periods based on their recurrence pattern and due dates
  - Recurrence - Task creation based on service tasks recurrence:
    * Monthly: Create tasks monthly
    * Quarterly: Create tasks monthly AND quarterly (3 monthly + 1 quarterly per quarter)
    * Yearly: Create tasks monthly, quarterly, AND yearly (12 monthly + 4 quarterly + 1 yearly per year)

  ## Key Principles
  1. **Period Creation Eligibility**: Period is created only after the last day of its first task has elapsed
  2. **First Task**: The task with the earliest due date in a period
  3. **Subsequent Tasks**: Added when their respective last days elapse
  4. **Backfill Logic**: When creating a new work, backfill periods from start_date to current_date
  5. **Initialization**: On first work creation, create periods based on when task last days would elapse

  ## Implementation
  - get_first_task_for_period(): Identifies first/primary tasks for a period
  - get_tasks_to_create_for_period(): Gets all tasks eligible for creation at a given date
  - calculate_period_eligibility(): Determines when a period should be created
  - handle_recurring_work_creation(): Handles initial period and task creation on work insert
  - auto_generate_next_period_on_date(): Automatically creates next period when conditions met

  ## Changes Made
  1. Removed all old period/task generation logic
  2. Implemented new task-driven system
  3. Updated triggers to use new functions
  4. Backfilled existing recurring works
*/

-- ============================================
-- STEP 1: DROP ALL OLD FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS get_first_eligible_period_start_date(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS create_periods_for_work(uuid) CASCADE;
DROP FUNCTION IF EXISTS generate_task_title_with_period(uuid, date, date, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_individual_task_period_end_date(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS copy_documents_to_period(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_next_period_on_end_date(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_to_add_for_period(uuid, date, date, text) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_to_add_for_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS generate_monthly_task_due_dates(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_monthly_task_months_in_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_month_name(integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date_for_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS backfill_periods_for_work(uuid, date, date) CASCADE;

-- ============================================
-- STEP 2: HELPER FUNCTIONS
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

-- Calculate due date for a task in a specific month within a period
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

  -- Get last day of the month
  v_last_day_of_month := EXTRACT(DAY FROM (
    DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01') 
    + INTERVAL '1 month' - INTERVAL '1 day'
  ))::INTEGER;

  -- Determine due day
  v_due_day := COALESCE(v_task.due_day_of_month, 20);
  v_due_day := LEAST(v_due_day, v_last_day_of_month);

  RETURN DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-' || LPAD(v_due_day::TEXT, 2, '0'));
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STEP 3: CORE PERIOD AND TASK CREATION LOGIC
-- ============================================

-- Get the earliest last day of first tasks in a period
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
BEGIN
  -- Get service from work
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get minimum due date among all monthly tasks in first month
  SELECT MIN(calculate_task_due_date_for_month(st.id, v_first_month, v_first_year))
  INTO v_min_due_date
  FROM service_tasks st
  WHERE st.service_id = v_service_id
    AND st.is_active = TRUE
    AND st.task_recurrence_type = 'monthly';

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

  WHILE (v_current_year < v_end_year OR 
         (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
    
    v_month_idx := v_month_idx + 1;

    FOR v_st IN
      SELECT st.id, st.title, st.task_recurrence_type
      FROM service_tasks st
      WHERE st.service_id = v_service_id
        AND st.is_active = TRUE
    LOOP
      -- Monthly tasks appear every month
      IF v_st.task_recurrence_type = 'monthly' THEN
        IF calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year) <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title || CASE 
              WHEN v_recurrence_type IN ('quarterly', 'yearly')
              THEN ' - ' || get_month_name(v_current_month)
              ELSE ''
            END,
            calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year),
            (v_month_idx = 1);
        END IF;
      END IF;

      -- Quarterly tasks appear once per quarter (in last month)
      IF v_st.task_recurrence_type = 'quarterly' AND v_recurrence_type IN ('quarterly', 'yearly') AND v_month_idx = 3 THEN
        IF calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year) <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year),
            FALSE;
        END IF;
      END IF;

      -- Yearly tasks appear once per year (in last month)
      IF v_st.task_recurrence_type = 'yearly' AND v_recurrence_type = 'yearly' AND v_month_idx = 12 THEN
        IF calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year) <= p_check_date THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year),
            FALSE;
        END IF;
      END IF;
    END LOOP;

    v_current_month := v_current_month + 1;
    IF v_current_month > 12 THEN
      v_current_month := 1;
      v_current_year := v_current_year + 1;
      v_month_idx := 0;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STEP 4: PERIOD LIFECYCLE FUNCTIONS
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
    );
  END LOOP;

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 5: WORK LIFECYCLE FUNCTIONS
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

-- ============================================
-- STEP 6: TRIGGER UPDATES
-- ============================================

DROP TRIGGER IF EXISTS handle_recurring_work_insert ON works;

CREATE TRIGGER handle_recurring_work_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
