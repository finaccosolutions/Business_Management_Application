/*
  # Fix Recurring Work Period and Task Creation - Final
  
  ## Problem
  When creating a recurring work, periods and tasks were not being created automatically.
  The `handle_recurring_work_creation` trigger function called non-existent helper functions.
  
  ## Solution
  Create all missing helper functions and ensure trigger properly creates periods with tasks.
  
  ## Changes
  1. Create `create_period_with_first_tasks` helper function
  2. Create `get_first_task_last_day_of_period` helper function  
  3. Update handle_recurring_work_creation to properly use helpers
  4. Ensure trigger is properly attached
*/

-- ============================================
-- Create helper function to get first task last day
-- ============================================

DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(uuid, date, date) CASCADE;

CREATE FUNCTION get_first_task_last_day_of_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_first_task_due_date DATE;
BEGIN
  -- Get the earliest due date of first tasks for this period
  SELECT MIN(due_date) INTO v_first_task_due_date
  FROM recurring_period_tasks rpt
  WHERE rpt.work_recurring_instance_id IN (
    SELECT id FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = p_period_start_date
    AND period_end_date = p_period_end_date
  )
  AND rpt.sort_order = 0; -- First task
  
  RETURN v_first_task_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Create helper function to create period with first tasks
-- ============================================

DROP FUNCTION IF EXISTS create_period_with_first_tasks(uuid, date, date) CASCADE;

CREATE FUNCTION create_period_with_first_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS VOID AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_month_name TEXT;
  v_task_record RECORD;
  v_task_due_date DATE;
BEGIN
  -- Get work details
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if this period already exists
  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;
  
  -- Create period if it doesn't exist
  IF v_work_recurring_instance_id IS NULL THEN
    v_month_name := TO_CHAR(p_period_start, 'Mon YYYY');
    
    INSERT INTO work_recurring_instances (
      work_id,
      period_start_date,
      period_end_date,
      instance_date,
      period_name,
      status,
      total_tasks,
      completed_tasks,
      all_tasks_completed,
      updated_at
    )
    VALUES (
      p_work_id,
      p_period_start,
      p_period_end,
      CURRENT_DATE,
      v_month_name,
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_work_recurring_instance_id;
  END IF;
  
  -- Create first tasks for this period (tasks with sort_order = 0)
  FOR v_task_record IN
    SELECT 
      st.id as service_task_id,
      st.title,
      st.description,
      st.priority,
      st.estimated_hours,
      st.default_assigned_to,
      st.sort_order
    FROM service_tasks st
    WHERE st.service_id = v_service_id
    AND st.sort_order = 0 -- Only first tasks
    AND st.is_active = TRUE
  LOOP
    -- Calculate due date for this task
    v_task_due_date := calculate_task_due_date_for_period(
      v_task_record.service_task_id,
      p_period_start,
      p_period_end
    );
    
    -- Create the task if it doesn't already exist
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      status,
      priority,
      assigned_to,
      estimated_hours,
      sort_order,
      display_order,
      created_at,
      updated_at
    )
    VALUES (
      v_work_recurring_instance_id,
      v_task_record.service_task_id,
      v_task_record.title,
      v_task_record.description,
      v_task_due_date,
      'pending',
      v_task_record.priority,
      v_task_record.default_assigned_to,
      v_task_record.estimated_hours,
      v_task_record.sort_order,
      v_task_record.sort_order,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  
  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;
  
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Fix handle_recurring_work_creation function
-- ============================================

DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_start_date DATE;
  v_current_date DATE := CURRENT_DATE;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Only handle recurring works
  IF COALESCE(NEW.is_recurring, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;
  
  -- Get service and work details
  SELECT s.id, s.recurrence_type
  INTO v_service_id, v_recurrence_type
  FROM services s WHERE s.id = NEW.service_id;
  
  IF v_service_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Determine start date
  v_start_date := COALESCE(NEW.start_date, CURRENT_DATE);
  
  -- Handle monthly recurrence
  IF v_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      -- Create period with first tasks
      PERFORM create_period_with_first_tasks(
        NEW.id, v_period_start, v_period_end
      );
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  -- Handle quarterly recurrence
  ELSIF v_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      -- Create period with first tasks
      PERFORM create_period_with_first_tasks(
        NEW.id, v_period_start, v_period_end
      );
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  -- Handle yearly recurrence
  ELSIF v_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      -- Create period with first tasks
      PERFORM create_period_with_first_tasks(
        NEW.id, v_period_start, v_period_end
      );
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Ensure trigger exists
-- ============================================

DROP TRIGGER IF EXISTS handle_recurring_work_insert ON works;

CREATE TRIGGER handle_recurring_work_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
