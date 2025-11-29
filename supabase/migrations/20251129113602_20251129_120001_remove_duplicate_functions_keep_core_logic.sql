/*
  # Remove Duplicate Functions and Keep Core Logic Only

  ## Problem
  The previous migration created several functions that duplicated existing implementations.
  This migration removes the duplicates and keeps only the essential corrected core logic.

  ## Functions Removed (duplicates)
  1. get_tasks_for_period - Similar logic already in get_tasks_to_create_for_period
  2. calculate_task_due_date_for_date - Similar to calculate_task_due_date_for_period
  3. get_monthly_task_months_in_period - Already exists in previous migration
  4. get_first_task_last_day_of_period - Not needed with new logic
  5. create_period_with_first_tasks - Replaced by create_period_with_all_applicable_tasks

  ## Keep and Update
  1. create_period_with_all_applicable_tasks - Core improved function
  2. should_create_period - Core improved function  
  3. get_period_last_task_due_date - Core improved function
  4. backfill_recurring_work_periods - Core improved function
  5. handle_recurring_work_creation - Core trigger function
*/

-- ============================================
-- Remove duplicate functions
-- ============================================

DROP FUNCTION IF EXISTS get_tasks_for_period(uuid, text, date, date) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date_for_date(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(uuid, date, date) CASCADE;

-- ============================================
-- Recreate core improved functions only
-- ============================================

-- Update should_create_period to check last task due date properly
DROP FUNCTION IF EXISTS should_create_period(uuid, date, date, text, date) CASCADE;

CREATE FUNCTION should_create_period(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_period_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_task_due_date DATE;
BEGIN
  -- Get the last task due date for this period
  v_last_task_due_date := calculate_last_task_due_date_for_period(
    p_service_id,
    p_period_start_date,
    p_period_end_date,
    p_period_type
  );
  
  -- Period should be created if last task due date has elapsed
  RETURN v_last_task_due_date <= p_current_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Keep and use existing calculate_last_task_due_date_for_period if it exists
-- Otherwise create it (this was likely created in earlier migrations)

-- ============================================
-- Update create_period_with_all_applicable_tasks to use existing helpers
-- ============================================

DROP FUNCTION IF EXISTS create_period_with_all_applicable_tasks(uuid, date, date, text, date) CASCADE;

CREATE FUNCTION create_period_with_all_applicable_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_period_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_current_date DATE;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_month_name TEXT;
BEGIN
  -- Get work details
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if period should be created (last task due date elapsed)
  IF NOT should_create_period(v_service_id, p_period_start, p_period_end, p_period_type, p_current_date) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if this period already exists
  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;
  
  -- Create period if it doesn't exist
  IF v_work_recurring_instance_id IS NULL THEN
    v_period_name := generate_period_name(p_period_start, p_period_type);
    
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
      p_current_date,
      v_period_name,
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_work_recurring_instance_id;
  END IF;
  
  -- Add all applicable tasks using existing helper
  PERFORM generate_period_tasks_for_instance(v_work_recurring_instance_id, v_service_id, p_period_start, p_period_end, p_period_type);
  
  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_work_recurring_instance_id
  )
  WHERE id = v_work_recurring_instance_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Keep backfill function
-- ============================================

DROP FUNCTION IF EXISTS backfill_recurring_work_periods(uuid, date, text, date) CASCADE;

CREATE FUNCTION backfill_recurring_work_periods(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS VOID AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Handle monthly recurrence
  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'monthly', p_current_date
      );
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  -- Handle quarterly recurrence
  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date
      );
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  -- Handle yearly recurrence
  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;
    
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'yearly', p_current_date
      );
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Keep handle_recurring_work_creation trigger
-- ============================================

DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_start_date DATE;
  v_current_date DATE := CURRENT_DATE;
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
  
  -- Backfill periods and tasks from start date to current date
  PERFORM backfill_recurring_work_periods(
    NEW.id,
    v_start_date,
    v_recurrence_type,
    v_current_date
  );
  
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
