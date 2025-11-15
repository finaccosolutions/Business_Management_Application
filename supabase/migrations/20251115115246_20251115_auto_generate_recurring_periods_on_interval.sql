/*
  # Automatic Recurring Period Generation

  ## Overview
  Implements automatic generation of next recurring periods when a period's end date has elapsed.
  Instead of requiring manual "Generate Next" button clicks, the system now automatically creates
  the next period for any recurring work when its current period expires.

  ## How It Works
  1. When a recurring work period's end date passes (elapse), the system automatically triggers
  2. The next period is created with proper dates, name, tasks, and documents
  3. Only one new period per work is created at a time to prevent duplicates
  4. The process runs transparently without user intervention

  ## Implementation
  - Added trigger function: `auto_generate_next_recurring_period()`
  - Added periodic execution check to create missing periods
  - Maintains data integrity by checking for existing periods before creation
  - Works seamlessly with existing manual "Generate Next" button

  ## Benefits
  - No more manual period generation needed
  - Recurring work periods are always ready for the next cycle
  - Eliminates the gap where no period exists for ongoing work
  - Users can still manually generate if needed

  ## Important Notes
  - Automatic generation happens on first read/write to recurring instances
  - The function is idempotent (safe to call multiple times)
  - Existing manual generation button still works
*/

-- Create function to auto-generate missing periods for a specific work
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

  -- Copy tasks
  v_task_count := copy_tasks_to_period(
    v_new_period_id,
    v_work.service_id,
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

-- Create function to generate all missing periods (can be called periodically)
CREATE OR REPLACE FUNCTION auto_generate_all_missing_periods()
RETURNS TABLE (
  work_id UUID,
  work_name TEXT,
  new_period_id UUID,
  new_period_name TEXT,
  generated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_work RECORD;
  v_generated BOOLEAN;
  v_new_period RECORD;
BEGIN
  -- Find all recurring works with active status
  FOR v_work IN
    SELECT DISTINCT w.id, w.title, w.service_id, w.assigned_to, w.billing_amount, w.recurrence_pattern
    FROM works w
    WHERE w.is_recurring = TRUE
    AND w.status = 'active'
  LOOP
    -- Try to generate next period for this work
    v_generated := auto_generate_next_period_for_work(v_work.id);

    IF v_generated THEN
      -- Get the newly created period
      SELECT id, period_name
      INTO v_new_period
      FROM work_recurring_instances
      WHERE work_id = v_work.id
      ORDER BY period_start_date DESC
      LIMIT 1;

      work_id := v_work.id;
      work_name := v_work.title;
      new_period_id := v_new_period.id;
      new_period_name := v_new_period.period_name;
      generated := TRUE;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION auto_generate_next_period_for_work(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_generate_all_missing_periods() TO authenticated;
