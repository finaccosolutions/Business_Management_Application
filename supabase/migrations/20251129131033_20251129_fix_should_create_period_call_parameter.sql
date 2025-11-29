/*
  # Fix should_create_period function call in create_period_with_all_applicable_tasks

  ISSUE: The create_period_with_all_applicable_tasks function was calling should_create_period
  with v_service_id as the first parameter, but should_create_period expects p_work_id.

  This caused the period creation check to fail because it was comparing the service_id
  against work_recurring_instances.work_id, which never matched.

  FIX: Change the call to pass p_work_id instead of v_service_id.

  This ensures:
  - Periods are created immediately for the first period when a work is created
  - The function correctly checks if any periods exist for the specific work
*/

DROP FUNCTION IF EXISTS public.create_period_with_all_applicable_tasks(uuid, date, date, text, date);

CREATE OR REPLACE FUNCTION public.create_period_with_all_applicable_tasks(
  p_work_id uuid, 
  p_period_start date, 
  p_period_end date, 
  p_period_type text, 
  p_current_date date
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
BEGIN
  -- Get work details
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if period should be created (last task due date elapsed)
  -- Pass p_work_id instead of v_service_id to properly check existing periods
  IF NOT should_create_period(p_work_id, p_period_start, p_period_end) THEN
    RETURN FALSE;
  END IF;

  -- Check if this period already exists
  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  -- Create period if it doesn't exist
  IF v_work_recurring_instance_id IS NULL THEN
    v_period_name := generate_period_name(p_period_start, p_period_end, p_period_type);

    INSERT INTO work_recurring_instances (
      work_id,
      period_start_date,
      period_end_date,
      instance_date,
      period_name,
      status,
      total_tasks,
      completed_tasks,
      all_tasks_completed,
      updated_at
    )
    VALUES (
      p_work_id,
      p_period_start,
      p_period_end,
      p_current_date,
      v_period_name,
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_work_recurring_instance_id;
  END IF;

  -- Add all applicable tasks using existing helper
  PERFORM generate_period_tasks_for_instance(v_work_recurring_instance_id, v_service_id, p_period_start, p_period_end, p_period_type);

  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;

  RETURN TRUE;
END;
$function$;
