/*
  # Fix Statement Timeout on Recurring Work Insert

  ## Problem
  Creating a recurring work times out with error code 57014 (canceling statement due to statement timeout).
  The issue occurs because the INSERT trigger calls `auto_generate_periods_and_tasks()` synchronously,
  which executes a LOOP that can iterate many times, calling expensive functions each iteration.
  This happens synchronously during the INSERT, blocking the transaction.

  ## Solution
  1. Simplify the trigger to ONLY create the first period synchronously
  2. The first period has minimal data and completes quickly
  3. Future periods are generated on-demand when viewing work details
  4. When a period completes, the next one is generated asynchronously

  ## Changes
  1. New function `create_first_recurring_period_only()` - Creates ONLY the first period with its tasks
  2. Optimized trigger to call the simplified function
  3. Keep `auto_generate_periods_and_tasks()` for on-demand/background usage
  4. Removed the expensive LOOP from the trigger execution path
*/

-- Create optimized function to create ONLY the first period (no loop)
CREATE OR REPLACE FUNCTION create_first_recurring_period_only(p_work_id uuid)
RETURNS uuid AS $$
DECLARE
  v_work RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_new_period_id UUID;
  v_task RECORD;
  v_task_count INTEGER := 0;
BEGIN
  
  -- Get work details
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if first period already exists
  IF EXISTS (
    SELECT 1 FROM work_recurring_instances WHERE work_id = p_work_id LIMIT 1
  ) THEN
    RETURN NULL;
  END IF;
  
  -- Calculate first period dates
  SELECT first_start_date, first_end_date, first_period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_first_period_for_work(p_work_id);
  
  IF v_next_start IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Create the first period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    billing_amount,
    status,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    p_work_id,
    v_next_name,
    v_next_start,
    v_next_end,
    v_work.billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;
  
  -- Add tasks for first period
  v_task_count := 0;
  IF v_work.service_id IS NOT NULL THEN
    FOR v_task IN
      SELECT * FROM get_tasks_to_add_for_period(
        v_work.service_id,
        v_next_end,
        v_next_start - 1
      )
    LOOP
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,
        description,
        priority,
        estimated_hours,
        sort_order,
        due_date,
        status,
        assigned_to
      ) VALUES (
        v_new_period_id,
        v_task.task_id,
        v_task.task_title,
        v_task.task_description,
        v_task.task_priority,
        v_task.task_estimated_hours,
        v_task.task_sort_order,
        v_task.task_due_date,
        'pending',
        COALESCE(v_task.task_assigned_to, v_work.assigned_to)
      );
      
      v_task_count := v_task_count + 1;
    END LOOP;
  END IF;
  
  -- Update period with task count
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_new_period_id;
  
  -- Copy documents to period
  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
  
  RETURN v_new_period_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the work insert trigger to use simplified function
CREATE OR REPLACE FUNCTION trigger_auto_generate_periods_for_recurring_work()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process for recurring works with service_id and start_date
  IF NEW.is_recurring = true 
  AND NEW.service_id IS NOT NULL 
  AND NEW.start_date IS NOT NULL THEN
    -- Create ONLY the first period (no loop, fast operation)
    PERFORM create_first_recurring_period_only(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_auto_generate_periods_for_recurring_work ON works;

CREATE TRIGGER trigger_auto_generate_periods_for_recurring_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_periods_for_recurring_work();
