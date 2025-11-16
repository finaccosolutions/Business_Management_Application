/*
  # Fix Backfill Function - Use Correct Column Names

  ## Fix
  - Use correct OUT parameter names: next_start_date, next_end_date, next_period_name
*/

DROP FUNCTION IF EXISTS backfill_missing_periods(UUID) CASCADE;

CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_work RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
  v_new_period_id UUID;
  v_calc_result RECORD;
BEGIN
  -- Get the work
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;

  IF v_work IS NULL THEN
    RETURN 0;
  END IF;

  IF v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;

  -- Start from day before work start to get first period
  v_next_start := v_work.start_date::DATE - INTERVAL '1 day';

  -- Loop until we reach today
  WHILE TRUE LOOP
    -- Calculate next period using the function
    SELECT * INTO v_calc_result
    FROM calculate_next_period_dates(v_next_start, v_work.recurrence_pattern);

    v_next_start := v_calc_result.next_start_date;
    v_next_end := v_calc_result.next_end_date;
    v_next_name := v_calc_result.next_period_name;

    -- Stop if we've passed today
    IF v_next_start > CURRENT_DATE THEN
      EXIT;
    END IF;

    -- Check if period already exists
    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;

    IF NOT v_period_exists THEN
      -- Create period
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
      IF v_work.service_id IS NOT NULL THEN
        v_task_count := copy_tasks_to_period(
          v_new_period_id,
          v_work.service_id,
          v_next_start,
          v_next_end,
          v_work.assigned_to
        );

        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_new_period_id;
      END IF;

      -- Copy documents
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

      v_total_created := v_total_created + 1;
    END IF;

    -- Move to next period by adding 1 day to current end date
    v_next_start := v_next_end + INTERVAL '1 day';
  END LOOP;

  RETURN v_total_created;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_missing_periods(UUID) TO authenticated;
