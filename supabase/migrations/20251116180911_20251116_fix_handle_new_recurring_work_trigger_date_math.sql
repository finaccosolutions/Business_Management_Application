/*
  # Fix handle_new_recurring_work Trigger - Date Math Issue

  ## Problem
  When subtracting INTERVAL from a DATE, PostgreSQL returns a TIMESTAMP, not a DATE.
  The calculate_next_period_dates function expects DATE parameters.
  
  Line: (COALESCE(NEW.start_date, CURRENT_DATE))::DATE - INTERVAL '1 day'
  This produces TIMESTAMP, but function expects DATE.

  ## Solution
  Cast the result back to DATE after the interval subtraction.
*/

CREATE OR REPLACE FUNCTION handle_new_recurring_work()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id UUID;
  v_task_count INTEGER;
  v_period_dates RECORD;
  v_service_recurrence TEXT;
BEGIN
  -- Only process recurring works
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;

  -- Get service recurrence type
  SELECT recurrence_type INTO v_service_recurrence
  FROM services
  WHERE id = NEW.service_id;

  -- Calculate first period dates based on work start date
  -- Cast result to DATE after interval math
  SELECT * INTO v_period_dates
  FROM calculate_next_period_dates(
    ((COALESCE(NEW.start_date, CURRENT_DATE))::DATE - INTERVAL '1 day')::DATE,
    COALESCE(v_service_recurrence, NEW.recurrence_pattern)
  );

  -- Create first period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status
  ) VALUES (
    NEW.id,
    v_period_dates.next_period_name,
    v_period_dates.next_start_date,
    v_period_dates.next_end_date,
    'pending'
  ) RETURNING id INTO v_period_id;

  -- Copy tasks using the updated function that only copies active service tasks
  IF NEW.service_id IS NOT NULL THEN
    v_task_count := copy_tasks_to_period_with_templates(
      v_period_id,
      NEW.id,
      NEW.service_id,
      v_period_dates.next_end_date,
      NEW.assigned_to
    );

    -- Update task count
    UPDATE work_recurring_instances
    SET total_tasks = v_task_count
    WHERE id = v_period_id;
  END IF;

  -- Copy documents
  PERFORM copy_documents_to_period(v_period_id, NEW.id);

  RETURN NEW;
END;
$$;
