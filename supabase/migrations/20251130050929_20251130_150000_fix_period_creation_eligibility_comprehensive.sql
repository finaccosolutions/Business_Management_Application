/*
  # Fix Recurring Work Period and Task Creation - Comprehensive Fix
  
  ## Core Issues Fixed
  1. Period eligibility check was WRONG: `>=` should be `>` (period must be created AFTER due date passes, not on it)
  2. Periods must NOT be created on INSERT trigger - only scheduled tasks create periods on next day
  3. On work creation, only backfill periods where ALL tasks' due dates have PASSED
  4. Use scheduled jobs to create future periods when their tasks' due dates elapse
  
  ## Key Requirements
  - For monthly: period created AFTER last task due date passes
  - For quarterly: period created AFTER last task due date passes  
  - For yearly: period created AFTER last task due date passes
  - Mixed recurrence: quarterly period contains monthly + quarterly tasks, all due dates checked
  - On work creation: backfill only eligible periods (last task due date already passed)
  - For future periods: automatic creation when due dates elapse
  
  ## Changes
  1. Fix `should_create_period_for_date()` - use `>` instead of `>=`
  2. Drop work insert trigger - period creation should happen via scheduled tasks only
  3. Add scheduled job function to check and create pending periods
  4. Update backfill to respect new eligibility rules
*/

-- Step 1: Fix eligibility check - period only created AFTER due date passes
DROP FUNCTION IF EXISTS should_create_period_for_date(UUID, DATE, DATE, DATE) CASCADE;

CREATE FUNCTION should_create_period_for_date(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_task_due_date DATE;
BEGIN
  v_last_task_due_date := get_last_task_due_date_for_period(p_service_id, p_period_start_date, p_period_end_date);
  
  -- Period should be created only AFTER the last task due date has passed (>), not on it (>=)
  RETURN p_current_date > v_last_task_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 2: Recreate create_period_with_all_tasks with corrected return type
DROP FUNCTION IF EXISTS create_period_with_all_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;

CREATE FUNCTION create_period_with_all_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_work_recurring_instance_id UUID;
  v_service_id UUID;
  v_period_name TEXT;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_period_created BOOLEAN := FALSE;
BEGIN
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check eligibility: period only created AFTER last task due date has passed
  IF NOT should_create_period_for_date(v_service_id, p_period_start, p_period_end, p_current_date) THEN
    RETURN FALSE;
  END IF;

  -- Check if period already exists
  SELECT id INTO v_work_recurring_instance_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  -- Create period if it doesn't exist
  IF v_work_recurring_instance_id IS NULL THEN
    v_period_name := TO_CHAR(p_period_start, 'Mon YYYY');

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
      v_period_name,
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_work_recurring_instance_id;
    
    v_period_created := TRUE;
  END IF;

  -- Create all tasks for this period
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
    AND st.is_active = TRUE
    ORDER BY st.sort_order ASC
  LOOP
    v_task_due_date := calculate_task_due_date_for_period(
      v_task_record.service_task_id,
      p_period_start,
      p_period_end
    );

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

  RETURN v_period_created;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Update backfill function for work creation - same logic
CREATE OR REPLACE FUNCTION backfill_recurring_work_at_creation(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_service_id UUID;
BEGIN
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'monthly', p_current_date);

      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;

  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date);

      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;

  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;

      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'yearly', p_current_date);

      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Remove the INSERT trigger - let scheduled jobs handle future periods
DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works CASCADE;
DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

-- Step 5: Recreate cleaner INSERT trigger that only sets work_type (no period creation)
CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Set work_type based on is_recurring flag
  IF NEW.is_recurring THEN
    NEW.work_type := 'recurring';
    
    -- Ensure start_date is set
    IF NEW.start_date IS NULL THEN
      NEW.start_date := CURRENT_DATE;
    END IF;
  ELSE
    NEW.work_type := 'standard';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_recurring_work_creation
BEFORE INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();

-- Step 6: Add an after-insert trigger to backfill periods after work is created
CREATE FUNCTION backfill_recurring_work_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_recurrence_type TEXT;
BEGIN
  IF NEW.is_recurring THEN
    v_recurrence_type := COALESCE(NEW.recurrence_pattern, 'monthly');
    
    -- Backfill eligible periods from work start date to current date
    PERFORM backfill_recurring_work_at_creation(
      NEW.id,
      NEW.start_date,
      v_recurrence_type,
      CURRENT_DATE
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create AFTER INSERT trigger for backfilling
DROP TRIGGER IF EXISTS trg_backfill_recurring_work_after_insert ON works;

CREATE TRIGGER trg_backfill_recurring_work_after_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION backfill_recurring_work_after_insert();

-- Step 7: Create scheduled task processor function
-- This will be called daily to create periods whose tasks' due dates have passed
CREATE OR REPLACE FUNCTION check_and_create_pending_periods()
RETURNS TABLE(work_id UUID, periods_created INT) AS $$
DECLARE
  v_work RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_current_date DATE;
  v_periods_created INT;
  v_recurrence_type TEXT;
BEGIN
  v_current_date := CURRENT_DATE;
  
  -- Process all recurring works
  FOR v_work IN
    SELECT id, recurrence_pattern, start_date
    FROM works
    WHERE is_recurring = TRUE
    ORDER BY created_at DESC
  LOOP
    v_periods_created := 0;
    v_recurrence_type := COALESCE(v_work.recurrence_pattern, 'monthly');
    
    -- Check for monthly recurrence
    IF v_recurrence_type = 'monthly' THEN
      v_period_start := DATE_TRUNC('month', v_work.start_date)::DATE;
      
      WHILE v_period_start <= v_current_date LOOP
        v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        
        IF create_period_with_all_tasks(v_work.id, v_period_start, v_period_end, 'monthly', v_current_date) THEN
          v_periods_created := v_periods_created + 1;
        END IF;
        
        v_period_start := v_period_start + INTERVAL '1 month';
      END LOOP;
    
    -- Check for quarterly recurrence
    ELSIF v_recurrence_type = 'quarterly' THEN
      v_period_start := DATE_TRUNC('quarter', v_work.start_date)::DATE;
      
      WHILE v_period_start <= v_current_date LOOP
        v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
        
        IF create_period_with_all_tasks(v_work.id, v_period_start, v_period_end, 'quarterly', v_current_date) THEN
          v_periods_created := v_periods_created + 1;
        END IF;
        
        v_period_start := v_period_start + INTERVAL '3 months';
      END LOOP;
    
    -- Check for yearly recurrence
    ELSIF v_recurrence_type = 'yearly' THEN
      v_period_start := DATE_TRUNC('year', v_work.start_date)::DATE;
      
      WHILE v_period_start <= v_current_date LOOP
        v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
        
        IF create_period_with_all_tasks(v_work.id, v_period_start, v_period_end, 'yearly', v_current_date) THEN
          v_periods_created := v_periods_created + 1;
        END IF;
        
        v_period_start := v_period_start + INTERVAL '1 year';
      END LOOP;
    END IF;
    
    IF v_periods_created > 0 THEN
      work_id := v_work.id;
      periods_created := v_periods_created;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
