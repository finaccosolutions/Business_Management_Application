/*
  # Fix Duplicate Period Creation and Improve System

  ## Problem
  When creating a recurring work with start_date = 2025-10-09, TWO periods were being created:
  1. October 2025 (2025-09-30 to 2025-10-30) - WRONG (previous month)
  2. October 2025 (2025-10-09 to 2025-11-08) - CORRECT (starts from work start date)

  ## Root Cause
  Two different triggers were firing:
  1. `create_initial_recurring_period` - creates PREVIOUS period (wrong)
  2. `handle_new_recurring_work_initial_period` - creates CURRENT period (correct)

  ## Solution
  - DROP the incorrect trigger and function (create_initial_recurring_period)
  - Keep ONLY `handle_new_recurring_work_initial_period` which creates the correct period
  - Ensure periods start from work.start_date, not previous month

  ## Changes Made
  1. Remove duplicate period creation trigger
  2. Clean up orphaned functions that create incorrect periods
*/

-- Drop the incorrect trigger
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;

-- Drop the incorrect function that creates previous month periods
DROP FUNCTION IF EXISTS create_initial_recurring_period();

-- Drop any other conflicting period creation functions
DROP FUNCTION IF EXISTS create_initial_recurring_periods();
DROP FUNCTION IF EXISTS initialize_recurring_periods_for_work();
DROP FUNCTION IF EXISTS create_recurring_instances_for_work();

-- Verify we have only ONE trigger creating periods on works table
-- It should be: trigger_handle_new_recurring_work_initial_period
-- This trigger calls: handle_new_recurring_work_initial_period()
-- Which correctly creates periods starting from work.start_date
