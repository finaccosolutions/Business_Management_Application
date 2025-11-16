/*
  # Ensure All Period Task Functions Handle Null Offsets

  ## Problem
  Multiple functions that copy tasks to periods may have null offset issues

  ## Solution
  Update all relevant functions to use COALESCE for due_date_offset_days
  with a default of 0 (use period end date as due date)
*/

CREATE OR REPLACE FUNCTION copy_work_templates_to_period(
  p_period_id UUID,
  p_work_id UUID,
  p_period_end_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
  v_sort_order INTEGER;
BEGIN
  -- Get the maximum sort order for existing tasks in this period
  SELECT COALESCE(MAX(sort_order), 0)
  INTO v_sort_order
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = p_period_id;

  -- Copy each work task template to the period
  FOR v_template IN
    SELECT * FROM work_task_templates
    WHERE work_id = p_work_id
    ORDER BY display_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    -- Default to 0 if offset is null (use period_end_date as due date)
    v_due_date := p_period_end_date + COALESCE(v_template.due_date_offset_days, 0);

    -- Insert the task
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      status,
      priority,
      estimated_hours,
      sort_order
    ) VALUES (
      p_period_id,
      NULL,
      v_template.title,
      v_template.description,
      v_due_date,
      'pending',
      v_template.priority,
      v_template.estimated_hours,
      v_sort_order + v_task_count + 1
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_work_templates_to_period(UUID, UUID, DATE) TO authenticated;
