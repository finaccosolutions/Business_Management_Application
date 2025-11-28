/*
  # Fix Broken Trigger Functions
  
  ## Issue
  Functions `check_and_create_next_period_on_task_period()` and related triggers
  are referencing non-existent columns and tables that don't match the current schema.
  
  ## Solution
  1. Drop the broken function `check_and_create_next_period_on_task_period()`
  2. Drop the trigger `trigger_check_task_period_elapsed` which calls it
  3. These functions are incompatible with the task-based period creation logic
     implemented in migration 20251128120043
*/

-- Drop the broken trigger first
DROP TRIGGER IF EXISTS trigger_check_task_period_elapsed ON recurring_period_tasks;

-- Drop the broken function
DROP FUNCTION IF EXISTS check_and_create_next_period_on_task_period();
