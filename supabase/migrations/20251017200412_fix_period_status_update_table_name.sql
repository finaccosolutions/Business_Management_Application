/*
  # Fix Period Status Update - Correct Table Name

  ## Issue
  The trigger function `check_and_update_period_status()` is updating the wrong table.
  It references `recurring_periods` but the actual table is `work_recurring_instances`.
  This causes the period status to never update when all tasks are completed, which 
  prevents the auto-invoice from being created.

  ## Changes
  - Update `check_and_update_period_status()` function to use correct table name `work_recurring_instances`
  - Update all references from `recurring_periods` to `work_recurring_instances`
  
  ## Fixed Workflow
  1. When a task status is updated to 'completed'
  2. The trigger checks if all tasks in that period are completed
  3. If yes, it updates the `work_recurring_instances` status to 'completed'
  4. This triggers the auto-invoice creation (existing trigger)
*/

-- Drop and recreate the function with correct table name
CREATE OR REPLACE FUNCTION check_and_update_period_status()
RETURNS TRIGGER AS $$
DECLARE
  total_tasks INT;
  completed_tasks INT;
  v_period_id uuid;
BEGIN
  -- Get the period ID from NEW or OLD record
  v_period_id := COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);
  
  -- Return if no period ID
  IF v_period_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count total tasks and completed tasks for this period
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_tasks, completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  -- If all tasks are completed, update period status to completed
  IF total_tasks > 0 AND total_tasks = completed_tasks THEN
    UPDATE work_recurring_instances
    SET 
      status = 'completed',
      all_tasks_completed = true,
      completed_tasks = total_tasks,
      completed_at = now(),
      updated_at = now()
    WHERE id = v_period_id
      AND status != 'completed';
      
  -- If period was completed but now has incomplete tasks, revert to active
  ELSIF total_tasks > completed_tasks THEN
    UPDATE work_recurring_instances
    SET 
      status = 'active',
      all_tasks_completed = false,
      completed_tasks = completed_tasks,
      completed_at = NULL,
      updated_at = now()
    WHERE id = v_period_id
      AND status = 'completed';
      
  -- Update task counts even if status doesn't change
  ELSE
    UPDATE work_recurring_instances
    SET 
      completed_tasks = completed_tasks,
      total_tasks = total_tasks,
      updated_at = now()
    WHERE id = v_period_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS trigger_update_period_status_on_task_change ON recurring_period_tasks;

CREATE TRIGGER trigger_update_period_status_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_and_update_period_status();
