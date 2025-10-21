/*
  # Fix Task Due Date Calculation for 'days' Offset Type

  ## Problem
  Tasks created with `due_offset_type = 'days'` are showing incorrect due dates.
  
  Example:
  - Period: September 2025 (Sept 1 - Sept 30)
  - Task: gstr1 with offset 10 days
  - Current: Due date shows Sept 10 (WRONG - calculated from period start)
  - Expected: Due date should be Oct 10 (Sept 30 + 10 days)

  ## Root Cause
  The `calculate_enhanced_task_due_date` function doesn't handle `due_offset_type = 'days'`.
  It only handles 'days_after_period_end', 'days_after_period_start', etc.
  When 'days' is passed, it falls to the ELSE clause which incorrectly uses period start.

  ## Solution
  Update `calculate_enhanced_task_due_date` to treat 'days' as 'days_after_period_end'.
  This aligns with the `copy_tasks_to_period` function which already handles 'days' correctly.

  ## Changes
  1. Add 'days' case to the CASE statement, treating it same as 'days_after_period_end'
  2. Recalculate all existing tasks with 'days' offset type
*/

-- ============================================================================
-- Fix the calculate_enhanced_task_due_date function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_enhanced_task_due_date(
  p_task_recurrence_type text,
  p_service_recurrence_type text,
  p_due_offset_type text,
  p_due_offset_value integer,
  p_due_offset_month integer,
  p_apply_to_month text,
  p_period_start_date date,
  p_period_end_date date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result_date date;
  period_months integer;
  target_month_start date;
  months_diff integer;
BEGIN
  -- If task recurrence matches service recurrence or is one_time, use period-based calculation
  IF p_task_recurrence_type = p_service_recurrence_type OR p_task_recurrence_type = 'one_time' OR p_task_recurrence_type IS NULL THEN
    
    CASE p_due_offset_type
      -- Handle 'days' as alias for 'days_after_period_end'
      WHEN 'days', 'days_after_period_end' THEN
        result_date := p_period_end_date + COALESCE(p_due_offset_value, 0);
        
      WHEN 'day_of_month' THEN
        -- Apply to specific month within the period
        CASE p_apply_to_month
          WHEN 'first' THEN
            target_month_start := DATE_TRUNC('month', p_period_start_date)::date;
          WHEN 'second' THEN
            target_month_start := (DATE_TRUNC('month', p_period_start_date) + INTERVAL '1 month')::date;
          WHEN 'third' THEN
            target_month_start := (DATE_TRUNC('month', p_period_start_date) + INTERVAL '2 months')::date;
          WHEN 'last' THEN
            target_month_start := DATE_TRUNC('month', p_period_end_date)::date;
          ELSE
            -- Default to first month of period
            target_month_start := DATE_TRUNC('month', p_period_start_date)::date;
        END CASE;
        
        result_date := target_month_start + (COALESCE(p_due_offset_value, 1) - 1);
        
      WHEN 'months_after_period_end', 'months' THEN
        -- Add months, then set to specific day if provided
        result_date := (p_period_end_date + (COALESCE(p_due_offset_value, 0) || ' months')::interval)::date;
        
        -- If due_offset_month is provided, set to that day of month
        IF p_due_offset_month IS NOT NULL THEN
          result_date := DATE_TRUNC('month', result_date)::date + (p_due_offset_month - 1);
        END IF;
        
      WHEN 'days_after_period_start' THEN
        result_date := p_period_start_date + COALESCE(p_due_offset_value, 0);
        
      ELSE
        -- Default to days after period end (safest default)
        result_date := p_period_end_date + COALESCE(p_due_offset_value, 10);
    END CASE;
    
  ELSE
    -- Task has different recurrence than service - need to generate multiple instances
    -- For now, calculate for the relevant month based on task recurrence
    
    CASE p_task_recurrence_type
      WHEN 'monthly' THEN
        -- For monthly tasks, apply to each month in the period
        -- This function will be called multiple times for each month
        CASE p_due_offset_type
          WHEN 'day_of_month' THEN
            result_date := DATE_TRUNC('month', p_period_start_date)::date + (COALESCE(p_due_offset_value, 1) - 1);
          WHEN 'days', 'days_after_period_end' THEN
            -- For monthly tasks, "period end" means end of each month
            result_date := (DATE_TRUNC('month', p_period_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::date 
                          + COALESCE(p_due_offset_value, 0);
          ELSE
            result_date := DATE_TRUNC('month', p_period_start_date)::date + (COALESCE(p_due_offset_value, 1) - 1);
        END CASE;
        
      WHEN 'quarterly', 'half_yearly', 'yearly' THEN
        -- Task is less frequent than period, so apply to period end
        CASE p_due_offset_type
          WHEN 'day_of_month' THEN
            result_date := DATE_TRUNC('month', p_period_end_date)::date + (COALESCE(p_due_offset_value, 1) - 1);
          WHEN 'days', 'days_after_period_end' THEN
            result_date := p_period_end_date + COALESCE(p_due_offset_value, 0);
          WHEN 'months', 'months_after_period_end' THEN
            result_date := (p_period_end_date + (COALESCE(p_due_offset_value, 0) || ' months')::interval)::date;
            IF p_due_offset_month IS NOT NULL THEN
              result_date := DATE_TRUNC('month', result_date)::date + (p_due_offset_month - 1);
            END IF;
          ELSE
            result_date := p_period_end_date + COALESCE(p_due_offset_value, 0);
        END CASE;
        
      ELSE
        -- Default fallback
        result_date := p_period_end_date + COALESCE(p_due_offset_value, 10);
    END CASE;
    
  END IF;
  
  RETURN result_date;
END;
$$;

-- ============================================================================
-- Recalculate all tasks with incorrect due dates
-- ============================================================================

DO $$
DECLARE
  v_task RECORD;
  v_period RECORD;
  v_service_task RECORD;
  v_correct_due_date DATE;
  v_updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixing tasks with due_offset_type = days';
  RAISE NOTICE '========================================';

  -- Loop through all tasks that have service tasks with 'days' offset type
  FOR v_task IN
    SELECT
      rpt.id,
      rpt.work_recurring_instance_id,
      rpt.service_task_id,
      rpt.due_date as current_due_date,
      rpt.title
    FROM recurring_period_tasks rpt
    JOIN service_tasks st ON st.id = rpt.service_task_id
    WHERE st.due_offset_type = 'days'
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
      due_offset_value
    INTO v_service_task
    FROM service_tasks
    WHERE id = v_task.service_task_id;

    -- Calculate correct due date: period_end + N days
    v_correct_due_date := v_period.period_end_date + COALESCE(v_service_task.due_offset_value, 10);

    -- Update if incorrect
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
  RAISE NOTICE 'Fix Complete! Updated % tasks', v_updated_count;
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- Verify the fix
-- ============================================================================

DO $$
DECLARE
  v_sample RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION - All tasks with days offset:';
  RAISE NOTICE '========================================';

  FOR v_sample IN
    SELECT
      rpt.title,
      wri.period_name,
      wri.period_start_date,
      wri.period_end_date,
      st.due_offset_value,
      rpt.due_date,
      (wri.period_end_date + st.due_offset_value) as expected_date,
      CASE 
        WHEN rpt.due_date = (wri.period_end_date + st.due_offset_value) 
        THEN '✓ CORRECT' 
        ELSE '✗ WRONG' 
      END as status
    FROM recurring_period_tasks rpt
    JOIN work_recurring_instances wri ON rpt.work_recurring_instance_id = wri.id
    JOIN service_tasks st ON rpt.service_task_id = st.id
    WHERE st.due_offset_type = 'days'
    ORDER BY wri.period_start_date, rpt.title
    LIMIT 20
  LOOP
    RAISE NOTICE '% | Period: % (% to %) | Due: % | Expected: % | %',
      v_sample.title,
      v_sample.period_name,
      v_sample.period_start_date,
      v_sample.period_end_date,
      v_sample.due_date,
      v_sample.expected_date,
      v_sample.status;
  END LOOP;

  RAISE NOTICE '========================================';
END $$;
