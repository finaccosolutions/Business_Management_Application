/*
  # Fix period eligibility comparison in should_create_period

  ISSUE: The comparison was using >= instead of >
  This means periods were being created on the SAME DAY as the last task due date,
  when they should only be created AFTER that date has passed.

  EXAMPLE:
  - October period has last task due date of Oct 20
  - With current_date = Oct 20, period should NOT be created yet (today == due_date)
  - With current_date = Oct 21, period SHOULD be created (today > due_date)
  - With current_date = Nov 10 (if tasks due 10 days after month end), period should be created

  This ensures tasks have time to be completed on their due date before the next period is created.
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

  -- Period should be created ONLY if:
  -- 1. Last task due date is calculated (exists)
  -- 2. Current date is STRICTLY AFTER the last task due date (not on it)
  -- This gives time for tasks to be completed on their due date
  IF v_last_task_due_date IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN p_current_date > v_last_task_due_date;
END;
$function$;
