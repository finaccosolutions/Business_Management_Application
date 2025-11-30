/*
  # Fix Recurring Work Period Creation - Create All Tasks

  ## Problem
  When creating a recurring work, the trigger only creates periods with first tasks (sort_order = 0),
  but missing all other tasks. The function `create_period_with_first_tasks` filters tasks incorrectly.

  ## Solution
  1. Rename and refactor `create_period_with_first_tasks` to `create_period_with_all_tasks`
  2. Remove the sort_order = 0 filter to include ALL active tasks
  3. This ensures complete periods are created with all their tasks
*/

-- Drop the old function
DROP FUNCTION IF EXISTS create_period_with_first_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;

-- Create new function that creates periods with ALL tasks
CREATE FUNCTION create_period_with_all_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS void AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
  v_task_record RECORD;
  v_task_due_date DATE;
BEGIN
  -- Get work details
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  -- Check if this period already exists
  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  -- Create period if it doesn't exist
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
  END IF;

  -- Create ALL tasks for this period (not just sort_order = 0)
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
    -- Calculate due date for this task
    v_task_due_date := calculate_task_due_date_for_period(
      v_task_record.service_task_id,
      p_period_start,
      p_period_end
    );

    -- Create the task if it doesn't already exist
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

  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;

END;
$$ LANGUAGE plpgsql;

-- Update backfill function to use the new function name
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
BEGIN
  -- Handle monthly recurrence
  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

      -- Try to create period with ALL tasks
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'monthly', p_current_date);

      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;

  -- Handle quarterly recurrence
  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

      -- Try to create period with ALL tasks
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date);

      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;

  -- Handle yearly recurrence
  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;

      -- Try to create period with ALL tasks
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'yearly', p_current_date);

      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;
