-- Remove the trigger that auto-generates periods immediately on Work Creation.
-- This trigger fires before 'work_task_configs' are inserted, causing tasks to be generated 
-- with default service settings instead of the specific work configuration.
-- The frontend explicitly calls 'auto_generate_periods_and_tasks' after inserting configs,
-- which creates a race condition and duplicates (one 'default' set from trigger, one 'correct' set from RPC).

-- 1. Drop the Trigger
DROP TRIGGER IF EXISTS on_work_created_generate_periods ON works;

-- 2. Drop the Trigger Function
DROP FUNCTION IF EXISTS public.trigger_auto_generate_periods_and_tasks();
