/*
  # Fix Quarterly and All Period Task Due Dates - Always Use Period End

  ## Problem
  For quarterly periods (e.g., Q3 2025: July 1 - Sept 30), tasks with offset 12 days
  are showing due date as Aug 12 instead of Oct 12.
  
  Expected: Sept 30 + 12 days = Oct 12
  Actual: July 1 + 1 month + 12 days = Aug 12 (WRONG!)

  ## Root Cause
  The `generate_period_tasks_for_instance` function is passing incorrect dates to 
  `calculate_enhanced_task_due_date`:
  - It passes `v_current_month_start` and `v_current_month_start + 1 month`
  - Instead of passing the ACTUAL period start and end dates
  
  When task_recurrence_type is NULL or matches service recurrence, it should use
  the FULL period dates (e.g., July 1 to Sept 30 for quarterly), not just one month.

  ## Solution
  Fix `generate_period_tasks_for_instance` to:
  1. When creating single task instance (task_instance_count = 1), 
     pass NEW.period_start_date and NEW.period_end_date
  2. When creating multiple instances, use month offsets as before
  3. Recalculate all existing wrong tasks

  ## Important
  ALL due date calculations MUST be from PERIOD END DATE, not period start!
*/

-- ============================================================================
-- Fix the generate_period_tasks_for_instance function
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_period_tasks_for_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_service_id uuid;
  v_service_recurrence text;
  v_task_record RECORD;
  v_calculated_due_date date;
  v_current_month_start date;
  v_current_month_end date;
  v_task_instance_count integer;
  i integer;
BEGIN
  -- Get the service_id and recurrence from the work
  SELECT s.id, s.recurrence_type INTO v_service_id, v_service_recurrence
  FROM works w
  JOIN services s ON s.id = w.service_id
  WHERE w.id = NEW.work_id;

  -- If no service_id, skip task generation
  IF v_service_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Generate tasks for each active service task
  FOR v_task_record IN
    SELECT *
    FROM service_tasks
    WHERE service_id = v_service_id
    AND is_active = true
    ORDER BY sort_order
  LOOP
    -- Determine how many instances of this task to create based on recurrence mismatch
    v_task_instance_count := 1;
    
    -- If task is monthly and service is quarterly, create 3 instances
    IF v_task_record.task_recurrence_type = 'monthly' AND v_service_recurrence = 'quarterly' THEN
      v_task_instance_count := 3;
    ELSIF v_task_record.task_recurrence_type = 'monthly' AND v_service_recurrence = 'half_yearly' THEN
      v_task_instance_count := 6;
    ELSIF v_task_record.task_recurrence_type = 'monthly' AND v_service_recurrence = 'yearly' THEN
      v_task_instance_count := 12;
    ELSIF v_task_record.task_recurrence_type = 'quarterly' AND v_service_recurrence = 'half_yearly' THEN
      v_task_instance_count := 2;
    ELSIF v_task_record.task_recurrence_type = 'quarterly' AND v_service_recurrence = 'yearly' THEN
      v_task_instance_count := 4;
    ELSIF v_task_record.task_recurrence_type = 'half_yearly' AND v_service_recurrence = 'yearly' THEN
      v_task_instance_count := 2;
    END IF;
    
    -- Create task instances
    FOR i IN 0..(v_task_instance_count - 1) LOOP
      -- CRITICAL FIX: When single instance, use FULL period dates
      -- When multiple instances, use month offsets
      IF v_task_instance_count = 1 THEN
        -- Single task for the entire period - use actual period start and end
        v_current_month_start := NEW.period_start_date;
        v_current_month_end := NEW.period_end_date;
      ELSE
        -- Multiple tasks (e.g., monthly tasks in quarterly period) - use month chunks
        v_current_month_start := (DATE_TRUNC('month', NEW.period_start_date) + (i || ' months')::interval)::date;
        v_current_month_end := (v_current_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
      END IF;
      
      -- Calculate due date for this instance
      -- ALWAYS calculate from the END date of the period/month
      v_calculated_due_date := calculate_enhanced_task_due_date(
        v_task_record.task_recurrence_type,
        v_service_recurrence,
        COALESCE(v_task_record.due_offset_type, 'day_of_month'),
        v_task_record.due_offset_value,
        v_task_record.due_offset_month,
        v_task_record.apply_to_month,
        v_current_month_start,
        v_current_month_end
      );

      -- Insert period task with instance suffix if multiple
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,
        description,
        due_date,
        priority,
        estimated_hours,
        assigned_to,
        sort_order,
        status
      ) VALUES (
        NEW.id,
        v_task_record.id,
        CASE 
          WHEN v_task_instance_count > 1 THEN 
            v_task_record.title || ' - ' || TO_CHAR(v_current_month_start, 'Mon YYYY')
          ELSE 
            v_task_record.title
        END,
        v_task_record.description,
        v_calculated_due_date,
        v_task_record.priority,
        v_task_record.estimated_hours,
        v_task_record.default_assigned_to,
        v_task_record.sort_order + i,
        'pending'
      );
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Recalculate ALL tasks to fix incorrect due dates
-- ============================================================================

