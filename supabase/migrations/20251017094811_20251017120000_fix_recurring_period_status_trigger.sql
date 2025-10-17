/*
  # Fix Recurring Period Status Update Trigger

  This migration fixes the `check_and_update_period_status` function which was referencing
  a non-existent table `recurring_periods`. The correct table name is `work_recurring_instances`.

  ## Changes
  1. Drops and recreates the `check_and_update_period_status` function with correct table reference
  2. Ensures the trigger properly updates period status when all tasks are completed
  3. Enables auto-invoice generation when period status changes to completed

  ## What It Does
  - When tasks in a period are updated, this function checks if all tasks are completed
  - If all tasks are completed, it marks the period as 'completed'
  - This triggers the auto-invoice generation if auto_bill is enabled
  - If a completed period has tasks that become incomplete, it reverts to 'active'
*/

-- Drop and recreate the function with correct table name
CREATE OR REPLACE FUNCTION public.check_and_update_period_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
    UPDATE work_recurring_instances
    SET 
      status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
    WHERE id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id)
      AND status != 'completed';
  -- If period was completed but now has incomplete tasks, revert to active
  ELSIF total_tasks > completed_tasks THEN
    UPDATE work_recurring_instances
    SET 
      status = 'active',
      completed_at = NULL,
      updated_at = now()
    WHERE id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id)
      AND status = 'completed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
