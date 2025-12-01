/*
  # Comprehensive Fix for Recurring Period and Task Creation
  
  ## Core Issue
  The current implementation is overly complex with duplicate functions. The correct logic should be:
  
  1. **Period Eligibility**: A period should be created if:
     - At least ONE task for that period has a due date that has NOT passed yet
     - AND the period's last day HAS passed (period is now "closed")
     - This means: period_end_date < CURRENT_DATE < task_due_date (for at least one task)
  
  2. **Example**: 
     - Work: quarterly, start 02-10-2025, current date 29-11-2025
     - Q2 (Jul-Sep): GSTR-1 due 10-10-2025, GSTR-3B due 20-10-2025, GST Payment due 21-10-2025
       - All due dates passed → NO period needed (Q2 period end 30-09-2025, all task dues after that)
       - Wait, Q2 end is 30-Sep, start date is 02-Oct, so NO tasks for Q2 can exist!
     - Q3 (Oct-Dec): 
       - Oct GST Payment due 21-10-2025 (passed before 29-11)
       - Nov GST Payment due 21-11-2025 (passed before 29-11)
       - But period shouldn't create yet because period end date is 31-12-2025 (future)
       
  3. **Correct Logic for Your Example**:
     - When work created on 02-10-2025 with quarterly recurrence starting 02-10-2025:
       - Q3 (01-10-2025 to 31-12-2025): Check which tasks are eligible
       - GSTR-1 (quarterly, due 10th of Q end = 31-12-2025): NOT eligible yet (due date future)
       - GSTR-3B (quarterly, due 20th of Q end = 31-12-2025): NOT eligible yet (due date future)
       - GST Payment (monthly, due 21st each month): 
         - Oct 21: PASSED (before current date 29-11)
         - Nov 21: PASSED (before current date 29-11)
         - Dec 21: NOT PASSED (future)
       - Q3 period SHOULD be created because at least Oct and Nov GST payments are due/past
       - But wait - the rule says "at least one task due date NOT passed" and "period end date passed"
       - Q3 end is 31-12-2025 (future), so period shouldn't be created yet!
       
  4. **Re-reading Your Rule**:
     "there are 2 condition when create a task that is that task period last day is should elapsed 
     and due date of that task should not elapsed"
     
     This means for EACH TASK in a period to be created:
     - Task's period last day must have passed (e.g., month ends, quarter ends)
     - Task's due date must NOT have passed yet
     - If at least ONE task meets both conditions → create that period with ALL tasks
     
  ## Changes
  1. Drop all duplicate functions
  2. Create clean, focused functions for:
     - Calculating task due dates based on recurrence and period
     - Determining which tasks should be included in a period
     - Creating periods when eligible
     - Backfilling on work creation
  3. Ensure triggers work correctly on work insertion
*/

