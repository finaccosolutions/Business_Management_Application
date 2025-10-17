/*
  # Fix Duplicate Period Status Update Triggers
  
  This migration removes duplicate and conflicting triggers that were causing console errors
  when completing tasks in recurring periods.
  
  ## Problem
  Multiple triggers were firing on task updates, all trying to update the period status:
  - trigger_check_period_completion
  - trigger_update_period_status_on_task_change  
  - trigger_update_period_task_completion (AFTER)
  - trigger_update_task_completion (BEFORE)
  
  This caused race conditions and errors in the console.
  
  ## Solution
  1. Drop all duplicate triggers
  2. Keep a single, efficient trigger that:
     - Updates task completion timestamp when status changes to 'completed'
     - Updates period task counters and status
     - Triggers auto-invoice generation when period becomes completed
  
  ## Changes
  - Drops 4 conflicting triggers
  - Creates single unified trigger with proper logic
  - Ensures clean status updates without errors
*/

-- Drop all existing conflicting triggers
DROP TRIGGER IF EXISTS trigger_check_period_completion ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_update_period_status_on_task_change ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_update_period_task_completion ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_update_task_completion ON recurring_period_tasks;

-- Drop old functions
DROP FUNCTION IF EXISTS check_period_tasks_completion();
DROP FUNCTION IF EXISTS update_period_task_completion();

-- Create a single, unified function to handle task updates
CREATE OR REPLACE FUNCTION public.handle_period_task_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_total_tasks INTEGER;
  v_completed_tasks INTEGER;
  v_all_completed BOOLEAN;
  v_period_id uuid;
BEGIN
  -- Determine the period ID
  v_period_id := COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);
  
  -- If status changed to completed, update completion timestamp
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
  END IF;
  
  -- Count total and completed tasks for this period
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_tasks, v_completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;
  
  -- Determine if all tasks are completed
  v_all_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);
  
  -- Update the period instance
  UPDATE work_recurring_instances
  SET
    total_tasks = v_total_tasks,
    completed_tasks = v_completed_tasks,
    all_tasks_completed = v_all_completed,
    status = CASE
      WHEN v_all_completed THEN 'completed'
      WHEN v_completed_tasks > 0 THEN 'in_progress'
      ELSE 'pending'
    END,
    completed_at = CASE
      WHEN v_all_completed AND completed_at IS NULL THEN NOW()
      WHEN NOT v_all_completed THEN NULL
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = v_period_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Create a single trigger to handle all task changes
CREATE TRIGGER trigger_handle_period_task_update
  AFTER INSERT OR UPDATE OR DELETE
  ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION handle_period_task_update();

-- Ensure the auto-invoice trigger is properly set up on work_recurring_instances
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_period_complete ON work_recurring_instances;

CREATE TRIGGER trigger_auto_invoice_on_period_complete
  BEFORE UPDATE
  ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_generate_invoice_for_period();
