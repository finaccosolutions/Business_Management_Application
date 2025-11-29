/*
  # Fix Recurring Work Period and Task Creation - Task Driven Approach
  
  ## Problem
  Current system creates periods based on current date, not on when task due dates have actually elapsed.
  - November period created even though last task due date hasn't elapsed
  - Doesn't properly handle mixed recurrence types (monthly in quarterly/yearly)
  - Backfill doesn't respect task due dates
  
  ## Solution
  Implement task-driven period creation:
  1. Periods created only when FIRST TASK's LAST DUE DATE has elapsed
  2. Other tasks added when their respective last due date has elapsed
  3. At work creation: Backfill from work start date respecting task due date logic
  4. Mixed recurrence handled correctly (monthly inside quarterly/yearly)
  
  ## Key Logic
  - First task = task with earliest due date in period. If multiple tasks same earliest date, all are first tasks
  - Period created = when last day of first task(s) has elapsed
  - Next task added = when its last day has elapsed
  - Example: Nov 20 is last day of all first tasks, so create period when Nov 20 passes (Nov 21 or later)
  
  ## New Functions
  1. get_first_tasks_for_period - Get tasks that are "first" (earliest due date) for period
  2. calculate_first_task_last_due_date - Get max due date of all first tasks for period
  3. should_create_period_new - Check if first task last day elapsed
  4. get_non_first_tasks_for_period - Get other tasks to add after first tasks
  5. should_add_task_to_period - Check if specific task's last day elapsed
  6. backfill_recurring_work_init - Backfill at work creation respecting task logic
  7. handle_recurring_work_creation_new - Updated trigger function
*/

-- ============================================
-- Helper: Calculate single task due date for a specific period start date
-- ============================================

DROP FUNCTION IF EXISTS calculate_single_task_due_date(uuid, date) CASCADE;