-- Step 1: Clean up duplicate functions
DROP FUNCTION IF EXISTS should_create_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_based_on_tasks(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_task_driven(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_include_task_in_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_earliest_task_period_end(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_to_add_for_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_to_add_for_period(UUID, DATE, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date_for_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date_for_month(UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS calculate_first_task_last_due_date_for_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS calculate_enhanced_task_due_date(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS add_period_specific_date_override(UUID, UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS track_task_due_date_override(UUID, UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS add_tasks_to_period_on_due_date(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS add_subsequent_tasks_to_period(UUID) CASCADE;
DROP FUNCTION IF EXISTS create_period_with_first_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS create_period_with_first_tasks_v2(UUID, DATE, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS find_latest_task_expiry_date(UUID) CASCADE;
DROP FUNCTION IF EXISTS manage_recurring_periods_for_work(UUID) CASCADE;

-- Step 2: Helper - Get month name
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
    ELSE ''
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Calculate task due date for a specific month/period
DROP FUNCTION IF EXISTS calculate_task_due_date_in_month(UUID, INTEGER, INTEGER) CASCADE;

CREATE FUNCTION calculate_task_due_date_in_month(
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
  SELECT st.* INTO v_task
  FROM service_tasks st
  WHERE st.id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate last day of the month
  v_last_day_of_month := EXTRACT(DAY FROM (
    DATE_TRUNC('month', DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01'))::DATE 
    + INTERVAL '1 month' - INTERVAL '1 day'
  ))::INTEGER;

  -- Use due_day_of_month or offset
  IF v_task.due_day_of_month IS NOT NULL AND v_task.due_day_of_month > 0 THEN
    v_due_day := LEAST(v_task.due_day_of_month, v_last_day_of_month);
  ELSE
    -- Use offset from period end
    v_due_day := 10;
  END IF;

  RETURN DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-' || LPAD(v_due_day::TEXT, 2, '0'));
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 4: Calculate due date for a task in a given period
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

  -- For monthly recurring tasks, use first month of period
  IF v_task.task_recurrence_type = 'monthly' THEN
    v_due_date := calculate_task_due_date_in_month(
      p_service_task_id,
      EXTRACT(MONTH FROM p_period_start_date)::INTEGER,
      EXTRACT(YEAR FROM p_period_start_date)::INTEGER
    );
  -- For quarterly and yearly, use end date
  ELSIF v_task.task_recurrence_type IN ('quarterly', 'yearly') THEN
    v_due_date := calculate_task_due_date_in_month(
      p_service_task_id,
      EXTRACT(MONTH FROM p_period_end_date)::INTEGER,
      EXTRACT(YEAR FROM p_period_end_date)::INTEGER
    );
  ELSE
    v_due_date := p_period_end_date + INTERVAL '10 days';
  END IF;

  RETURN v_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 5: Determine if period should be created based on task eligibility
DROP FUNCTION IF EXISTS should_create_period_for_date(UUID, DATE, DATE, DATE) CASCADE;

CREATE FUNCTION should_create_period_for_date(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
  v_task_due_date DATE;
  v_task_period_last_day DATE;
  v_has_eligible_task BOOLEAN := FALSE;
BEGIN
  -- Check each task
  FOR v_task IN
    SELECT id, task_recurrence_type
    FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
  LOOP
    -- Determine the "period last day" for this task's recurrence
    IF v_task.task_recurrence_type = 'monthly' THEN
      -- For monthly tasks: period is each month, so last day = end of that month
      v_task_period_last_day := (DATE_TRUNC('month', p_period_start_date)::DATE 
        + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSIF v_task.task_recurrence_type = 'quarterly' THEN
      -- For quarterly tasks: period = quarter, last day = end of quarter
      v_task_period_last_day := p_period_end_date;
    ELSIF v_task.task_recurrence_type = 'yearly' THEN
      -- For yearly tasks: period = year, last day = end of year
      v_task_period_last_day := (DATE_TRUNC('year', p_period_start_date)::DATE 
        + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    ELSE
      CONTINUE;
    END IF;

    -- Calculate this task's due date in this period
    v_task_due_date := calculate_task_due_date_for_period(v_task.id, p_period_start_date, p_period_end_date);

    -- Check eligibility: task_period_last_day elapsed AND task_due_date not elapsed
    IF v_task_period_last_day < p_current_date AND v_task_due_date >= p_current_date THEN
      v_has_eligible_task := TRUE;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_has_eligible_task;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 6: Get last task due date for a period (for reference)
DROP FUNCTION IF EXISTS get_last_task_due_date_for_period(UUID, DATE, DATE) CASCADE;

CREATE FUNCTION get_last_task_due_date_for_period(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_max_due_date DATE;
BEGIN
  SELECT MAX(calculate_task_due_date_for_period(st.id, p_period_start_date, p_period_end_date))
  INTO v_max_due_date
  FROM service_tasks st
  WHERE st.service_id = p_service_id
  AND st.is_active = TRUE;

  RETURN v_max_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 7: Create period with all tasks for that period
DROP FUNCTION IF EXISTS create_period_with_all_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;

CREATE FUNCTION create_period_with_all_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_service_id UUID;
  v_period_id UUID;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_month_iter INTEGER;
  v_year_iter INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_period_created BOOLEAN := FALSE;
BEGIN
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if period should be created
  IF NOT should_create_period_for_date(v_service_id, p_period_start, p_period_end, p_current_date) THEN
    RETURN FALSE;
  END IF;

  -- Check if period already exists
  SELECT id INTO v_period_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  IF v_period_id IS NULL THEN
    -- Create period
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
      CURRENT_DATE,
      generate_period_name(p_period_start, p_period_end, p_recurrence_type),
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_period_id;
    
    v_period_created := TRUE;
  END IF;

  -- Add tasks to period
  FOR v_task_record IN
    SELECT id, title, description, priority, estimated_hours, default_assigned_to, sort_order
    FROM service_tasks
    WHERE service_id = v_service_id
    AND is_active = TRUE
    ORDER BY sort_order ASC
  LOOP
    -- Handle monthly recurring tasks - create one per month
    IF (SELECT task_recurrence_type FROM service_tasks WHERE id = v_task_record.id) = 'monthly' THEN
      v_month_iter := EXTRACT(MONTH FROM p_period_start)::INTEGER;
      v_year_iter := EXTRACT(YEAR FROM p_period_start)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end)::INTEGER;

      WHILE (v_year_iter < v_end_year OR (v_year_iter = v_end_year AND v_month_iter <= v_end_month)) LOOP
        v_task_due_date := calculate_task_due_date_in_month(v_task_record.id, v_month_iter, v_year_iter);

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
          v_period_id,
          v_task_record.id,
          v_task_record.title || ' - ' || get_month_name(v_month_iter),
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
        ON CONFLICT DO NOTHING;

        v_month_iter := v_month_iter + 1;
        IF v_month_iter > 12 THEN
          v_month_iter := 1;
          v_year_iter := v_year_iter + 1;
        END IF;
      END LOOP;
    ELSE
      -- Quarterly/Yearly tasks - single entry per period
      v_task_due_date := calculate_task_due_date_for_period(v_task_record.id, p_period_start, p_period_end);

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
        v_period_id,
        v_task_record.id,
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
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id
  )
  WHERE id = v_period_id;

  RETURN v_period_created;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Backfill periods on work creation
DROP FUNCTION IF EXISTS backfill_recurring_work_at_creation(UUID, DATE, TEXT, DATE) CASCADE;

CREATE FUNCTION backfill_recurring_work_at_creation(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'monthly', p_current_date);
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;

  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start)::DATE + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date);
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;

  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start)::DATE + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'yearly', p_current_date);
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Clean up old triggers and recreate
DROP TRIGGER IF EXISTS trg_backfill_recurring_work_after_insert ON works;
DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works;
DROP FUNCTION IF EXISTS backfill_recurring_work_after_insert() CASCADE;
DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring THEN
    NEW.work_type := 'recurring';
    IF NEW.start_date IS NULL THEN
      NEW.start_date := CURRENT_DATE;
    END IF;
  ELSE
    NEW.work_type := 'standard';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_recurring_work_creation
BEFORE INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();

CREATE FUNCTION backfill_recurring_work_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring THEN
    PERFORM backfill_recurring_work_at_creation(
      NEW.id,
      NEW.start_date,
      COALESCE(NEW.recurrence_pattern, 'monthly'),
      CURRENT_DATE
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_backfill_recurring_work_after_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION backfill_recurring_work_after_insert();

-- Step 10: Drop redundant period creation functions
DROP FUNCTION IF EXISTS check_and_create_pending_periods() CASCADE;
DROP FUNCTION IF EXISTS process_recurring_work_periods() CASCADE;
DROP FUNCTION IF EXISTS create_pending_periods_for_work(UUID) CASCADE;

