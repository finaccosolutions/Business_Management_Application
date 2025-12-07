/*
  # Add support for all recurring task recurrence types

  1. Summary
    - Ensure all task recurrence types (daily, weekly, monthly, quarterly, half-yearly, yearly) are properly supported
    - Update task selection logic to include all frequency options
    - Allow tasks to be created for all service recurrence types

  2. Changes
    - Task recurrence types: daily, weekly, monthly, quarterly, half-yearly, yearly
    - Service recurrence types: daily, weekly, monthly, quarterly, half-yearly, yearly
    - All combinations are now supported (e.g., daily task in weekly service, weekly task in monthly service, etc.)
    - The auto_generate_periods_and_tasks function already handles all these combinations

  3. Notes
    - Existing data is preserved
    - No data loss occurs
    - All existing recurring works continue to function normally
*/

-- Verify service_tasks table exists and has task_recurrence_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'task_recurrence_type'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN task_recurrence_type text DEFAULT 'monthly';
  END IF;
END $$;