CREATE FUNCTION calculate_single_task_due_date(
  p_service_task_id UUID,
  p_period_start_date DATE
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
    RETURN NULL;
  END IF;
  
  -- If exact_due_date is set, use it
  IF v_task.exact_due_date IS NOT NULL THEN
    RETURN v_task.exact_due_date;
  END IF;
  
  -- If due_day_of_month is set
  IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
    v_target_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
    v_target_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
    
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
  
  -- Fallback: use due_date_offset_days from period start date
  IF v_task.due_date_offset_days IS NOT NULL THEN
    RETURN (p_period_start_date + (v_task.due_date_offset_days || ' days')::INTERVAL)::DATE;
  END IF;
  
  -- Default: 10 days after period start
  RETURN (p_period_start_date + INTERVAL '10 days')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Get all tasks applicable for a period type
-- ============================================

DROP FUNCTION IF EXISTS get_tasks_applicable_for_period_type(uuid, text) CASCADE;

CREATE FUNCTION get_tasks_applicable_for_period_type(
  p_service_id UUID,
  p_period_type TEXT  -- 'monthly', 'quarterly', 'yearly'
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
-- Helper: Calculate first task last due date for a period
-- ============================================

DROP FUNCTION IF EXISTS calculate_first_task_last_due_date_for_period(uuid, date, date, text) CASCADE;

CREATE FUNCTION calculate_first_task_last_due_date_for_period(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_period_type TEXT
)
RETURNS DATE AS $$
DECLARE
  v_min_due_date DATE := NULL;
  v_max_due_date_among_first DATE := NULL;
  v_task_record RECORD;
  v_due_date DATE;
  v_current_date DATE;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
BEGIN
  -- First pass: find the minimum due date (earliest due date = first task marker)
  FOR v_task_record IN
    SELECT * FROM get_tasks_applicable_for_period_type(p_service_id, p_period_type)
  LOOP
    -- For monthly tasks in quarterly/yearly, find minimum across all months
    IF v_task_record.task_recurrence_type = 'monthly' AND p_period_type IN ('quarterly', 'yearly') THEN
      v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
      v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
      
      WHILE (v_current_year < v_end_year OR 
             (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
        v_current_date := DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01');
        v_due_date := calculate_single_task_due_date(v_task_record.service_task_id, v_current_date);
        
        IF v_min_due_date IS NULL OR v_due_date < v_min_due_date THEN
          v_min_due_date := v_due_date;
        END IF;
        
        v_current_month := v_current_month + 1;
        IF v_current_month > 12 THEN
          v_current_month := 1;
          v_current_year := v_current_year + 1;
        END IF;
      END LOOP;
    ELSE
      -- For quarterly/yearly tasks or monthly in monthly periods
      v_due_date := calculate_single_task_due_date(v_task_record.service_task_id, p_period_start_date);
      
      IF v_min_due_date IS NULL OR v_due_date < v_min_due_date THEN
        v_min_due_date := v_due_date;
      END IF;
    END IF;
  END LOOP;
  
  -- Second pass: find the maximum due date among tasks with minimum due date
  FOR v_task_record IN
    SELECT * FROM get_tasks_applicable_for_period_type(p_service_id, p_period_type)
  LOOP
    -- For monthly tasks in quarterly/yearly, check all months
    IF v_task_record.task_recurrence_type = 'monthly' AND p_period_type IN ('quarterly', 'yearly') THEN
      v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
      v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
      
      WHILE (v_current_year < v_end_year OR 
             (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
        v_current_date := DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01');
        v_due_date := calculate_single_task_due_date(v_task_record.service_task_id, v_current_date);
        
        IF v_due_date = v_min_due_date THEN
          IF v_max_due_date_among_first IS NULL OR v_due_date > v_max_due_date_among_first THEN
            v_max_due_date_among_first := v_due_date;
          END IF;
        END IF;
        
        v_current_month := v_current_month + 1;
        IF v_current_month > 12 THEN
          v_current_month := 1;
          v_current_year := v_current_year + 1;
        END IF;
      END LOOP;
    ELSE
      -- For quarterly/yearly tasks or monthly in monthly periods
      v_due_date := calculate_single_task_due_date(v_task_record.service_task_id, p_period_start_date);
      
      IF v_due_date = v_min_due_date THEN
        IF v_max_due_date_among_first IS NULL OR v_due_date > v_max_due_date_among_first THEN
          v_max_due_date_among_first := v_due_date;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN COALESCE(v_max_due_date_among_first, v_min_due_date, p_period_end_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Check if period should be created (first task last day elapsed)
-- ============================================

DROP FUNCTION IF EXISTS should_create_period_task_driven(uuid, date, date, text, date) CASCADE;

CREATE FUNCTION should_create_period_task_driven(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_period_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_service_id UUID;
  v_first_task_last_due_date DATE;
BEGIN
  -- Get service ID from work
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get the last due date of first tasks for this period
  v_first_task_last_due_date := calculate_first_task_last_due_date_for_period(
    v_service_id, p_period_start_date, p_period_end_date, p_period_type
  );
  
  -- Period should be created if first task last due date has elapsed
  RETURN v_first_task_last_due_date <= p_current_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Get tasks with earliest due date (first tasks)
-- ============================================

DROP FUNCTION IF EXISTS get_first_tasks_for_period_with_dues(uuid, date, date, text) CASCADE;

CREATE FUNCTION get_first_tasks_for_period_with_dues(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_period_type TEXT
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
  due_date DATE
) AS $$
DECLARE
  v_min_due_date DATE;
  v_task_record RECORD;
  v_due_date DATE;
  v_current_date DATE;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
BEGIN
  -- Calculate minimum due date
  v_min_due_date := calculate_first_task_last_due_date_for_period(
    p_service_id, p_period_start_date, p_period_end_date, p_period_type
  );
  
  -- Return tasks that have minimum due date
  FOR v_task_record IN
    SELECT * FROM get_tasks_applicable_for_period_type(p_service_id, p_period_type)
  LOOP
    -- For monthly tasks in quarterly/yearly
    IF v_task_record.task_recurrence_type = 'monthly' AND p_period_type IN ('quarterly', 'yearly') THEN
      v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
      v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
      
      WHILE (v_current_year < v_end_year OR 
             (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
        v_current_date := DATE(v_current_year || '-' || LPAD(v_current_month::TEXT, 2, '0') || '-01');
        v_due_date := calculate_single_task_due_date(v_task_record.service_task_id, v_current_date);
        
        IF v_due_date = v_min_due_date THEN
          RETURN QUERY SELECT
            v_task_record.service_task_id,
            v_task_record.title,
            v_task_record.description,
            v_task_record.priority,
            v_task_record.estimated_hours,
            v_task_record.default_assigned_to,
            v_task_record.sort_order,
            v_task_record.task_recurrence_type,
            v_due_date;
        END IF;
        
        v_current_month := v_current_month + 1;
        IF v_current_month > 12 THEN
          v_current_month := 1;
          v_current_year := v_current_year + 1;
        END IF;
      END LOOP;
    ELSE
      -- For quarterly/yearly or monthly in monthly periods
      v_due_date := calculate_single_task_due_date(v_task_record.service_task_id, p_period_start_date);
      
      IF v_due_date = v_min_due_date THEN
        RETURN QUERY SELECT
          v_task_record.service_task_id,
          v_task_record.title,
          v_task_record.description,
          v_task_record.priority,
          v_task_record.estimated_hours,
          v_task_record.default_assigned_to,
          v_task_record.sort_order,
          v_task_record.task_recurrence_type,
          v_due_date;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Helper: Create period with first tasks only
-- ============================================

DROP FUNCTION IF EXISTS create_period_with_first_tasks(uuid, date, date, text, date) CASCADE;

CREATE FUNCTION create_period_with_first_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_period_type TEXT,
  p_current_date DATE
)
RETURNS UUID AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
  v_task_record RECORD;
  v_month_name TEXT;
BEGIN
  -- Get service ID
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if should create period (first task last day elapsed)
  IF NOT should_create_period_task_driven(p_work_id, p_period_start, p_period_end, p_period_type, p_current_date) THEN
    RETURN NULL;
  END IF;
  
  -- Check if period already exists
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
  
  -- Add only first tasks
  FOR v_task_record IN
    SELECT * FROM get_first_tasks_for_period_with_dues(v_service_id, p_period_start, p_period_end, p_period_type)
  LOOP
    -- For monthly tasks, add month suffix
    IF v_task_record.task_recurrence_type = 'monthly' THEN
      v_month_name := TO_CHAR(v_task_record.due_date, 'Mon');
      
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
        v_task_record.due_date,
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
    ELSE
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
        v_task_record.due_date,
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
    END IF;
  END LOOP;
  
  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;
  
  RETURN v_work_recurring_instance_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Helper: Backfill at work creation respecting task due dates
-- ============================================

DROP FUNCTION IF EXISTS backfill_recurring_work_at_creation(uuid, date, text, date) CASCADE;

CREATE FUNCTION backfill_recurring_work_at_creation(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS VOID AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Handle monthly recurrence
  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with first tasks
      PERFORM create_period_with_first_tasks(p_work_id, v_period_start, v_period_end, 'monthly', p_current_date);
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  -- Handle quarterly recurrence
  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with first tasks
      PERFORM create_period_with_first_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date);
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  -- Handle yearly recurrence
  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with first tasks
      PERFORM create_period_with_first_tasks(p_work_id, v_period_start, v_period_end, 'yearly', p_current_date);
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Updated trigger for work insert
-- ============================================

DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works CASCADE;

DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_record RECORD;
  v_current_date DATE;
BEGIN
  -- Only process recurring works
  IF NEW.work_type != 'recurring' THEN
    RETURN NEW;
  END IF;
  
  -- Get service and recurrence info
  SELECT id, recurrence_type INTO v_service_record
  FROM services WHERE id = NEW.service_id;
  
  IF v_service_record IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Use current date for period creation eligibility check
  v_current_date := CURRENT_DATE;
  
  -- Backfill from work start date to current date, respecting task due dates
  PERFORM backfill_recurring_work_at_creation(
    NEW.id,
    NEW.work_start_date,
    v_service_record.recurrence_type,
    v_current_date
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_recurring_work_creation
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
