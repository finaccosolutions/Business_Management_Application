/*
  # Fix Task Due Dates to Be Relative to Period End Date, Not Start Date

  ## Problem
  When copying tasks from service templates to periods, task due dates are calculated incorrectly.

  Example scenario:
  - Period: September 2025 (Sept 1-30)
  - Service task: GSTR1 with due_offset_value = 10 days
  - Current (wrong) calculation: Sept 1 + 10 days = Sept 10
  - Expected calculation: Sept 30 + 10 days = Oct 10

  ## Root Cause
  The copy_tasks_to_period function is calculating due dates from period_start_date instead of period_end_date

  ## Solution
  Ensure all task due date calculations use period_end_date as the base
*/

-- ============================================================================
-- Fix copy_tasks_to_period to calculate due dates from period END date
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_tasks_to_period(
  p_period_id UUID,
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
  v_inserted_task_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Copy all active service tasks to this period
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Calculate due date with priority:
    -- 1. If exact_due_date is set, use that
    -- 2. Otherwise, calculate from offset RELATIVE TO PERIOD END DATE
    IF v_task.exact_due_date IS NOT NULL THEN
      v_due_date := v_task.exact_due_date;
    ELSIF v_task.due_offset_value IS NOT NULL THEN
      -- CRITICAL FIX: Calculate based on offset from PERIOD END DATE
      -- Example: For Sept period (Sept 1-30), a task with 10 days offset = Oct 10 (Sept 30 + 10 days)
      IF v_task.due_offset_type = 'months' THEN
        v_due_date := p_period_end_date + (v_task.due_offset_value || ' months')::INTERVAL;
      ELSE
        v_due_date := p_period_end_date + (v_task.due_offset_value || ' days')::INTERVAL;
      END IF;
    ELSE
      -- Default: 10 days after period ends
      v_due_date := p_period_end_date + INTERVAL '10 days';
    END IF;

    -- Check if task already exists for this period (prevent duplicates)
    IF EXISTS (
      SELECT 1 FROM recurring_period_tasks
      WHERE work_recurring_instance_id = p_period_id
      AND service_task_id = v_task.id
    ) THEN
      -- Skip this task, it already exists
      CONTINUE;
    END IF;

    -- Insert task for this period
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      due_date,
      assigned_to,
      status
    ) VALUES (
      p_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_due_date,
      COALESCE(v_task.default_assigned_to, p_assigned_to),
      'pending'
    )
    RETURNING id INTO v_inserted_task_ids[array_length(v_inserted_task_ids, 1) + 1];

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END;
$$;

COMMENT ON FUNCTION copy_tasks_to_period IS
  'Copies service task templates to a recurring period with due dates calculated from PERIOD END DATE. Example: Sept period (1-30) + 10 days = Oct 10';

-- Grant permissions
GRANT EXECUTE ON FUNCTION copy_tasks_to_period TO authenticated;