/*
  # Fix Task Due Date Calculation and Period Generation

  This migration implements the correct task-driven period creation logic per the requirements:
  
  1. **Task Due Date Calculation**: 
     TaskDueDate = TaskPeriodEndDate + Offset(OffsetFromPeriodEnd, OffsetType)
     Where OffsetType is 'day' or 'month' and OffsetValue is the offset amount.
  
  2. **Task Eligibility (ALL must be true)**:
     - Task's period end date has PASSED (TaskPeriodEndDate < CurrentDate)
     - Task's due date has NOT PASSED (TaskDueDate >= CurrentDate)
     - Task's due date is on/after work start (TaskDueDate >= WorkStartDate)
  
  3. **Period Eligibility**:
     Create period only if at least one task qualifies by above rules.
  
  ## Changes
  1. Fix `calculate_task_due_date_for_period()` to use offset logic
  2. Fix `calculate_task_due_date_in_month()` for monthly tasks with offsets
  3. Update `should_create_period_for_date()` to include work start date check
  4. Ensure all existing functions use correct parameter names
*/

-- Drop and recreate task due date calculation functions with correct offset logic

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
  v_offset_value INTEGER;
  v_offset_type TEXT;
BEGIN
  SELECT st.* INTO v_task
  FROM service_tasks st
  WHERE st.id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  v_offset_value := COALESCE(v_task.due_offset_value, 0);
  v_offset_type := COALESCE(v_task.due_offset_type, 'day');

  -- Apply offset from period end date
  IF v_offset_type = 'month' THEN
    v_due_date := (DATE_TRUNC('month', p_period_end_date)::DATE + INTERVAL '1 month' 
                   + (v_offset_value || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  ELSE
    -- Default to day offset
    v_due_date := p_period_end_date + (v_offset_value || ' days')::INTERVAL;
  END IF;

  RETURN v_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Fix monthly task due date calculation with offset logic

DROP FUNCTION IF EXISTS calculate_task_due_date_in_month(UUID, INTEGER, INTEGER) CASCADE;

CREATE FUNCTION calculate_task_due_date_in_month(
  p_service_task_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_month_end_date DATE;
  v_due_date DATE;
  v_offset_value INTEGER;
  v_offset_type TEXT;
BEGIN
  SELECT st.* INTO v_task
  FROM service_tasks st
  WHERE st.id = p_service_task_id;
  
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate last day of the month
  v_month_end_date := (DATE_TRUNC('month', DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01'))::DATE 
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  v_offset_value := COALESCE(v_task.due_offset_value, 0);
  v_offset_type := COALESCE(v_task.due_offset_type, 'day');

  -- Apply offset from month end
  IF v_offset_type = 'month' THEN
    v_due_date := (DATE_TRUNC('month', v_month_end_date)::DATE + INTERVAL '1 month' 
                   + (v_offset_value || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  ELSE
    -- Day offset from month end
    v_due_date := v_month_end_date + (v_offset_value || ' days')::INTERVAL;
  END IF;

  RETURN v_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Fix period eligibility check to include work start date requirement

DROP FUNCTION IF EXISTS should_create_period_for_date(UUID, DATE, DATE, DATE) CASCADE;

CREATE FUNCTION should_create_period_for_date(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_current_date DATE,
  p_work_start_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
  v_task_due_date DATE;
  v_task_period_last_day DATE;
  v_has_eligible_task BOOLEAN := FALSE;
BEGIN
  -- Check each active task
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

    -- Check all three eligibility conditions:
    -- 1. Task's period has elapsed (task_period_last_day < current_date)
    -- 2. Task's due date has NOT passed (task_due_date >= current_date)
    -- 3. Task's due date is on/after work start (task_due_date >= work_start_date)
    IF v_task_period_last_day < p_current_date 
       AND v_task_due_date >= p_current_date 
       AND v_task_due_date >= p_work_start_date THEN
      v_has_eligible_task := TRUE;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_has_eligible_task;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update create_period_with_all_tasks to pass work_start_date parameter

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
  v_work_start_date DATE;
  v_period_id UUID;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_month_iter INTEGER;
  v_year_iter INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_period_created BOOLEAN := FALSE;
BEGIN
  SELECT service_id, start_date INTO v_service_id, v_work_start_date 
  FROM works 
  WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if period should be created (now includes work start date check)
  IF NOT should_create_period_for_date(v_service_id, p_period_start, p_period_end, p_current_date, v_work_start_date) THEN
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
    -- Handle monthly recurring tasks - create one per month in the period
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

-- Update backfill function to work with new signature

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

-- Clear existing periods and backfill with corrected logic
DELETE FROM recurring_period_tasks 
WHERE work_recurring_instance_id IN (
  SELECT id FROM work_recurring_instances
  WHERE work_id IN (SELECT id FROM works WHERE is_recurring = TRUE)
);

DELETE FROM work_recurring_instances
WHERE work_id IN (SELECT id FROM works WHERE is_recurring = TRUE);

-- Backfill all recurring works with corrected logic
DO $$
DECLARE
  v_work RECORD;
BEGIN
  FOR v_work IN
    SELECT id, start_date, recurrence_pattern
    FROM works
    WHERE is_recurring = TRUE
    ORDER BY start_date
  LOOP
    PERFORM backfill_recurring_work_at_creation(
      v_work.id,
      v_work.start_date,
      COALESCE(v_work.recurrence_pattern, 'monthly'),
      CURRENT_DATE
    );
  END LOOP;
END $$;
