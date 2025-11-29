/*
  # Fix get_first_period_tasks to Return All Period Tasks

  ## Problem
  The get_first_period_tasks function only returns tasks for the first month (v_month_idx = 1),
  but it should return ALL tasks that should exist in the period immediately upon creation:
  - Monthly periods: All monthly tasks
  - Quarterly periods: All monthly tasks (3 months) + quarterly tasks
  - Yearly periods: All monthly tasks (12 months) + quarterly tasks + yearly tasks

  ## Solution
  Rewrite get_first_period_tasks to iterate through ALL months in the period and return
  all tasks that have a task_period_type matching the period type or lower recurrence.
*/

DROP FUNCTION IF EXISTS get_first_period_tasks(uuid, date, date) CASCADE;

CREATE FUNCTION get_first_period_tasks(
  p_work_id uuid, 
  p_period_start_date date, 
  p_period_end_date date
)
RETURNS TABLE(
  service_task_id uuid, 
  task_title text, 
  due_date date, 
  is_first_task boolean
) AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
  v_month_idx INTEGER;
  v_period_start_month INTEGER := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_period_start_year INTEGER := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_st RECORD;
  v_task_due_date DATE;
  v_should_include_task BOOLEAN;
BEGIN
  SELECT w.service_id, s.recurrence_type 
  INTO v_service_id, v_recurrence_type
  FROM works w
  JOIN services s ON s.id = w.service_id
  WHERE w.id = p_work_id;

  IF v_service_id IS NULL THEN
    RETURN;
  END IF;

  v_current_year := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
  v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;
  v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
  v_month_idx := 0;

  WHILE (v_current_year < v_end_year OR 
  (v_current_year = v_end_year AND v_current_month <= v_end_month)) LOOP

    v_month_idx := v_month_idx + 1;

    FOR v_st IN
      SELECT 
        st.id, 
        st.title, 
        st.task_recurrence_type, 
        COALESCE(st.task_period_type, 'monthly') as task_period_type
      FROM service_tasks st
      WHERE st.service_id = v_service_id
      AND st.is_active = TRUE
      ORDER BY st.sort_order
    LOOP
      v_task_due_date := calculate_task_due_date_for_month(v_st.id, v_current_month, v_current_year);
      v_should_include_task := FALSE;

      IF v_recurrence_type = 'monthly' THEN
        IF v_st.task_period_type = 'monthly' THEN
          v_should_include_task := TRUE;
        END IF;

      ELSIF v_recurrence_type = 'quarterly' THEN
        IF v_st.task_period_type = 'monthly' THEN
          v_should_include_task := TRUE;
        ELSIF v_st.task_period_type = 'quarterly' AND v_month_idx = 1 THEN
          v_should_include_task := TRUE;
        END IF;

      ELSIF v_recurrence_type = 'yearly' THEN
        IF v_st.task_period_type = 'monthly' THEN
          v_should_include_task := TRUE;
        ELSIF v_st.task_period_type = 'quarterly' AND v_month_idx = 1 THEN
          v_should_include_task := TRUE;
        ELSIF v_st.task_period_type = 'yearly' AND v_month_idx = 1 THEN
          v_should_include_task := TRUE;
        END IF;
      END IF;

      IF v_should_include_task THEN
        IF v_st.task_period_type = 'monthly' AND v_month_idx > 1 THEN
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title || ' - ' || get_month_name(v_current_month),
            v_task_due_date,
            FALSE::BOOLEAN;
        ELSE
          RETURN QUERY SELECT 
            v_st.id,
            v_st.title,
            v_task_due_date,
            v_month_idx = 1::BOOLEAN;
        END IF;
      END IF;
    END LOOP;

    v_current_month := v_current_month + 1;
    IF v_current_month > 12 THEN
      v_current_month := 1;
      v_current_year := v_current_year + 1;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
