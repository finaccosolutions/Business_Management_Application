/*
  # Drop and Recreate Task Generation Functions

  This migration drops existing functions to prepare for the new implementation 
  that fixes due dates and task naming for quarterly recurring works with monthly tasks.
*/

DROP FUNCTION IF EXISTS get_tasks_to_add_for_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date_for_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_monthly_task_months_in_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_month_name(integer) CASCADE;
