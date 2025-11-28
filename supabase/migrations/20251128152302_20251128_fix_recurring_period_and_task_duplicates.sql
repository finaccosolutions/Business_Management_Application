/*
  # Fix Recurring Period Eligibility and Duplicate Task Creation

  ## Problems Fixed
  1. Q2 periods created even when work start date (27-11-2025) > last task due date (21-10-2025)
  2. Q3 created with tasks even though current date (28-11-2025) is after period end - future periods should not be created
  3. Duplicate tasks created due to multiple triggers firing simultaneously
  4. `trigger_generate_period_tasks` creates tasks after period already created
  5. `trigger_auto_create_on_recurring_task_completion` creates duplicate periods

  ## Solution
  1. Fix period creation: Only create periods where period_end_date >= CURRENT_DATE AND at least one task due date has elapsed
  2. Remove redundant trigger `trigger_generate_period_tasks` - it conflicts with auto_generate_periods_and_tasks
  3. Disable `trigger_auto_create_on_recurring_task_completion` - use single unified trigger path
  4. Update `auto_generate_periods_and_tasks()` to skip future periods (period_end_date < CURRENT_DATE)
  5. Update `get_tasks_to_add_for_period()` to ensure task due dates <= CURRENT_DATE

  ## Key Changes
  - Only create periods if: period_end_date >= CURRENT_DATE AND has at least one elapsed task
  - Single trigger path: works INSERT -> create_first_recurring_period_only -> auto_generate_periods_and_tasks
  - Remove `trigger_generate_period_tasks` to prevent duplicate task creation
  - Consolidate all period/task creation through one unified flow
*/

-- 1. Fix auto_generate_periods_and_tasks to skip future periods and only create if has elapsed tasks
CREATE OR REPLACE FUNCTION auto_generate_periods_and_tasks(p_work_id uuid)
RETURNS integer AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_last_period_end_date DATE;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_new_period_id UUID;
  v_task RECORD;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
  v_has_elapsed_tasks BOOLEAN;
  v_task_expiry_date DATE;
