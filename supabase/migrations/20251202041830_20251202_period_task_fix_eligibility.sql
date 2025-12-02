/*
  # Period Eligibility Checking - Core Logic Implementation
  
  ## Rule: Create period if AT LEAST ONE task satisfies all three conditions:
  1. Period End Date has passed (period_end_date < current_date)
  2. Task Due Date has not passed (due_date >= current_date)
  3. Task Due Date is on or after Work Start Date (due_date >= work_start_date)
*/

DROP FUNCTION IF EXISTS should_create_period_for_date(UUID, DATE, DATE, DATE, DATE) CASCADE;

CREATE FUNCTION should_create_period_for_date(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_current_date DATE,
  p_work_start_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_task RECORD;
  v_task_due_date DATE;
  v_month_iter INTEGER;
  v_period_end_year INTEGER;
  v_period_end_month INTEGER;
BEGIN
  -- Check if period end has already passed
  IF p_period_end_date >= p_current_date THEN
    RETURN FALSE;
  END IF;

  -- Check each active task in service
  FOR v_task IN
    SELECT id, task_recurrence_type
    FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
  LOOP
    IF v_task.task_recurrence_type = 'monthly' THEN
      -- Check each month in the period
      v_month_iter := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
      v_period_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
      v_period_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
      
      WHILE TRUE LOOP
        v_task_due_date := calculate_task_due_date_in_month(
          v_task.id,
          v_month_iter,
          EXTRACT(YEAR FROM p_period_start_date)::INTEGER
        );
        
        -- Check three conditions
        IF v_task_due_date >= p_work_start_date 
           AND v_task_due_date <= p_current_date THEN
          RETURN TRUE;
        END IF;
        
        -- Exit loop if we've checked all months in period
        IF EXTRACT(YEAR FROM p_period_start_date)::INTEGER = v_period_end_year 
           AND v_month_iter >= v_period_end_month THEN
          EXIT;
        END IF;
        
        v_month_iter := v_month_iter + 1;
        IF v_month_iter > 12 THEN
          v_month_iter := 1;
        END IF;
      END LOOP;
    ELSE
      -- Quarterly/Yearly tasks
      v_task_due_date := calculate_task_due_date_for_period(v_task.id, p_period_start_date, p_period_end_date);
      
      -- Check three conditions
      IF v_task_due_date >= p_work_start_date 
         AND v_task_due_date <= p_current_date THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;
