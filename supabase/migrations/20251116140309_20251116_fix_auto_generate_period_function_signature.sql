/*
  # Fix auto_generate_next_period_for_work Function Signature
  
  ## Issue
  The auto_generate_next_period_for_work function was calling copy_tasks_to_period
  with the old function signature (4 parameters), but the function was updated to
  require 5 parameters including p_period_start_date.
  
  ## Fix
  Updated the function call to pass the correct number of parameters:
  - Added p_period_start_date parameter to the copy_tasks_to_period call
  
  ## Result
  Periods and tasks will now load correctly without the 400 Bad Request error.
*/

CREATE OR REPLACE FUNCTION auto_generate_next_period_for_work(p_work_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_work RECORD;
  v_latest_period RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_period_exists BOOLEAN;
BEGIN
  -- Get the work
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
  AND is_recurring = TRUE;

  -- Return false if work not found or not recurring
  IF v_work IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get latest period for this work
  SELECT * INTO v_latest_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY period_end_date DESC
  LIMIT 1;

  -- If no period exists, nothing to generate next from
  IF v_latest_period IS NULL THEN
    RETURN FALSE;
  END IF;

  -- If latest period hasn't elapsed yet, no need to generate
  IF v_latest_period.period_end_date >= CURRENT_DATE THEN
    RETURN FALSE;
  END IF;

  -- Calculate next period dates
  SELECT *
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    v_work.recurrence_pattern
  );

  -- Check if next period already exists
  SELECT EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = v_next_start
  ) INTO v_period_exists;

  IF v_period_exists THEN
    RETURN FALSE;
  END IF;

  -- Create next period
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
    p_work_id,
    v_next_name,
    v_next_start,
    v_next_end,
    v_work.billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks with correct signature (5 parameters)
  v_task_count := copy_tasks_to_period(
    v_new_period_id,
    v_work.service_id,
    v_next_start,
    v_next_end,
    v_work.assigned_to
  );

  -- Update task count
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_new_period_id;

  -- Copy documents
  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_generate_next_period_for_work(UUID) TO authenticated;
