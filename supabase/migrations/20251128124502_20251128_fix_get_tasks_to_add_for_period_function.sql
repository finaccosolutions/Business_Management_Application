/*
  # Fix get_tasks_to_add_for_period Function
  
  ## Issue
  The function has incorrect interval syntax when calculating due dates.
  It concatenates a date with ' days' which is invalid.
  
  ## Fix
  Use proper interval arithmetic: date + (value || ' days')::INTERVAL
*/

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
        (p_period_end_date + (COALESCE(v_task.due_date_offset_days, 10) || ' days')::INTERVAL)::DATE,
        COALESCE(v_task.default_assigned_to, NULL::UUID)
      FROM service_tasks
      WHERE id = v_task.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
