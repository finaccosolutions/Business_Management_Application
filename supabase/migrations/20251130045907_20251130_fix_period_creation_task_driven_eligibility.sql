/*
  # Fix Period Creation - Task Driven Eligibility

  ## Problem
  Periods are being created for ALL months from start date to current date, ignoring the key requirement:
  periods should ONLY be created when the last task of that period has its due date elapsed.

  ## Solution
  1. New function `get_last_task_due_date_for_period()` - finds the latest due date among all tasks in a period
  2. New function `should_create_period_for_date()` - checks if period's last task due date has elapsed
  3. Drop and recreate `create_period_with_all_tasks()` with eligibility check
  4. Update `backfill_recurring_work_at_creation()` to only iterate periods that should be created
  
  ## Requirements Met
  - Monthly: Create period only after month's last day (last task due date)
  - Quarterly: Create period only after last task due date
  - Yearly: Create period only after last task due date
*/

-- Drop the old function with old return type
DROP FUNCTION IF EXISTS create_period_with_all_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;

-- New function: Get the last (latest) due date among all tasks in a period
CREATE FUNCTION get_last_task_due_date_for_period(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_task RECORD;
  v_max_due_date DATE;
BEGIN
  -- Find the maximum due date among all active service tasks
  SELECT MAX(
    CASE 
      WHEN st.exact_due_date IS NOT NULL THEN st.exact_due_date
      WHEN st.due_day_of_month IS NOT NULL AND st.due_day_of_month > 0 THEN
        DATE(EXTRACT(YEAR FROM p_period_end_date)::TEXT || '-' || 
             LPAD(EXTRACT(MONTH FROM p_period_end_date)::TEXT, 2, '0') || '-' ||
             LPAD(LEAST(st.due_day_of_month, EXTRACT(DAY FROM (DATE(EXTRACT(YEAR FROM p_period_end_date)::TEXT || '-' || 
                       LPAD(EXTRACT(MONTH FROM p_period_end_date)::TEXT, 2, '0') || '-01') 
                       + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER)::TEXT, 2, '0'))
      WHEN st.due_date_offset_days IS NOT NULL THEN
        (p_period_end_date + (st.due_date_offset_days || ' days')::INTERVAL)::DATE
      ELSE
        (p_period_end_date + INTERVAL '10 days')::DATE
    END
  )
  INTO v_max_due_date
  FROM service_tasks st
  WHERE st.service_id = p_service_id
  AND st.is_active = TRUE;

  IF v_max_due_date IS NULL THEN
    RETURN p_period_end_date;
  END IF;

  RETURN v_max_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- New function: Check if a period should be created (last task due date has elapsed)
CREATE FUNCTION should_create_period_for_date(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_task_due_date DATE;
BEGIN
  v_last_task_due_date := get_last_task_due_date_for_period(p_service_id, p_period_start_date, p_period_end_date);
  
  RETURN p_current_date >= v_last_task_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- New function: Create period with all tasks - now respects eligibility
CREATE FUNCTION create_period_with_all_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_period_created BOOLEAN := FALSE;
BEGIN
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT should_create_period_for_date(v_service_id, p_period_start, p_period_end, p_current_date) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  IF v_work_recurring_instance_id IS NULL THEN
    v_period_name := TO_CHAR(p_period_start, 'Mon YYYY');

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
      v_period_name,
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_work_recurring_instance_id;
    
    v_period_created := TRUE;
  END IF;

  FOR v_task_record IN
    SELECT 
      st.id as service_task_id,
      st.title,
      st.description,
      st.priority,
      st.estimated_hours,
      st.default_assigned_to,
      st.sort_order
    FROM service_tasks st
    WHERE st.service_id = v_service_id
    AND st.is_active = TRUE
    ORDER BY st.sort_order ASC
  LOOP
    v_task_due_date := calculate_task_due_date_for_period(
      v_task_record.service_task_id,
      p_period_start,
      p_period_end
    );

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
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;

  RETURN v_period_created;
END;
$$ LANGUAGE plpgsql;

-- Updated backfill function
CREATE OR REPLACE FUNCTION backfill_recurring_work_at_creation(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_service_id UUID;
BEGIN
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'monthly', p_current_date);

      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;

  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date);

      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;

  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;

      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'yearly', p_current_date);

      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;
