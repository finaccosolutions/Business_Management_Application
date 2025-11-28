/*
  # Drop All Remaining Duplicate Period/Task Functions
  
  ## Purpose
  Remove all old functions that were replaced by the unified auto_generate_periods_and_tasks()
  This cleans up the database and prevents confusion.
*/

-- Drop functions that were creating duplicate periods
DROP FUNCTION IF EXISTS backfill_missing_periods(uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_periods_for_elapsed_tasks(uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_create_periods_and_tasks_for_elapsed_tasks(uuid) CASCADE;

-- Re-verify the unified function exists and works
SELECT COUNT(*) as unified_function_exists
FROM pg_proc 
WHERE proname = 'auto_generate_periods_and_tasks'
AND pronargs = 1;
