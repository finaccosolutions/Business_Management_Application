/*
  # Cleanup and Backfill - Reset All Periods and Tasks
  
  ## Actions:
  1. Remove all existing periods and tasks (they were created incorrectly)
  2. Regenerate all periods and tasks with correct logic
*/

-- Clear existing incorrect data
DELETE FROM recurring_period_tasks 
WHERE work_recurring_instance_id IN (
  SELECT id FROM work_recurring_instances
  WHERE work_id IN (SELECT id FROM works WHERE is_recurring = TRUE)
);

DELETE FROM work_recurring_instances
WHERE work_id IN (SELECT id FROM works WHERE is_recurring = TRUE);

-- Regenerate all recurring works with correct logic
DO $$
DECLARE
  v_work RECORD;
BEGIN
  FOR v_work IN
    SELECT id, start_date, recurrence_pattern
    FROM works
    WHERE is_recurring = TRUE
    ORDER BY start_date
  LOOP
    PERFORM backfill_recurring_work_at_creation(
      v_work.id,
      v_work.start_date,
      COALESCE(v_work.recurrence_pattern, 'monthly'),
      CURRENT_DATE
    );
  END LOOP;
END $$;
