/*
  # Fix Service Tasks Column Reference in Period Generation

  ## Issue
  The copy_tasks_to_period_with_templates function was referencing a non-existent column
  'display_order' in the service_tasks table. The correct column name is 'sort_order'.

  ## Fix
  Updated the function to use st.sort_order instead of st.display_order when ordering
  service tasks during period generation.
*/

CREATE OR REPLACE FUNCTION copy_tasks_to_period_with_templates(
  p_period_id UUID,
  p_work_id UUID,
  p_service_id UUID,
  p_period_end_date DATE,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_task RECORD;
  v_due_date DATE;
  v_total_tasks INTEGER := 0;
  v_sort_order INTEGER := 0;
BEGIN
  -- Copy service template tasks first
  FOR v_service_task IN
    SELECT st.*, st.due_date_offset_days
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.sort_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    v_due_date := p_period_end_date + v_service_task.due_date_offset_days;

    -- Insert the task from service template
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
      sort_order
    ) VALUES (
      p_period_id,
      v_service_task.id,
      v_service_task.title,
      v_service_task.description,
      v_due_date,
      'pending',
      v_service_task.priority,
      p_assigned_to,
      v_service_task.estimated_hours,
      v_sort_order
    );

    v_total_tasks := v_total_tasks + 1;
    v_sort_order := v_sort_order + 1;
  END LOOP;

  -- Then copy work-level task templates
  v_total_tasks := v_total_tasks + copy_work_templates_to_period(
    p_period_id,
    p_work_id,
    p_period_end_date
  );

  RETURN v_total_tasks;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_tasks_to_period_with_templates(UUID, UUID, UUID, DATE, UUID) TO authenticated;
