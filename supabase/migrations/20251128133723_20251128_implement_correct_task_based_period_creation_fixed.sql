/*
  # Implement Correct Task-Based Period and Task Creation Logic (Fixed)
  
  ## Overview
  Replace complex duplicate logic with single, clean implementation:
  - Create period only when the earliest task's period LAST DAY has elapsed
  - Add ONLY the task whose period just expired, not all tasks
  - Automatically trigger next period creation when task completes
*/

-- Drop old duplicate functions
DROP FUNCTION IF EXISTS auto_generate_next_period_for_work(uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_next_recurring_period(uuid) CASCADE;

-- Helper: Calculate task period end date
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
      v_result_date := p_period_end_date + INTERVAL '1 month';
  END CASE;
  
  RETURN v_result_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Find earliest task expiry date (when ANY task's period expires)
CREATE OR REPLACE FUNCTION find_earliest_task_expiry_date(
  p_service_id UUID,
  p_last_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_earliest_date DATE := NULL;
  v_task RECORD;
  v_task_expiry_date DATE;
BEGIN
  
  FOR v_task IN
    SELECT st.id, st.task_period_type, st.task_period_value, st.task_period_unit
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    AND st.task_period_type IS NOT NULL
  LOOP
    v_task_expiry_date := calculate_task_period_end_date(
      v_task.task_period_type,
      COALESCE(v_task.task_period_value, 1),
      COALESCE(v_task.task_period_unit, 'months'),
      p_last_period_end_date
    );
    
    IF v_earliest_date IS NULL OR v_task_expiry_date < v_earliest_date THEN
      v_earliest_date := v_task_expiry_date;
    END IF;
  END LOOP;
  
  RETURN v_earliest_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Get tasks to add for a new period
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
    
    IF v_task_expiry_date <= p_period_end_date THEN
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

-- Main Unified Function - Auto-generate periods and tasks
CREATE OR REPLACE FUNCTION auto_generate_periods_and_tasks(p_work_id uuid)
RETURNS integer AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_last_period_end_date DATE;
  v_earliest_task_expiry DATE;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_new_period_id UUID;
  v_task RECORD;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
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
    
    v_earliest_task_expiry := find_earliest_task_expiry_date(
      v_work.service_id,
      v_last_period_end_date
    );
    
    IF v_earliest_task_expiry > CURRENT_DATE THEN
      EXIT;
    END IF;
    
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_last_period_end_date, v_work.recurrence_pattern);
    
    IF v_next_start > CURRENT_DATE THEN
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

-- Update trigger to use unified function
DROP TRIGGER IF EXISTS trigger_auto_generate_next_recurring_period ON work_recurring_instances CASCADE;

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
      PERFORM auto_generate_periods_and_tasks(NEW.work_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_generate_next_recurring_period
AFTER UPDATE ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_next_recurring_period();

-- Backfill existing periods
DO $$
DECLARE
  v_work RECORD;
  v_periods_created INTEGER := 0;
BEGIN
  
  FOR v_work IN
    SELECT id FROM works
    WHERE is_recurring = TRUE
    AND service_id IS NOT NULL
    AND start_date IS NOT NULL
  LOOP
    v_periods_created := v_periods_created + COALESCE(
      auto_generate_periods_and_tasks(v_work.id), 0
    );
  END LOOP;
  
  RAISE NOTICE 'Backfill complete: % periods created/verified',
    v_periods_created;
END $$;
