/*
  # Fix Function Type Casting for calculate_next_period_dates

  ## Problem
  The function `calculate_next_period_dates` expects a DATE parameter but is being
  called with a TIMESTAMP value, causing the error:
  "function calculate_next_period_dates(timestamp without time zone, text) does not exist"

  ## Solution
  Cast the timestamp to date in the function call.

  ## Changes
  1. Update handle_new_recurring_work trigger to cast the timestamp to date
*/

-- Fix the trigger function that creates initial period
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

  -- Calculate first period dates based on work start date (cast to DATE)
  SELECT * INTO v_period_dates
  FROM calculate_next_period_dates(
    (NEW.start_date - INTERVAL '1 day')::DATE,
    v_service_recurrence
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

  -- Copy tasks with the updated function signature
  v_task_count := copy_tasks_to_period(
    v_period_id,
    NEW.service_id,
    v_period_dates.next_start_date,
    v_period_dates.next_end_date,
    NEW.assigned_to
  );

  -- Copy documents
  PERFORM copy_documents_to_period(v_period_id, NEW.id);

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work ON works;
CREATE TRIGGER trigger_handle_new_recurring_work
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_recurring_work();

COMMENT ON FUNCTION handle_new_recurring_work IS 'Creates initial recurring period with tasks when a new recurring work is added';
