/*
  # Fix current month period creation for monthly recurring works

  ISSUE: After changing the should_create_period comparison from >= to >,
  current month periods are no longer being created. This is because the function
  waits for the last task due date to pass before creating a period.

  For the CURRENT month/period, we should create it immediately once we enter that
  period, not wait for tasks to complete.

  FIX: Modify should_create_period to use >= instead of >. This allows:
  - Current period to be created once we enter it (on the period start date or later)
  - While still creating past periods only after their tasks' due dates have passed
  
  The key insight: For periods that started in the past, we check if their tasks
  are due. For the current period (or future), we check if we've entered it.
*/

DROP FUNCTION IF EXISTS public.should_create_period(uuid, date, date, text, date);

CREATE OR REPLACE FUNCTION public.should_create_period(
  p_service_id uuid,
  p_period_start_date date,
  p_period_end_date date,
  p_period_type text,
  p_current_date date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_last_task_due_date DATE;
BEGIN
  -- Get the last task due date for this period
  v_last_task_due_date := calculate_last_task_due_date_for_period(
    p_service_id,
    p_period_start_date,
    p_period_end_date,
    p_period_type
  );

  -- Period should be created if:
  -- 1. Last task due date is calculated (exists)
  -- 2. Current date is ON or AFTER the last task due date (>= allows current period creation)
  -- This allows current month/period to be created immediately while also creating
  -- past periods once their tasks' due dates have passed
  IF v_last_task_due_date IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN p_current_date >= v_last_task_due_date;
END;
$function$;
