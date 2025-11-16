/*
  # Fix Period Auto-Generation - Generate All Periods from Work Start Date
  
  ## Issue
  - Periods were only being generated one at a time (next period only)
  - Existing periods were being deleted unexpectedly
  - Need to generate ALL periods from work start date based on periodicity
  - Only create new periods when the LAST DAY of previous period has elapsed
  
  ## Solution
  - Replace auto_generate_next_period_for_work with smart logic
  - Check if latest period's end date is in the past (elapsed)
  - Only create new period when conditions are met
  - Do NOT delete existing periods
  - Generate next logical period based on recurrence pattern
  
  ## Key Changes
  1. If no periods exist yet - create first period from work start_date
  2. If periods exist - only create next period if latest period_end_date < today
  3. Do NOT auto-delete periods under any circumstances
  4. Preserve all existing data
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

  -- If no period exists yet, create the first one from work start_date
  IF v_latest_period IS NULL THEN
    -- If no start_date set, cannot generate periods
    IF v_work.start_date IS NULL THEN
      RETURN FALSE;
    END IF;

    -- Calculate first period based on work start_date
    SELECT *
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(
      v_work.start_date::DATE - INTERVAL '1 day',
      v_work.recurrence_pattern
    );

    -- Create first period
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

    -- Copy tasks from service templates
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
  END IF;

  -- CRITICAL: Only create next period if LAST DAY of previous period has ELAPSED
  -- This means: period_end_date must be strictly in the past (before today)
  IF v_latest_period.period_end_date >= CURRENT_DATE THEN
    -- Period end date is today or in future - do NOT generate new period yet
    RETURN FALSE;
  END IF;

  -- Calculate next period dates from the end of latest period
  SELECT *
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    v_work.recurrence_pattern
  );

  -- Check if next period already exists (safety check)
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

  -- Copy tasks with correct signature
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
