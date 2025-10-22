/*
  # Add Due Date to Non-Recurring Work Tasks

  ## Changes
  1. Add due_date column to work_tasks table
  2. Work tasks are for non-recurring works and should have fixed due dates
  3. This is different from recurring period tasks which use offset calculations

  ## Details
  - work_tasks: Used for non-recurring works with fixed due dates
  - recurring_period_tasks: Used for recurring works with dynamic dates
*/

-- Add due_date column to work_tasks if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_tasks' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE work_tasks ADD COLUMN due_date DATE;
  END IF;
END $$;

COMMENT ON COLUMN work_tasks.due_date IS
  'Fixed due date for this task. Used for non-recurring works where tasks have specific due dates.';
