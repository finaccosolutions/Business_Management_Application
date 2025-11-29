/*
  # Aggressive Cleanup of Remaining Duplicate Functions
  
  Removes all remaining duplicate function overloads that can cause ambiguity.
*/

-- Drop all versions of duplicate functions
DROP FUNCTION IF EXISTS calculate_individual_task_period_end_date(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(uuid, date, text) CASCADE;
DROP FUNCTION IF EXISTS generate_task_title_with_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS generate_task_title_with_period(uuid, date, date, text) CASCADE;
