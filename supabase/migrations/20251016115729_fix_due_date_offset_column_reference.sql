/*
  # Fix due_date_offset column reference in triggers

  1. Problem
    - Database functions reference `st.due_date_offset` which doesn't exist
    - The actual column name is `st.due_date_offset_days`
    - This causes errors when creating recurring work entries

  2. Solution
    - Update all trigger functions to use correct column name `due_date_offset_days`
    - Fix copy_service_tasks_to_work function
    - Fix handle_new_recurring_work_initial_period function

  3. Tables Updated
    - Functions: copy_service_tasks_to_work
    - Functions: handle_new_recurring_work_initial_period
*/

-- Drop existing functions first
DROP FUNCTION IF EXISTS copy_service_tasks_to_work() CASCADE;
DROP FUNCTION IF EXISTS handle_new_recurring_work_initial_period() CASCADE;

-- Recreate copy_service_tasks_to_work with correct column name
CREATE OR REPLACE FUNCTION copy_service_tasks_to_work()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_calculated_due_date DATE;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Get the first recurring period if this is a recurring work
  IF NEW.is_recurring THEN
    SELECT period_start, period_end INTO v_period_start, v_period_end
    FROM recurring_periods
    WHERE work_id = NEW.id
    ORDER BY period_start
    LIMIT 1;
  END IF;

  -- Copy tasks from service to work
  FOR v_task IN 
    SELECT * FROM service_tasks 
    WHERE service_id = NEW.service_id 
    AND is_active = true
    ORDER BY sort_order
  LOOP
    -- Calculate due date based on task configuration
    v_calculated_due_date := NULL;
    
    IF NEW.is_recurring AND v_period_end IS NOT NULL THEN
      -- For recurring work, calculate based on period
      CASE
        WHEN v_task.due_date_offset_days IS NOT NULL THEN
          v_calculated_due_date := v_period_end - (v_task.due_date_offset_days || ' days')::INTERVAL;
        WHEN v_task.due_day_of_month IS NOT NULL THEN
          v_calculated_due_date := make_date(
            EXTRACT(YEAR FROM v_period_end)::INTEGER,
            EXTRACT(MONTH FROM v_period_end)::INTEGER,
            LEAST(v_task.due_day_of_month, 
                  EXTRACT(DAY FROM (date_trunc('month', v_period_end) + interval '1 month' - interval '1 day'))::INTEGER
            )
          );
        ELSE
          v_calculated_due_date := v_period_end;
      END CASE;
    ELSIF NEW.expected_completion_date IS NOT NULL THEN
      -- For one-time work, calculate based on expected completion date
      CASE
        WHEN v_task.due_date_offset_days IS NOT NULL THEN
          v_calculated_due_date := NEW.expected_completion_date - (v_task.due_date_offset_days || ' days')::INTERVAL;
        WHEN v_task.due_day_of_month IS NOT NULL THEN
          v_calculated_due_date := make_date(
            EXTRACT(YEAR FROM NEW.expected_completion_date)::INTEGER,
            EXTRACT(MONTH FROM NEW.expected_completion_date)::INTEGER,
            LEAST(v_task.due_day_of_month, 
                  EXTRACT(DAY FROM (date_trunc('month', NEW.expected_completion_date) + interval '1 month' - interval '1 day'))::INTEGER
            )
          );
        ELSE
          v_calculated_due_date := NEW.expected_completion_date;
      END CASE;
    END IF;

    -- Insert work task
    INSERT INTO work_tasks (
      work_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      notes,
      due_date,
      assigned_to
    ) VALUES (
      NEW.id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_task.notes,
      v_calculated_due_date,
      v_task.default_assigned_to
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Recreate handle_new_recurring_work_initial_period with correct column name
CREATE OR REPLACE FUNCTION handle_new_recurring_work_initial_period()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_new_period_id UUID;
  v_task RECORD;
  v_calculated_due_date DATE;
BEGIN
  -- Only proceed if this is a new recurring work
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;

  -- Calculate first period dates
  v_period_start := NEW.start_date;
  
  CASE NEW.recurring_frequency
    WHEN 'monthly' THEN
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    WHEN 'quarterly' THEN
      v_period_end := (v_period_start + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    WHEN 'half_yearly' THEN
      v_period_end := (v_period_start + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
    WHEN 'yearly' THEN
      v_period_end := (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    ELSE
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  END CASE;

  -- Create initial recurring period
  INSERT INTO recurring_periods (
    work_id,
    period_start,
    period_end,
    status
  ) VALUES (
    NEW.id,
    v_period_start,
    v_period_end,
    'active'
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks for the new period
  FOR v_task IN 
    SELECT st.* 
    FROM service_tasks st
    WHERE st.service_id = NEW.service_id 
    AND st.is_active = true
    ORDER BY st.sort_order
  LOOP
    -- Calculate due date for this task
    v_calculated_due_date := NULL;
    
    CASE
      WHEN v_task.due_date_offset_days IS NOT NULL THEN
        v_calculated_due_date := v_period_end - (v_task.due_date_offset_days || ' days')::INTERVAL;
      WHEN v_task.due_day_of_month IS NOT NULL THEN
        v_calculated_due_date := make_date(
          EXTRACT(YEAR FROM v_period_end)::INTEGER,
          EXTRACT(MONTH FROM v_period_end)::INTEGER,
          LEAST(v_task.due_day_of_month, 
                EXTRACT(DAY FROM (date_trunc('month', v_period_end) + interval '1 month' - interval '1 day'))::INTEGER
          )
        );
      ELSE
        v_calculated_due_date := v_period_end;
    END CASE;

    -- Insert recurring period task
    INSERT INTO recurring_period_tasks (
      period_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      notes,
      due_date,
      assigned_to,
      status
    ) VALUES (
      v_new_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_task.notes,
      v_calculated_due_date,
      v_task.default_assigned_to,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Recreate triggers
CREATE TRIGGER trigger_copy_service_tasks_to_work
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION copy_service_tasks_to_work();

CREATE TRIGGER trigger_handle_new_recurring_work_initial_period
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_recurring_work_initial_period();
