/*
  # Fix Task Due Date Offset Calculation - Offset from Period End

  ## Problem
  Tasks are showing incorrect due dates because the system has inconsistent offset handling.

  Current Issue:
  - Period: Sept 1-30, 2025
  - Task: GSTR-1 with offset_type='days', offset_value=10
  - WRONG: Due date shows Sept 10 (period start month + 10)
  - CORRECT: Due date should be Oct 10 (period end + 10 days)

  ## Root Cause
  The service_tasks table has multiple conflicting offset columns:
  - due_offset_type with values: 'day_of_month', 'days', 'months'
  - due_offset_value (number)
  - Old columns: due_date_offset_days, due_date_offset_type, due_offset_month

  The copy_tasks_to_period function needs to handle these correctly:
  - 'days': Add N days from period END date
  - 'months': Add N months from period END date
  - 'day_of_month': Due on specific day of the month AFTER period ends

  ## Solution
  1. Clarify the offset type meanings
  2. Update copy_tasks_to_period to handle all cases correctly
  3. Fix all existing tasks with wrong due dates
*/

-- ============================================================================
-- STEP 1: Recreate copy_tasks_to_period with proper logic
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
  v_next_month_start DATE;
BEGIN
  -- Copy all active service tasks to this period
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Calculate due date based on offset type
    -- All offsets are calculated from PERIOD END DATE

    IF v_task.due_offset_type = 'days' THEN
      -- Add N days from period end
      -- Example: Sept 30 + 10 days = Oct 10
      v_due_date := p_period_end_date + COALESCE(v_task.due_offset_value, 10);

    ELSIF v_task.due_offset_type = 'months' THEN
      -- Add N months from period end
      -- Example: Sept 30 + 1 month = Oct 30
      v_due_date := p_period_end_date + (COALESCE(v_task.due_offset_value, 1) || ' months')::INTERVAL;

    ELSIF v_task.due_offset_type = 'day_of_month' THEN
      -- Due on a specific day of the month AFTER period ends
      -- Example: Period ends Sept 30, offset_value=10, offset_month=1
      -- Result: Oct 10 (1 month after period end, on the 10th day)
      v_next_month_start := DATE_TRUNC('month', p_period_end_date) + INTERVAL '1 month';

      -- Add additional months if specified
      IF v_task.due_offset_month IS NOT NULL AND v_task.due_offset_month > 0 THEN
        v_next_month_start := v_next_month_start + ((v_task.due_offset_month) || ' months')::INTERVAL;
      END IF;

      -- Set the day of the month
      IF v_task.due_offset_value IS NOT NULL THEN
        v_due_date := v_next_month_start + (v_task.due_offset_value - 1 || ' days')::INTERVAL;
      ELSE
        -- Default to 10th day
        v_due_date := v_next_month_start + INTERVAL '9 days';
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
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END;
$$;

COMMENT ON FUNCTION copy_tasks_to_period IS
  'Copies service task templates to recurring periods with due dates calculated from period end date. Supports: days (end+N days), months (end+N months), day_of_month (Nth day of month after period ends)';

GRANT EXECUTE ON FUNCTION copy_tasks_to_period TO authenticated;

-- ============================================================================
-- STEP 2: Fix ALL existing tasks with incorrect due dates
-- ============================================================================

DO $$
DECLARE
  v_task_record RECORD;
  v_period_record RECORD;
  v_service_task RECORD;
  v_new_due_date DATE;
  v_next_month_start DATE;
  v_updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting task due date correction...';
  RAISE NOTICE '========================================';

  -- Loop through all recurring period tasks that have a service_task_id
  FOR v_task_record IN
    SELECT
      rpt.id,
      rpt.work_recurring_instance_id,
      rpt.service_task_id,
      rpt.due_date as current_due_date,
      rpt.title
    FROM recurring_period_tasks rpt
    WHERE rpt.service_task_id IS NOT NULL
    AND rpt.is_overridden = FALSE  -- Don't touch manually overridden tasks
  LOOP
    -- Get period information
    SELECT period_start_date, period_end_date
    INTO v_period_record
    FROM work_recurring_instances
    WHERE id = v_task_record.work_recurring_instance_id;

    -- Get service task template
    SELECT
      due_offset_type,
      due_offset_value,
      due_offset_month
    INTO v_service_task
    FROM service_tasks
    WHERE id = v_task_record.service_task_id;

    -- Calculate correct due date based on offset type
    IF v_service_task.due_offset_type = 'days' THEN
      -- Add N days from period end
      v_new_due_date := v_period_record.period_end_date + COALESCE(v_service_task.due_offset_value, 10);

    ELSIF v_service_task.due_offset_type = 'months' THEN
      -- Add N months from period end
      v_new_due_date := v_period_record.period_end_date + (COALESCE(v_service_task.due_offset_value, 1) || ' months')::INTERVAL;

    ELSIF v_service_task.due_offset_type = 'day_of_month' THEN
      -- Due on specific day of month after period ends
      v_next_month_start := DATE_TRUNC('month', v_period_record.period_end_date) + INTERVAL '1 month';

      IF v_service_task.due_offset_month IS NOT NULL AND v_service_task.due_offset_month > 0 THEN
        v_next_month_start := v_next_month_start + ((v_service_task.due_offset_month) || ' months')::INTERVAL;
      END IF;

      IF v_service_task.due_offset_value IS NOT NULL THEN
        v_new_due_date := v_next_month_start + (v_service_task.due_offset_value - 1 || ' days')::INTERVAL;
      ELSE
        v_new_due_date := v_next_month_start + INTERVAL '9 days';
      END IF;

    ELSE
      -- Default fallback
      v_new_due_date := v_period_record.period_end_date + INTERVAL '10 days';
    END IF;

    -- Update if the calculated due date is different
    IF v_task_record.current_due_date != v_new_due_date THEN
      UPDATE recurring_period_tasks
      SET
        due_date = v_new_due_date,
        updated_at = NOW()
      WHERE id = v_task_record.id;

      v_updated_count := v_updated_count + 1;

      RAISE NOTICE 'Fixed: "%" | Period: % to % | Old: % | New: % | Type: % Value: %',
        v_task_record.title,
        v_period_record.period_start_date,
        v_period_record.period_end_date,
        v_task_record.current_due_date,
        v_new_due_date,
        v_service_task.due_offset_type,
        COALESCE(v_service_task.due_offset_value, 0);
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Task due date correction complete!';
  RAISE NOTICE 'Total tasks updated: %', v_updated_count;
  RAISE NOTICE '========================================';
END $$;
