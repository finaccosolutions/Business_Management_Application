/*
  # Fix Recurring Work Status and Completion Date Display

  ## Problem
  1. When all tasks in recurring periods are completed, the main work status stays "pending"
  2. Work completion_date is not set when all periods are completed
  3. Customer tiles show "Pending Work 1" even though all tasks are completed
  4. Work overview tab doesn't display completion_date

  ## Solution
  1. Create trigger to auto-update work status when recurring period status changes
  2. Set completion_date when work becomes completed
  3. Revert status if periods become incomplete again
  4. Handle both recurring and non-recurring works properly

  ## Changes
  - Adds trigger on work_recurring_instances to update parent work status
  - Automatically sets work status to 'completed' when ALL periods are completed
  - Sets completion_date timestamp when work is marked completed
  - Reverts to 'in_progress' if any period becomes incomplete
  - Only affects recurring works (non-recurring works already have their own trigger)

  ## Security
  - Trigger runs with security definer to ensure proper permissions
*/

-- Function to update parent work status based on recurring periods
CREATE OR REPLACE FUNCTION update_work_status_from_periods()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_work RECORD;
  v_total_periods INTEGER;
  v_completed_periods INTEGER;
  v_periods_with_all_tasks INTEGER;
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = COALESCE(NEW.work_id, OLD.work_id);

  -- Skip if work doesn't exist or is not recurring
  IF v_work IS NULL OR v_work.is_recurring = false THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count total periods, completed periods, and periods with all tasks done
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE all_tasks_completed = true)
  INTO v_total_periods, v_completed_periods, v_periods_with_all_tasks
  FROM work_recurring_instances
  WHERE work_id = v_work.id;

  -- If ALL periods have all tasks completed, mark work as completed
  IF v_total_periods > 0 AND v_periods_with_all_tasks = v_total_periods THEN
    -- Only update if work is not already completed
    IF v_work.status != 'completed' THEN
      UPDATE works
      SET
        status = 'completed',
        completion_date = NOW(),
        updated_at = NOW()
      WHERE id = v_work.id;

      RAISE NOTICE 'Recurring Work % marked as completed - all % periods have all tasks completed', v_work.id, v_total_periods;
    END IF;
  ELSE
    -- If not all periods are completed but work was marked completed, revert to in_progress
    IF v_work.status = 'completed' THEN
      UPDATE works
      SET
        status = 'in_progress',
        completion_date = NULL,
        updated_at = NOW()
      WHERE id = v_work.id;

      RAISE NOTICE 'Recurring Work % status reverted to in_progress - % of % periods with all tasks completed', v_work.id, v_periods_with_all_tasks, v_total_periods;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_work_status_from_periods_trigger ON work_recurring_instances;

-- Create trigger for INSERT, UPDATE, and DELETE on work_recurring_instances
CREATE TRIGGER update_work_status_from_periods_trigger
  AFTER INSERT OR UPDATE OF status, all_tasks_completed OR DELETE
  ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_work_status_from_periods();

-- Add helpful comments
COMMENT ON FUNCTION update_work_status_from_periods IS
  'Automatically updates recurring work status to completed when all periods have all tasks done, and reverts to in_progress if any period becomes incomplete. Only affects recurring works.';

COMMENT ON TRIGGER update_work_status_from_periods_trigger ON work_recurring_instances IS
  'Triggers work status update when recurring periods are created, updated, or deleted. Ensures recurring work status stays in sync with period completion.';

-- Fix existing works that should be marked as completed
DO $$
DECLARE
  v_work RECORD;
  v_total_periods INTEGER;
  v_periods_with_all_tasks INTEGER;
BEGIN
  FOR v_work IN
    SELECT DISTINCT w.id, w.work_number, w.status
    FROM works w
    WHERE w.is_recurring = true
      AND w.status != 'completed'
  LOOP
    -- Count periods for this work
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE all_tasks_completed = true)
    INTO v_total_periods, v_periods_with_all_tasks
    FROM work_recurring_instances
    WHERE work_id = v_work.id;

    -- If all periods have all tasks completed, mark work as completed
    IF v_total_periods > 0 AND v_periods_with_all_tasks = v_total_periods THEN
      UPDATE works
      SET
        status = 'completed',
        completion_date = NOW(),
        updated_at = NOW()
      WHERE id = v_work.id;

      RAISE NOTICE 'Fixed work % - marked as completed (% periods all completed)', v_work.work_number, v_total_periods;
    END IF;
  END LOOP;
END $$;
