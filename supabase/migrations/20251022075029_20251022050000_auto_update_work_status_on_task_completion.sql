/*
  # Auto-Update Work Status When All Tasks Are Completed

  1. Changes
    - Creates trigger to automatically update work status to 'completed' when all tasks are completed
    - Sets completion_date timestamp when work is marked completed
    - Only updates non-recurring works (recurring works use period-based completion)
    - Automatically changes status back to 'in_progress' if a completed task is marked incomplete

  2. Security
    - Trigger runs with security definer to ensure proper permissions
*/

-- Function to check if all work tasks are completed and update work status
CREATE OR REPLACE FUNCTION auto_update_work_status_on_task_completion()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_work RECORD;
  v_total_tasks INTEGER;
  v_completed_tasks INTEGER;
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = COALESCE(NEW.work_id, OLD.work_id);

  -- Skip if work doesn't exist or is recurring (recurring works have their own period-based completion)
  IF v_work IS NULL OR v_work.is_recurring = true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count total and completed tasks for this work
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_tasks, v_completed_tasks
  FROM work_tasks
  WHERE work_id = v_work.id;

  -- If all tasks are completed, mark work as completed
  IF v_total_tasks > 0 AND v_completed_tasks = v_total_tasks THEN
    -- Only update if work is not already completed
    IF v_work.status != 'completed' THEN
      UPDATE works
      SET
        status = 'completed',
        completion_date = NOW(),
        updated_at = NOW()
      WHERE id = v_work.id;

      RAISE NOTICE 'Work % automatically marked as completed - all % tasks completed', v_work.id, v_total_tasks;
    END IF;
  ELSE
    -- If not all tasks are completed but work was marked completed, revert to in_progress
    IF v_work.status = 'completed' THEN
      UPDATE works
      SET
        status = 'in_progress',
        completion_date = NULL,
        updated_at = NOW()
      WHERE id = v_work.id;

      RAISE NOTICE 'Work % status reverted to in_progress - % of % tasks completed', v_work.id, v_completed_tasks, v_total_tasks;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_work_status_on_task_change ON work_tasks;

-- Create trigger for INSERT, UPDATE, and DELETE on work_tasks
CREATE TRIGGER update_work_status_on_task_change
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON work_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_work_status_on_task_completion();

-- Add helpful comment
COMMENT ON FUNCTION auto_update_work_status_on_task_completion IS
  'Automatically updates work status to completed when all tasks are done, and reverts to in_progress if tasks become incomplete. Only affects non-recurring works.';

COMMENT ON TRIGGER update_work_status_on_task_change ON work_tasks IS
  'Triggers work status update when tasks are created, completed, or deleted. Ensures work status stays in sync with task completion.';