BEGIN
  
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;
  
  SELECT * INTO v_last_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY period_end_date DESC
  LIMIT 1;
  
  IF v_last_period IS NULL THEN
    SELECT first_start_date, first_end_date, first_period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_first_period_for_work(p_work_id);
    
    IF v_next_start IS NULL THEN
      RETURN 0;
    END IF;
    
    v_last_period_end_date := v_next_start - 1;
  ELSE
    v_last_period_end_date := v_last_period.period_end_date;
  END IF;
  
  LOOP
    IF v_work.service_id IS NULL THEN
      EXIT;
    END IF;
    
    -- Calculate next period based on recurrence pattern
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_last_period_end_date, v_work.recurrence_pattern);
    
    -- CRITICAL: Only create periods where period_end_date >= CURRENT_DATE
    -- Do not create future periods
    IF v_next_end < CURRENT_DATE THEN
      v_last_period_end_date := v_next_end;
      CONTINUE;
    END IF;
    
    -- Check if this period has ANY tasks with elapsed due dates
    v_has_elapsed_tasks := FALSE;
    FOR v_task IN
      SELECT st.task_period_type, st.task_period_value, st.task_period_unit
      FROM service_tasks st
      WHERE st.service_id = v_work.service_id
      AND st.is_active = TRUE
      AND st.task_period_type IS NOT NULL
    LOOP
      v_task_expiry_date := calculate_task_period_end_date(
        v_task.task_period_type,
        COALESCE(v_task.task_period_value, 1),
        COALESCE(v_task.task_period_unit, 'months'),
        v_last_period_end_date
      );
      
      -- If any task's due date has elapsed, this period is eligible
      IF v_task_expiry_date < CURRENT_DATE THEN
        v_has_elapsed_tasks := TRUE;
        EXIT;
      END IF;
    END LOOP;
    
    -- Only create period if it has at least one elapsed task
    IF NOT v_has_elapsed_tasks THEN
      EXIT;
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;
    
    IF NOT v_period_exists THEN
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
      
      v_task_count := 0;
      FOR v_task IN
        SELECT * FROM get_tasks_to_add_for_period(
          v_work.service_id,
          v_next_end,
          v_last_period_end_date
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
      
      UPDATE work_recurring_instances
      SET total_tasks = v_task_count
      WHERE id = v_new_period_id;
      
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
      
      v_total_created := v_total_created + 1;
    END IF;
    
    v_last_period_end_date := v_next_end;
  END LOOP;
  
  RETURN v_total_created;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure get_tasks_to_add_for_period only returns tasks with elapsed due dates
CREATE OR REPLACE FUNCTION get_tasks_to_add_for_period(
  p_service_id UUID,
  p_period_end_date DATE,
  p_last_period_end_date DATE
)
RETURNS TABLE(
  task_id UUID,
  task_title TEXT,
  task_description TEXT,
  task_priority TEXT,
  task_estimated_hours NUMERIC,
  task_sort_order INTEGER,
  task_due_date DATE,
  task_assigned_to UUID
) AS $$
DECLARE
  v_task RECORD;
  v_task_expiry_date DATE;
BEGIN
  FOR v_task IN
    SELECT st.id, st.title, st.description, st.priority, st.estimated_hours, 
           st.sort_order, st.due_date_offset_days, st.default_assigned_to,
           st.task_period_type, st.task_period_value, st.task_period_unit
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.sort_order
  LOOP
    v_task_expiry_date := calculate_task_period_end_date(
      v_task.task_period_type,
      COALESCE(v_task.task_period_value, 1),
      COALESCE(v_task.task_period_unit, 'months'),
      p_last_period_end_date
    );
    
    -- CRITICAL: Only include tasks whose due dates have ALREADY ELAPSED (< CURRENT_DATE)
    IF v_task_expiry_date < CURRENT_DATE THEN
      RETURN QUERY
      SELECT
        v_task.id,
        v_task.title,
        v_task.description,
        v_task.priority,
        v_task.estimated_hours,
        v_task.sort_order,
        (p_period_end_date + (COALESCE(v_task.due_date_offset_days, 10) || ' days')::INTERVAL)::DATE,
        COALESCE(v_task.default_assigned_to, NULL::UUID);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Update create_first_recurring_period_only to use the fixed logic
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
  v_has_elapsed_tasks BOOLEAN;
  v_task_expiry_date DATE;
BEGIN
  
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM work_recurring_instances WHERE work_id = p_work_id LIMIT 1
  ) THEN
    RETURN NULL;
  END IF;
  
  SELECT first_start_date, first_end_date, first_period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_first_period_for_work(p_work_id);
  
  IF v_next_start IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- CRITICAL: Don't create first period if its end date is in the future
  IF v_next_end < CURRENT_DATE THEN
    RETURN NULL;
  END IF;
  
  -- Check if this first period has ANY tasks with elapsed due dates
  IF v_work.service_id IS NOT NULL THEN
    v_has_elapsed_tasks := FALSE;
    FOR v_task IN
      SELECT st.task_period_type, st.task_period_value, st.task_period_unit
      FROM service_tasks st
      WHERE st.service_id = v_work.service_id
      AND st.is_active = TRUE
      AND st.task_period_type IS NOT NULL
    LOOP
      v_task_expiry_date := calculate_task_period_end_date(
        v_task.task_period_type,
        COALESCE(v_task.task_period_value, 1),
        COALESCE(v_task.task_period_unit, 'months'),
        v_next_start - 1
      );
      
      IF v_task_expiry_date < CURRENT_DATE THEN
        v_has_elapsed_tasks := TRUE;
        EXIT;
      END IF;
    END LOOP;
    
    IF NOT v_has_elapsed_tasks THEN
      RETURN NULL;
    END IF;
  END IF;
  
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
  
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_new_period_id;
  
  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
  
  RETURN v_new_period_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drop trigger_generate_period_tasks to prevent duplicate task creation
DROP TRIGGER IF EXISTS trigger_generate_period_tasks ON work_recurring_instances;

-- 5. Drop or disable trigger_auto_create_on_recurring_task_completion to prevent duplicate periods
DROP TRIGGER IF EXISTS trigger_auto_create_on_recurring_task_completion ON recurring_period_tasks;
