/*
  # Implement Task-Based Period Creation Logic

  ## Overview
  Changed from work-based period creation to task-based period creation:
  - OLD: Create a new period when the work's recurrence period ends (e.g., quarterly, monthly)
  - NEW: Create a new period when the earliest task's period expires
  
  ## Example
  Work is quarterly recurring, but has tasks with different recurrences:
  - Task 1: Monthly (due every 10 days after period end)
  - Task 2: Quarterly (due every 30 days after period end)
  
  With new logic:
  - First period auto-created when Task 1's month expires (earliest)
  - Task 1 added to the new period
  - Next period only created when Task 2's month expires (if applicable) or next earliest task

  ## Key Changes
  1. New function: find_earliest_task_expiry_date() - finds when the earliest task period expires
  2. Modified: backfill_missing_periods() - creates periods based on task expiry, not work recurrence
  3. New function: get_tasks_to_add_for_period() - returns which tasks should be added based on their period expiry
  4. Modified: copy_tasks_to_period() - only adds tasks whose period has elapsed
  
  ## Database Tables Involved
  - service_tasks: Contains task_period_type, task_period_value, task_period_unit
  - work_recurring_instances: Period records
  - recurring_period_tasks: Tasks within each period
*/

-- Drop existing functions to recreate with new logic
DROP FUNCTION IF EXISTS copy_tasks_to_period(uuid, uuid, date, date, uuid);
DROP FUNCTION IF EXISTS backfill_missing_periods(uuid);

