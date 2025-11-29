/*
  # Fix calculate_last_task_due_date_for_period Function Signature

  1. Issue
    - The function is being called with 4 parameters (service_id, period_start, period_end, period_type)
    - But it only accepts 2 parameters (service_id, period_end_date)
    - This causes "function does not exist" error when creating recurring works

  2. Solution
    - Update function to accept all 4 required parameters
    - Use period_type and period_start to correctly calculate task due dates based on recurrence pattern
    - Ensure compatibility with monthly, quarterly, and yearly recurrence types

  3. Security
    - RLS is handled at table level, not needed in this helper function
*/

DROP FUNCTION IF EXISTS calculate_last_task_due_date_for_period(uuid, date);

CREATE OR REPLACE FUNCTION calculate_last_task_due_date_for_period(
  p_service_id uuid,
  p_period_start_date date,
  p_period_end_date date,
  p_period_type text
)
RETURNS date AS $$
DECLARE
  v_last_due_date DATE := NULL;
  v_task RECORD;
  v_task_expiry_date DATE;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_month_idx INTEGER;
  v_first_month INTEGER := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_first_year INTEGER := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
BEGIN
  -- Iterate through all months in the period
  v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
  v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
  v_month_idx := 0;

  WHILE (v_current_year < v_end_year OR 
         (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP
    
    v_month_idx := v_month_idx + 1;

    -- Check all tasks for this period
    FOR v_task IN
      SELECT st.id, st.task_recurrence_type, 
             COALESCE(st.task_period_type, 'monthly') as task_period_type,
             COALESCE(st.due_date_offset_days, 10) as due_date_offset_days
      FROM service_tasks st
      WHERE st.service_id = p_service_id
        AND st.is_active = TRUE
    LOOP
      -- Calculate due date for this task in this month
      v_task_expiry_date := calculate_task_due_date_for_month(
        v_task.id, 
        v_current_month, 
        v_current_year
      );

      -- For MONTHLY recurrence: all monthly tasks apply
      IF p_period_type = 'monthly' AND v_task.task_recurrence_type = 'monthly' THEN
        IF v_task_expiry_date IS NOT NULL THEN
          IF v_last_due_date IS NULL OR v_task_expiry_date > v_last_due_date THEN
            v_last_due_date := v_task_expiry_date;
          END IF;
        END IF;
      
      -- For QUARTERLY recurrence
      ELSIF p_period_type = 'quarterly' THEN
        -- Monthly tasks in first month or quarterly tasks in 3rd month
        IF (v_month_idx = 1 AND v_task.task_period_type = 'monthly') OR
           (v_month_idx = 3 AND v_task.task_period_type = 'quarterly') THEN
          IF v_task_expiry_date IS NOT NULL THEN
            IF v_last_due_date IS NULL OR v_task_expiry_date > v_last_due_date THEN
              v_last_due_date := v_task_expiry_date;
            END IF;
          END IF;
        END IF;
      
      -- For YEARLY recurrence
      ELSIF p_period_type = 'yearly' THEN
        -- Monthly tasks in first month, quarterly in months 3/6/9/12, yearly in month 12
        IF (v_month_idx = 1 AND v_task.task_period_type = 'monthly') OR
           (v_month_idx IN (3, 6, 9, 12) AND v_task.task_period_type = 'quarterly') OR
           (v_month_idx = 12 AND v_task.task_period_type = 'yearly') THEN
          IF v_task_expiry_date IS NOT NULL THEN
            IF v_last_due_date IS NULL OR v_task_expiry_date > v_last_due_date THEN
              v_last_due_date := v_task_expiry_date;
            END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;

    v_current_month := v_current_month + 1;
    IF v_current_month > 12 THEN
      v_current_month := 1;
      v_current_year := v_current_year + 1;
    END IF;
  END LOOP;

  RETURN v_last_due_date;
END;
$$ LANGUAGE plpgsql STABLE;
