/*
  # Fix all trigger function column references

  1. Problems Fixed
    - Change NEW.expected_completion_date to NEW.due_date (correct column name)
    - Change NEW.recurring_frequency to NEW.recurrence_pattern (correct column name)
    - Remove duplicate copy_service_tasks_to_work function with different signature
    - Fix missing 'notes' column reference in recurring_period_tasks

  2. Functions Updated
    - copy_service_tasks_to_work() trigger function
    - handle_new_recurring_work_initial_period() trigger function

  3. Validation
    - All column references now match actual works table schema
    - Removed duplicate function definitions
*/

-- Drop all versions of the functions
DROP FUNCTION IF EXISTS copy_service_tasks_to_work() CASCADE;
DROP FUNCTION IF EXISTS copy_service_tasks_to_work(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS handle_new_recurring_work_initial_period() CASCADE;

-- Recreate copy_service_tasks_to_work with correct column names
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
    SELECT period_start_date, period_end_date INTO v_period_start, v_period_end
    FROM work_recurring_instances
    WHERE work_id = NEW.id
    ORDER BY period_start_date
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
    ELSIF NEW.due_date IS NOT NULL THEN
      -- For one-time work, calculate based on due_date
      CASE
        WHEN v_task.due_date_offset_days IS NOT NULL THEN
          v_calculated_due_date := NEW.due_date - (v_task.due_date_offset_days || ' days')::INTERVAL;
        WHEN v_task.due_day_of_month IS NOT NULL THEN
          v_calculated_due_date := make_date(
            EXTRACT(YEAR FROM NEW.due_date)::INTEGER,
            EXTRACT(MONTH FROM NEW.due_date)::INTEGER,
            LEAST(v_task.due_day_of_month, 
                  EXTRACT(DAY FROM (date_trunc('month', NEW.due_date) + interval '1 month' - interval '1 day'))::INTEGER
            )
          );
        ELSE
          v_calculated_due_date := NEW.due_date;
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
      assigned_to,
      status
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
      v_task.default_assigned_to,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Recreate handle_new_recurring_work_initial_period with correct column names
CREATE OR REPLACE FUNCTION handle_new_recurring_work_initial_period()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
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
  
  -- Use recurrence_pattern (not recurring_frequency)
  CASE NEW.recurrence_pattern
    WHEN 'monthly' THEN
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
    WHEN 'quarterly' THEN
      v_period_end := (v_period_start + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'Q' || TO_CHAR(v_period_start, 'Q YYYY');
    WHEN 'half_yearly' THEN
      v_period_end := (v_period_start + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'H' || CEIL(EXTRACT(MONTH FROM v_period_start) / 6.0)::TEXT || ' ' || TO_CHAR(v_period_start, 'YYYY');
    WHEN 'yearly' THEN
      v_period_end := (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      v_period_name := 'FY ' || TO_CHAR(v_period_start, 'YYYY-') || TO_CHAR(v_period_start + INTERVAL '1 year', 'YY');
    ELSE
      -- Default to monthly
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  END CASE;

  -- Create initial recurring period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    billing_amount,
    status,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    NEW.id,
    v_period_name,
    v_period_start,
    v_period_end,
    NEW.billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
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
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
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
      v_calculated_due_date,
      v_task.default_assigned_to,
      'pending'
    );
  END LOOP;

  -- Update task counts
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks 
    WHERE work_recurring_instance_id = v_new_period_id
  )
  WHERE id = v_new_period_id;

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
