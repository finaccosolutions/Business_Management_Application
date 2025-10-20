/*
  # Fix Duplicate Period/Task Creation and Add Exact Due Date Support

  ## Problems
  1. **Duplicate Period Creation**: Two triggers on works table both creating initial periods
     - trigger_handle_new_recurring_work
     - trigger_handle_new_recurring_work_initial_period

  2. **Duplicate Task Creation**: Tasks being created multiple times per period

  3. **Missing Feature**: No way to set exact due dates for tasks at service level

  ## Solutions
  1. Remove duplicate trigger (keep only trigger_handle_new_recurring_work)
  2. Add exact_due_date field to service_tasks table for manual date entry
  3. Update copy_tasks_to_period to respect exact_due_date when provided

  ## Changes
  1. Drop duplicate trigger and its function
  2. Add exact_due_date column to service_tasks
  3. Update task copy logic to use exact_due_date if provided, otherwise calculate from offset
*/

-- ============================================================================
-- STEP 1: Remove duplicate trigger and function causing duplicate periods
-- ============================================================================

-- Drop the duplicate trigger
DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work_initial_period ON works;

-- Drop the duplicate function
DROP FUNCTION IF EXISTS create_initial_recurring_period_on_work_insert();

COMMENT ON TRIGGER trigger_handle_new_recurring_work ON works IS
  'Single trigger that creates initial period with tasks for new recurring works';

-- ============================================================================
-- STEP 2: Add exact_due_date field to service_tasks for manual date entry
-- ============================================================================

-- Add exact_due_date column to allow manual due date specification
ALTER TABLE service_tasks
ADD COLUMN IF NOT EXISTS exact_due_date DATE;

COMMENT ON COLUMN service_tasks.exact_due_date IS
  'Optional: Exact due date for this task. If set, this overrides due_offset_value calculation. Format: YYYY-MM-DD';

-- ============================================================================
-- STEP 3: Update copy_tasks_to_period to respect exact_due_date
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
    -- 2. Otherwise, calculate from offset
    IF v_task.exact_due_date IS NOT NULL THEN
      v_due_date := v_task.exact_due_date;
    ELSIF v_task.due_offset_value IS NOT NULL THEN
      -- Calculate based on offset from period end date
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
  'Copies service task templates to a recurring period with calculated or exact due dates. Prevents duplicate task creation.';

-- ============================================================================
-- STEP 4: Grant necessary permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION copy_tasks_to_period TO authenticated;
