/*
  # Fix Null Due Dates in Recurring Period Tasks

  ## Problem
  When generating recurring periods, the `copy_tasks_to_period_with_templates` function
  was inserting tasks with null due_date values, which violates the NOT NULL constraint
  on the `due_date` column of `recurring_period_tasks` table.

  ## Root Cause
  1. Service tasks may not have `due_date_offset_days` defined (could be null)
  2. The function wasn't handling the case where offset is null
  3. No default due date was being set when offset was unavailable

  ## Solution
  1. Update `copy_tasks_to_period_with_templates` to use period_end_date as default when due_date_offset_days is null
  2. Add validation to ensure all tasks get valid due dates
  3. Use period_end_date + 0 days as fallback if no offset is configured

  ## Changes
  - Modified `copy_tasks_to_period_with_templates` function
  - Added default offset handling for service tasks
  - Added default offset handling for work task templates
  - Added NOT NULL default value for all inserted tasks
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
  -- Get the maximum sort order for existing tasks in this period
  SELECT COALESCE(MAX(sort_order), 0)
  INTO v_sort_order
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = p_period_id;

  -- Copy service template tasks first
  FOR v_service_task IN
    SELECT st.*,
           COALESCE(st.due_date_offset_days, 0) as offset_days
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.display_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    -- Use COALESCE to default to period_end_date if offset is null
    v_due_date := p_period_end_date + COALESCE(v_service_task.offset_days, 0);

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
      COALESCE(v_service_task.priority, 'medium'),
      p_assigned_to,
      v_service_task.default_price,
      v_sort_order + v_total_tasks + 1
    );

    v_total_tasks := v_total_tasks + 1;
  END LOOP;

  -- Copy work-level task templates
  FOR v_service_task IN
    SELECT 
      id,
      NULL::uuid as service_task_id,
      title,
      description,
      COALESCE(due_date_offset_days, 0) as offset_days,
      'pending'::text as status,
      priority,
      NULL::uuid as assigned_to,
      estimated_hours,
      display_order
    FROM work_task_templates
    WHERE work_id = p_work_id
    ORDER BY display_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    v_due_date := p_period_end_date + COALESCE(v_service_task.offset_days, 0);

    -- Insert the task from work template
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
      NULL,
      v_service_task.title,
      v_service_task.description,
      v_due_date,
      'pending',
      v_service_task.priority,
      p_assigned_to,
      v_service_task.estimated_hours,
      v_sort_order + v_total_tasks + 1
    );

    v_total_tasks := v_total_tasks + 1;
  END LOOP;

  RETURN v_total_tasks;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_tasks_to_period_with_templates(UUID, UUID, UUID, DATE, UUID) TO authenticated;