DO $$
DECLARE
  v_task RECORD;
  v_period RECORD;
  v_service_task RECORD;
  v_correct_due_date DATE;
  v_next_month_start DATE;
  v_updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recalculating ALL task due dates';
  RAISE NOTICE 'RULE: All due dates calculated from PERIOD END';
  RAISE NOTICE '========================================';

  -- Loop through ALL recurring period tasks
  FOR v_task IN
    SELECT
      rpt.id,
      rpt.work_recurring_instance_id,
      rpt.service_task_id,
      rpt.due_date as current_due_date,
      rpt.title
    FROM recurring_period_tasks rpt
    WHERE rpt.service_task_id IS NOT NULL
    ORDER BY rpt.created_at
  LOOP
    -- Get period information
    SELECT 
      period_start_date, 
      period_end_date, 
      period_name
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

    -- Calculate the CORRECT due date - ALWAYS from period END
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
      -- Default fallback: 10 days after period ends
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

      RAISE NOTICE '[FIXED] % | Period: % (% to %) | OLD: % → NEW: %',
        v_task.title,
        v_period.period_name,
        v_period.period_start_date,
        v_period.period_end_date,
        v_task.current_due_date,
        v_correct_due_date;
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recalculation Complete!';
  RAISE NOTICE 'Tasks Fixed: %', v_updated_count;
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- Verify the fix for all period types
-- ============================================================================

DO $$
DECLARE
  v_sample RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION - Sample tasks by period type:';
  RAISE NOTICE '========================================';

  FOR v_sample IN
    SELECT
      rpt.title,
      wri.period_name,
      wri.period_start_date,
      wri.period_end_date,
      s.recurrence_type as service_recurrence,
      st.due_offset_type,
      st.due_offset_value,
      rpt.due_date,
      CASE 
        WHEN st.due_offset_type = 'days' THEN
          wri.period_end_date + st.due_offset_value
        ELSE
          NULL
      END as expected_date,
      CASE 
        WHEN st.due_offset_type = 'days' AND rpt.due_date = (wri.period_end_date + st.due_offset_value)
        THEN '✓ CORRECT' 
        WHEN st.due_offset_type = 'days'
        THEN '✗ WRONG' 
        ELSE 'N/A'
      END as status
    FROM recurring_period_tasks rpt
    JOIN work_recurring_instances wri ON rpt.work_recurring_instance_id = wri.id
    JOIN service_tasks st ON rpt.service_task_id = st.id
    JOIN works w ON w.id = wri.work_id
    JOIN services s ON s.id = w.service_id
    ORDER BY 
      CASE s.recurrence_type
        WHEN 'monthly' THEN 1
        WHEN 'quarterly' THEN 2
        WHEN 'half_yearly' THEN 3
        WHEN 'yearly' THEN 4
        ELSE 5
      END,
      wri.period_start_date DESC,
      rpt.title
    LIMIT 20
  LOOP
    RAISE NOTICE '% | % | Period: % (% to %) | Offset: % % | Due: % | Expected: % | %',
      v_sample.service_recurrence,
      v_sample.title,
      v_sample.period_name,
      v_sample.period_start_date,
      v_sample.period_end_date,
      COALESCE(v_sample.due_offset_value, 0),
      v_sample.due_offset_type,
      v_sample.due_date,
      v_sample.expected_date,
      v_sample.status;
  END LOOP;

  RAISE NOTICE '========================================';
END $$;
