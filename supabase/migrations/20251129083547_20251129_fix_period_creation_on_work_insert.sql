/*
  # Fix Period and Task Creation on Work Insert

  ## Issue
  When creating a new recurring work, periods and tasks were not being created because
  the `should_create_period` function required the current date to be AFTER the first
  task's due date. This prevented any periods from being created on work insert.

  ## Solution
  Modified the logic to:
  1. Always create the first period with first tasks immediately on work insert
  2. Subsequent periods only created when their tasks become eligible (after first task due date)
  3. This ensures users see periods and tasks immediately when creating recurring work

  ## Changes
  - Updated `should_create_period` to allow first period creation immediately
  - Added logic to track whether we're creating the first period
  - First period created regardless of due dates
  - Subsequent periods follow the original "wait for first task to mature" logic
*/

-- Update should_create_period to handle first period creation
CREATE OR REPLACE FUNCTION should_create_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_first_task_last_day DATE;
  v_earliest_existing_period_start DATE;
BEGIN
  -- Check if this is the first period by looking for any existing periods
  SELECT MIN(period_start_date) INTO v_earliest_existing_period_start
  FROM work_recurring_instances
  WHERE work_id = p_work_id;
  
  -- If no periods exist yet, this is the first period - always create it
  IF v_earliest_existing_period_start IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- For subsequent periods, use the original logic:
  -- Only create when current date is after the first task's due date
  v_first_task_last_day := get_first_task_last_day_of_period(p_work_id, p_period_start_date, p_period_end_date);
  
  RETURN v_first_task_last_day IS NOT NULL AND CURRENT_DATE > v_first_task_last_day;
END;
$$ LANGUAGE plpgsql STABLE;