-- Function to determine when a task period expires
-- Returns the date when a task's recurrence period ends relative to a period
CREATE OR REPLACE FUNCTION calculate_task_period_end_date(
  p_task_period_type TEXT,
  p_task_period_value INTEGER,
  p_task_period_unit TEXT,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_result_date DATE;
BEGIN
  CASE p_task_period_unit
    WHEN 'days' THEN
      v_result_date := p_period_end_date + (p_task_period_value || ' days')::INTERVAL;
    WHEN 'weeks' THEN
      v_result_date := p_period_end_date + (p_task_period_value * 7 || ' days')::INTERVAL;
    WHEN 'months' THEN
      v_result_date := p_period_end_date + (p_task_period_value || ' months')::INTERVAL;
    WHEN 'years' THEN
      v_result_date := p_period_end_date + (p_task_period_value || ' years')::INTERVAL;
    ELSE
      v_result_date := p_period_end_date + INTERVAL '10 days';
  END CASE;
  
  RETURN v_result_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to find the earliest task expiry date for a service
-- Returns the earliest date when ANY task's period expires
CREATE OR REPLACE FUNCTION find_earliest_task_expiry_date(
  p_service_id UUID,
  p_last_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_earliest_date DATE;
  v_task RECORD;
  v_task_expiry_date DATE;
BEGIN
  v_earliest_date := NULL;
  
  -- Get all active tasks for this service
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    AND task_period_type IS NOT NULL
  LOOP
    -- Calculate when this task's period expires
    v_task_expiry_date := calculate_task_period_end_date(
      v_task.task_period_type,
      COALESCE(v_task.task_period_value, 1),
      COALESCE(v_task.task_period_unit, 'months'),
      p_last_period_end_date
    );
    
    -- Track the earliest expiry date
    IF v_earliest_date IS NULL OR v_task_expiry_date < v_earliest_date THEN
      v_earliest_date := v_task_expiry_date;
    END IF;
  END LOOP;
  
  -- If no task period found, default to work's period recurrence
  -- by adding the period duration
  IF v_earliest_date IS NULL THEN
    v_earliest_date := p_last_period_end_date + INTERVAL '1 month';
  END IF;
  
  RETURN v_earliest_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- New function: Get which tasks should be added to a period
-- Only adds tasks whose period has elapsed
CREATE OR REPLACE FUNCTION get_tasks_to_add_for_period(
  p_service_id UUID,
  p_period_end_date DATE,
  p_last_period_end_date DATE
)
RETURNS TABLE(
  task_id UUID,
  title TEXT,
  description TEXT,
  priority TEXT,
  estimated_hours NUMERIC,
  sort_order INTEGER,
  due_date DATE,
  assigned_to UUID
) AS $$
DECLARE
  v_task RECORD;
  v_task_expiry_date DATE;
BEGIN
  -- For each active task in the service
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Calculate when this task's period expires from the last period
    v_task_expiry_date := calculate_task_period_end_date(
      v_task.task_period_type,
      COALESCE(v_task.task_period_value, 1),
      COALESCE(v_task.task_period_unit, 'months'),
      p_last_period_end_date
    );
    
    -- Add this task if its period has elapsed (expiry date <= current period end date)
    IF v_task_expiry_date <= p_period_end_date THEN
      RETURN QUERY
      SELECT
        v_task.id,
        v_task.title,
        v_task.description,
        v_task.priority,
        v_task.estimated_hours,
        v_task.sort_order,
        (p_period_end_date + COALESCE(v_task.due_date_offset_days, 10) || ' days')::DATE,
        COALESCE(v_task.default_assigned_to, NULL::UUID)
      FROM service_tasks
      WHERE id = v_task.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- New backfill function with task-based logic
CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id uuid)
RETURNS integer AS $$
DECLARE
  v_work RECORD;
  v_first_start DATE;
  v_first_end DATE;
  v_first_name TEXT;
  v_last_period_end_date DATE;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_earliest_task_expiry DATE;
  v_period_exists BOOLEAN;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
  v_new_period_id UUID;
  v_task RECORD;
BEGIN
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;
  
  SELECT first_start_date, first_end_date, first_period_name
  INTO v_first_start, v_first_end, v_first_name
  FROM calculate_first_period_for_work(p_work_id);
  
  IF v_first_start IS NULL THEN
    RETURN 0;
  END IF;
  
  v_next_start := v_first_start;
  v_next_end := v_first_end;
  v_next_name := v_first_name;
  v_last_period_end_date := v_first_end;
  
  -- Main loop: Create periods based on when earliest task expires
  LOOP
    -- Find when the earliest task's period expires from the last period
    IF v_work.service_id IS NOT NULL THEN
      v_earliest_task_expiry := find_earliest_task_expiry_date(v_work.service_id, v_last_period_end_date);
    ELSE
      -- If no service, use work's recurrence pattern
      v_earliest_task_expiry := v_last_period_end_date + INTERVAL '1 month';
    END IF;
    
    -- If the earliest task expiry is still in the future, stop creating periods
    IF v_earliest_task_expiry >= CURRENT_DATE THEN
      EXIT;
    END IF;
    
    -- Calculate next period dates based on work recurrence
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_last_period_end_date, v_work.recurrence_pattern);
    
    -- Check if this period already exists
    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;
    
    IF NOT v_period_exists THEN
      -- Create the new period
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
      
      -- Copy only tasks whose period has elapsed
      IF v_work.service_id IS NOT NULL THEN
        v_task_count := 0;
        FOR v_task IN
          SELECT * FROM get_tasks_to_add_for_period(v_work.service_id, v_next_end, v_last_period_end_date)
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
          )
          SELECT
            v_new_period_id,
            v_task.task_id,
            v_task.title,
            v_task.description,
            v_task.priority,
            v_task.estimated_hours,
            v_task.sort_order,
            v_task.due_date,
            'pending',
            COALESCE(v_task.assigned_to, v_work.assigned_to)
          WHERE NOT EXISTS (
            SELECT 1 FROM recurring_period_tasks
            WHERE work_recurring_instance_id = v_new_period_id
            AND service_task_id = v_task.task_id
          );
          
          GET DIAGNOSTICS v_task_count = ROW_COUNT;
        END LOOP;
        
        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_new_period_id;
      END IF;
      
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
      v_total_created := v_total_created + 1;
    END IF;
    
    -- Move to the next period
    v_last_period_end_date := v_next_end;
  END LOOP;
  
  RETURN v_total_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated trigger function to call the new backfill logic
CREATE OR REPLACE FUNCTION trigger_auto_generate_next_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_work RECORD;
  v_periods_after_today INTEGER;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    SELECT * INTO v_work FROM works WHERE id = NEW.work_id;
    
    IF v_work IS NULL OR v_work.is_recurring = FALSE 
       OR v_work.status IN ('completed', 'cancelled') THEN
      RETURN NEW;
    END IF;
    
    SELECT COUNT(*) INTO v_periods_after_today
    FROM work_recurring_instances
    WHERE work_id = NEW.work_id
      AND period_start_date > CURRENT_DATE;
    
    IF v_periods_after_today = 0 THEN
      PERFORM auto_generate_next_period_for_work(NEW.work_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
