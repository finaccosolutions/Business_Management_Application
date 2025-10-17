/*
  # Auto-Update Period Status When All Tasks Completed

  ## Overview
  This migration creates a trigger that automatically updates the recurring period status
  to 'completed' when all tasks in that period are marked as completed.

  ## Changes
  
  ### Functions
  - `check_and_update_period_status()` - Checks if all tasks in a period are completed
    and updates the period status accordingly
  
  ### Triggers
  - `trigger_update_period_status_on_task_change` - Fires after INSERT/UPDATE on recurring_period_tasks
    to check and update the parent period status

  ## Workflow
  1. When a task status is updated to 'completed'
  2. The trigger checks if all tasks in that period are completed
  3. If yes, it automatically updates the period status to 'completed'
  4. This then triggers the auto-invoice creation (from previous migration)
*/

-- Function to check and update period status when all tasks are completed
CREATE OR REPLACE FUNCTION check_and_update_period_status()
RETURNS TRIGGER AS $$
DECLARE
  total_tasks INT;
  completed_tasks INT;
BEGIN
  -- Count total tasks and completed tasks for this period
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_tasks, completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);

  -- If all tasks are completed, update period status to completed
  IF total_tasks > 0 AND total_tasks = completed_tasks THEN
    UPDATE recurring_periods
    SET 
      status = 'completed',
      updated_at = now()
    WHERE id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id)
      AND status != 'completed';
  -- If period was completed but now has incomplete tasks, revert to active
  ELSIF total_tasks > completed_tasks THEN
    UPDATE recurring_periods
    SET 
      status = 'active',
      updated_at = now()
    WHERE id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id)
      AND status = 'completed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_period_status_on_task_change ON recurring_period_tasks;

-- Create trigger on recurring_period_tasks for INSERT, UPDATE, DELETE
CREATE TRIGGER trigger_update_period_status_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_and_update_period_status();
