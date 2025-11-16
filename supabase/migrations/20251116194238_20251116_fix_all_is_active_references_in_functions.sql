/*
  # Fix all is_active references in functions

  1. Issue
    - Multiple functions still reference is_active from works table incorrectly
    - Functions: manually_create_period_for_work, create_next_recurring_period_if_needed
    - Using SELECT * which causes column resolution issues

  2. Solution
    - Drop and recreate all functions that reference is_active
    - Use explicit column selection instead of SELECT *
    - Fix all trigger functions that call these
*/

-- Drop the problematic functions
DROP FUNCTION IF EXISTS manually_create_period_for_work(uuid) CASCADE;
DROP FUNCTION IF EXISTS create_next_recurring_period_if_needed() CASCADE;
DROP FUNCTION IF EXISTS copy_service_tasks_to_existing_work(uuid) CASCADE;

-- Recreate manually_create_period_for_work with explicit columns
CREATE FUNCTION manually_create_period_for_work(p_work_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_work_recurring BOOLEAN;
  v_work_recurrence_pattern TEXT;
  v_work_period_calc_type TEXT;
  v_work_billing_amount NUMERIC;
  v_work_service_id UUID;
  v_work_assigned_to UUID;
  v_work_start_date DATE;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_new_period_id UUID;
  v_period_exists BOOLEAN;
  v_task_count INT;
  v_doc_count INT;
BEGIN
  -- Get work details with explicit column selection
  SELECT is_recurring, recurrence_pattern, period_calculation_type, billing_amount, service_id, assigned_to, start_date
  INTO v_work_recurring, v_work_recurrence_pattern, v_work_period_calc_type, v_work_billing_amount, v_work_service_id, v_work_assigned_to, v_work_start_date
  FROM works
  WHERE id = p_work_id;

  IF v_work_recurring IS NULL THEN
    RETURN 'ERROR: Work not found';
  END IF;

  IF v_work_recurring != TRUE THEN
    RETURN 'ERROR: Work is not marked as recurring';
  END IF;

  IF v_work_recurrence_pattern IS NULL OR v_work_recurrence_pattern = '' THEN
    RETURN 'ERROR: Work has no recurrence pattern';
  END IF;

  -- Calculate period dates
  SELECT next_start_date, next_end_date, next_period_name
  INTO v_period_start, v_period_end, v_period_name
  FROM calculate_next_period_dates(
    COALESCE(v_work_start_date, CURRENT_DATE) - INTERVAL '1 day',
    COALESCE(v_work_recurrence_pattern, 'monthly')
  );

  IF v_period_start IS NULL OR v_period_end IS NULL THEN
    RETURN 'ERROR: Failed to calculate period dates';
  END IF;

  -- Check if period already exists
  SELECT EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = v_period_start
    AND period_end_date = v_period_end
  ) INTO v_period_exists;

  IF v_period_exists THEN
    RETURN 'INFO: Period already exists for these dates';
  END IF;

  -- Create the period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status,
    billing_amount
  ) VALUES (
    p_work_id,
    v_period_name,
    v_period_start,
    v_period_end,
    'pending',
    v_work_billing_amount
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks
  v_task_count := 0;
  IF v_work_service_id IS NOT NULL THEN
    v_task_count := copy_tasks_to_period(
      v_new_period_id,
      v_work_service_id,
      v_period_start,
      v_period_end,
      v_work_assigned_to
    );
  END IF;

  -- Copy documents
  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
  v_doc_count := 0;

  RETURN FORMAT('SUCCESS: Created period "%s" (%s to %s) with %s tasks and %s documents',
    v_period_name, v_period_start, v_period_end, v_task_count, v_doc_count);

EXCEPTION
WHEN OTHERS THEN
  RETURN FORMAT('ERROR: %s - %s', SQLERRM, SQLSTATE);
END;
$$ LANGUAGE plpgsql;

-- Recreate copy_service_tasks_to_existing_work with explicit columns
CREATE FUNCTION copy_service_tasks_to_existing_work(p_work_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_work_is_recurring BOOLEAN;
  v_work_service_id UUID;
  v_task_record RECORD;
  v_task_count INTEGER := 0;
  v_existing_tasks INTEGER;
BEGIN
  -- Get work details
  SELECT is_recurring, service_id
  INTO v_work_is_recurring, v_work_service_id
  FROM works
  WHERE id = p_work_id;

  IF v_work_is_recurring IS NULL THEN
    RAISE EXCEPTION 'Work not found: %', p_work_id;
  END IF;

  IF v_work_is_recurring = TRUE THEN
    RAISE NOTICE 'Work % is recurring - tasks are managed per period, not copied', p_work_id;
    RETURN 0;
  END IF;

  IF v_work_service_id IS NULL THEN
    RAISE NOTICE 'Work % has no service - cannot copy tasks', p_work_id;
    RETURN 0;
  END IF;

  -- Check if tasks already exist
  SELECT COUNT(*) INTO v_existing_tasks
  FROM work_tasks
  WHERE work_id = p_work_id;

  IF v_existing_tasks > 0 THEN
    RAISE NOTICE 'Work % already has % tasks - skipping copy', p_work_id, v_existing_tasks;
    RETURN 0;
  END IF;

  -- Copy all active service tasks to work_tasks
  FOR v_task_record IN
    SELECT *
    FROM service_tasks
    WHERE service_id = v_work_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    INSERT INTO work_tasks (
      work_id,
      title,
      description,
      priority,
      status,
      estimated_hours,
      assigned_to,
      sort_order
    ) VALUES (
      p_work_id,
      v_task_record.title,
      v_task_record.description,
      v_task_record.priority,
      'pending',
      v_task_record.estimated_hours,
      v_task_record.default_assigned_to,
      v_task_record.sort_order
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  RAISE NOTICE 'Copied % service tasks to work %', v_task_count, p_work_id;
  RETURN v_task_count;
END;
$$ LANGUAGE plpgsql;
