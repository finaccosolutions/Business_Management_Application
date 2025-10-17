/*
  # Fix Ambiguous Column Reference in Period Status Trigger

  ## Issue
  PostgreSQL error 42702: column reference "completed_tasks" is ambiguous
  
  The trigger function has a local variable named `completed_tasks` that conflicts 
  with the column name `completed_tasks` in the work_recurring_instances table.
  When the UPDATE statement references `completed_tasks`, PostgreSQL doesn't know 
  if it refers to the variable or the column.

  ## Solution
  Rename local variables to use `v_` prefix to avoid naming conflicts with table columns.
  
  ## Changes
  - Rename `completed_tasks` variable to `v_completed_tasks`
  - Rename `total_tasks` variable to `v_total_tasks`
  - Update all references to use the new variable names
*/

-- Drop and recreate the function with properly named variables
CREATE OR REPLACE FUNCTION check_and_update_period_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total_tasks INT;
  v_completed_tasks INT;
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
  INTO v_total_tasks, v_completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  -- If all tasks are completed, update period status to completed
  IF v_total_tasks > 0 AND v_total_tasks = v_completed_tasks THEN
    UPDATE work_recurring_instances
    SET 
      status = 'completed',
      all_tasks_completed = true,
      completed_tasks = v_completed_tasks,
      total_tasks = v_total_tasks,
      completed_at = now(),
      updated_at = now()
    WHERE id = v_period_id
      AND status != 'completed';
      
  -- If period was completed but now has incomplete tasks, revert to active
  ELSIF v_total_tasks > v_completed_tasks THEN
    UPDATE work_recurring_instances
    SET 
      status = 'active',
      all_tasks_completed = false,
      completed_tasks = v_completed_tasks,
      total_tasks = v_total_tasks,
      completed_at = NULL,
      updated_at = now()
    WHERE id = v_period_id
      AND status = 'completed';
      
  -- Update task counts even if status doesn't change
  ELSE
    UPDATE work_recurring_instances
    SET 
      completed_tasks = v_completed_tasks,
      total_tasks = v_total_tasks,
      updated_at = now()
    WHERE id = v_period_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger is already in place, no need to recreate
