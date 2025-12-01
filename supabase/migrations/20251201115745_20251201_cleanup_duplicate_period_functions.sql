/*
  # Clean Up Duplicate Period Functions
  
  Remove old redundant functions that were replaced by v2 versions.
*/

DROP FUNCTION IF EXISTS should_create_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_based_on_tasks(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_task_driven(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_for_date(UUID, DATE, DATE, DATE) CASCADE;
