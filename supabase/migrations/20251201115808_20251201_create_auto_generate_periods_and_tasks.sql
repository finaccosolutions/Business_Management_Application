/*
  # Create Auto Generate Periods and Tasks Function
  
  This function is called from the frontend RecurringPeriodManager to automatically
  generate periods and tasks based on the work's recurrence pattern and start date.
*/

CREATE FUNCTION auto_generate_periods_and_tasks(p_work_id UUID)
RETURNS void AS $$
DECLARE
  v_work RECORD;
BEGIN
  SELECT id, start_date, recurrence_pattern, is_recurring
  INTO v_work
  FROM works
  WHERE id = p_work_id;

  IF v_work IS NULL OR NOT v_work.is_recurring THEN
    RETURN;
  END IF;

  -- Backfill periods and tasks from work start date to current date
  PERFORM backfill_recurring_work_at_creation(
    v_work.id,
    v_work.start_date,
    COALESCE(v_work.recurrence_pattern, 'monthly'),
    CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;
