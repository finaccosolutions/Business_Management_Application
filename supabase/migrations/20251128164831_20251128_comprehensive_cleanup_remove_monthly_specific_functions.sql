/*
  # Comprehensive Cleanup: Remove Monthly-Specific Functions and Consolidate Task Generation
  
  ## Problem Analysis
  The codebase had created month-specific functions as a workaround:
  - get_monthly_task_months_in_period()
  - generate_monthly_task_due_dates()
  - get_month_name()
  - The 3-parameter get_tasks_to_add_for_period(uuid, date, date)
  
  These are unnecessary complexity. The proper approach uses:
  - A single 4-parameter function: get_tasks_to_add_for_period(uuid, date, date, text)
  - generate_task_title_with_period() to handle ALL period types (monthly, quarterly, yearly)
  - This approach works for ANY period type without special monthly logic
  
  ## Solution
  1. Drop all monthly-specific functions
  2. Keep the clean 4-parameter version (3-param version gets removed by CASCADE)
  3. Verify all triggers and functions work correctly
  
  ## Benefits
  - Removes code duplication and complexity
  - Resolves "function is not unique" error
  - Works correctly for all period types (month, quarter, year)
  - More maintainable codebase
*/

-- Drop all monthly-specific functions (these will cascade to remove 3-param overload)
DROP FUNCTION IF EXISTS get_monthly_task_months_in_period(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS generate_monthly_task_due_dates(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_month_name(integer) CASCADE;

-- Drop the 3-parameter overload of get_tasks_to_add_for_period if it still exists
-- (After CASCADE above, this should be gone, but being explicit)
DROP FUNCTION IF EXISTS get_tasks_to_add_for_period(uuid, date, date) CASCADE;

-- Verify the 4-parameter version still exists and is the only one
-- If it doesn't, we'll create it fresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_tasks_to_add_for_period' 
    AND pronargs = 4
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: 4-parameter get_tasks_to_add_for_period function not found. This indicates a critical system state issue.';
  END IF;
END $$;

-- Verify generate_task_title_with_period exists (it's the core of the new approach)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'generate_task_title_with_period' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: generate_task_title_with_period function not found. This is required for task title generation.';
  END IF;
END $$;

-- Verify calculate_individual_task_period_end_date exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'calculate_individual_task_period_end_date' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    RAISE EXCEPTION 'ERROR: calculate_individual_task_period_end_date function not found.';
  END IF;
END $$;
