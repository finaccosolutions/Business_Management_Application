/*
  # Comprehensive Fix for All Task Due Dates

  ## Problem
  Some tasks still have incorrect due dates even after previous migration.
  This migration will recalculate ALL task due dates to ensure they are correct.

  ## Examples of Correct Calculation
  - Q3 2025: Period July 1 - Sept 30
    - Task with offset 12 days: Due Oct 12 (Sept 30 + 12 days)
    - Task with offset 22 days: Due Oct 22 (Sept 30 + 22 days)

  - Sept 2025: Period Sept 1 - Sept 30
    - Task with offset 10 days: Due Oct 10 (Sept 30 + 10 days)
    - Task with offset 20 days: Due Oct 20 (Sept 30 + 20 days)

  ## Solution
  Force recalculate ALL tasks regardless of is_overridden flag (but preserve override info)
*/

-- ============================================================================
-- Recalculate ALL task due dates
-- ============================================================================

DO $$
DECLARE
  v_task RECORD;
  v_period RECORD;
  v_service_task RECORD;
  v_correct_due_date DATE;
  v_next_month_start DATE;
  v_updated_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COMPREHENSIVE TASK DUE DATE FIX';
  RAISE NOTICE '========================================';

  -- Loop through ALL recurring period tasks
  FOR v_task IN
    SELECT
      rpt.id,
      rpt.work_recurring_instance_id,
      rpt.service_task_id,
      rpt.due_date as current_due_date,
      rpt.title,
      rpt.is_overridden,
      rpt.due_date_override
    FROM recurring_period_tasks rpt
    WHERE rpt.service_task_id IS NOT NULL
    ORDER BY rpt.created_at
  LOOP
    -- Get period information
    SELECT period_start_date, period_end_date, period_name
    INTO v_period
    FROM work_recurring_instances
    WHERE id = v_task.work_recurring_instance_id;

    -- Get service task configuration
    SELECT
      due_offset_type,
      due_offset_value,
      due_offset_month
    INTO v_service_task
    FROM service_tasks
    WHERE id = v_task.service_task_id;

    -- Calculate the CORRECT due date
    IF v_service_task.due_offset_type = 'days' THEN
      -- Days from period end: period_end + N days
      v_correct_due_date := v_period.period_end_date + COALESCE(v_service_task.due_offset_value, 10);

    ELSIF v_service_task.due_offset_type = 'months' THEN
      -- Months from period end: period_end + N months
      v_correct_due_date := v_period.period_end_date + (COALESCE(v_service_task.due_offset_value, 1) || ' months')::INTERVAL;

    ELSIF v_service_task.due_offset_type = 'day_of_month' THEN
      -- Specific day of the month after period ends
      v_next_month_start := DATE_TRUNC('month', v_period.period_end_date) + INTERVAL '1 month';

      -- Add offset months if specified
      IF v_service_task.due_offset_month IS NOT NULL AND v_service_task.due_offset_month > 0 THEN
        v_next_month_start := v_next_month_start + ((v_service_task.due_offset_month) || ' months')::INTERVAL;
      END IF;

      -- Set the day
      IF v_service_task.due_offset_value IS NOT NULL THEN
        v_correct_due_date := v_next_month_start + (v_service_task.due_offset_value - 1 || ' days')::INTERVAL;
      ELSE
        v_correct_due_date := v_next_month_start + INTERVAL '9 days';
      END IF;

    ELSE
      -- Default fallback
      v_correct_due_date := v_period.period_end_date + INTERVAL '10 days';
    END IF;

    -- Update the task if the due date is wrong
    IF v_task.current_due_date != v_correct_due_date THEN
      UPDATE recurring_period_tasks
      SET
        due_date = v_correct_due_date,
        updated_at = NOW()
      WHERE id = v_task.id;

      v_updated_count := v_updated_count + 1;

      RAISE NOTICE '[FIXED] % | Period: % (% to %) | OLD: % → NEW: % | Offset: % %',
        v_task.title,
        v_period.period_name,
        v_period.period_start_date,
        v_period.period_end_date,
        v_task.current_due_date,
        v_correct_due_date,
        COALESCE(v_service_task.due_offset_value, 0),
        v_service_task.due_offset_type;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'COMPREHENSIVE FIX COMPLETE!';
  RAISE NOTICE 'Tasks Fixed: %', v_updated_count;
  RAISE NOTICE 'Tasks Already Correct: %', v_skipped_count;
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- Verify the fix
-- ============================================================================

-- Show sample of fixed tasks to verify
DO $$
DECLARE
  v_sample RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION SAMPLE (First 10 tasks):';
  RAISE NOTICE '========================================';

  FOR v_sample IN
    SELECT
      rpt.title,
      wri.period_name,
      wri.period_end_date,
      rpt.due_date,
      st.due_offset_type,
      st.due_offset_value,
      CASE
        WHEN st.due_offset_type = 'days' THEN
          wri.period_end_date + COALESCE(st.due_offset_value, 10)
        ELSE
          NULL
      END as expected_date
    FROM recurring_period_tasks rpt
    JOIN work_recurring_instances wri ON rpt.work_recurring_instance_id = wri.id
    JOIN service_tasks st ON rpt.service_task_id = st.id
    WHERE st.due_offset_type = 'days'
    ORDER BY wri.period_start_date, rpt.title
    LIMIT 10
  LOOP
    RAISE NOTICE '% | Period: % | End: % | Due: % | Offset: % % | Match: %',
      v_sample.title,
      v_sample.period_name,
      v_sample.period_end_date,
      v_sample.due_date,
      COALESCE(v_sample.due_offset_value, 0),
      v_sample.due_offset_type,
      CASE WHEN v_sample.due_date = v_sample.expected_date THEN '✓' ELSE '✗' END;
  END LOOP;

  RAISE NOTICE '========================================';
END $$;
