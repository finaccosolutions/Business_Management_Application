/*
  # Drop Legacy Duplicate Functions by Signature
  
  Removes old function overloads that conflict with new period/task creation system.
*/

-- Drop old calculate_individual_task_period_end_date overloads
DROP FUNCTION IF EXISTS calculate_individual_task_period_end_date(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS calculate_individual_task_period_end_date(text, integer, text, date) CASCADE;

-- Drop old calculate_next_period_dates overloads  
DROP FUNCTION IF EXISTS calculate_next_period_dates(date, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(text, date, date) CASCADE;

-- Drop old generate_task_title_with_period overloads
DROP FUNCTION IF EXISTS generate_task_title_with_period(uuid, date, date, text, integer) CASCADE;
DROP FUNCTION IF EXISTS generate_task_title_with_period(text, text, date, text, integer, text) CASCADE;

-- Also drop other legacy functions that are not used by new system
DROP FUNCTION IF EXISTS calculate_quarter_for_date(date) CASCADE;
DROP FUNCTION IF EXISTS create_period_for_non_recurring_work(uuid) CASCADE;
DROP FUNCTION IF EXISTS copy_service_tasks_to_existing_work(uuid, uuid) CASCADE;
