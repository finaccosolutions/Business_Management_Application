/*
  # Fix Period Generation to Respect period_type

  1. Issue
    - backfill_missing_periods() doesn't use work.period_type when calculating first period
    - period_type (previous_period, current_period, next_period) is ignored
    - This causes incorrect period generation for newly created recurring works
    - For non-recurring works: tasks should auto-copy from service (trigger exists but needs verification)

  2. Solution
    - Update backfill_missing_periods() to calculate first period based on period_type
    - For previous_period: start from period before work start_date
    - For current_period: start from current period of work start_date
    - For next_period: start from period after work start_date
    - Generate all periods from calculated first period until today (if end_date has passed)
    - Ensure tasks are created from service templates for each period

  3. New Logic
    - Add calculate_first_period_for_work() function to compute starting period based on period_type
    - Update backfill_missing_periods() to use this function
    - Verify tasks are copied correctly with proper due dates
    - Non-recurring: trigger_copy_service_tasks_to_work should automatically add tasks

  4. Testing Notes
    - Monthly work created 2025-11-22 with start_date 2025-11-15:
      - previous_period: generates Sep, Oct (both have end_date < today)
      - current_period: generates Oct (has end_date < today)  
      - next_period: generates Nov onwards (but Nov end_date hasn't passed, so only if before today)
*/

-- Create function to calculate first period based on period_type
CREATE OR REPLACE FUNCTION calculate_first_period_for_work(
  p_work_id UUID,
  OUT first_start_date DATE,
  OUT first_end_date DATE,
  OUT first_period_name TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_work RECORD;
  v_base_date DATE;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Get the period dates for the work start_date based on recurrence pattern
  -- For period_type logic, we need to know which period the start_date falls into
  v_base_date := v_work.start_date::DATE - INTERVAL '1 day';
  
  -- Calculate the period that contains the work start_date
  SELECT start_date, end_date, period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(v_base_date, v_work.recurrence_pattern);
  
  -- Now apply period_type logic to determine the actual first period to generate
  CASE v_work.period_type
    WHEN 'previous_period' THEN
      -- Go back one period from the period containing start_date
      v_base_date := v_next_start - INTERVAL '1 day';
      SELECT start_date, end_date, period_name
      INTO first_start_date, first_end_date, first_period_name
      FROM calculate_next_period_dates(v_base_date, v_work.recurrence_pattern);
      
    WHEN 'current_period' THEN
      -- Use the period containing start_date
      first_start_date := v_next_start;
      first_end_date := v_next_end;
      first_period_name := v_next_name;
      
    WHEN 'next_period' THEN
      -- Go forward one period from the period containing start_date
      SELECT start_date, end_date, period_name
      INTO first_start_date, first_end_date, first_period_name
      FROM calculate_next_period_dates(v_next_end, v_work.recurrence_pattern);
      
    ELSE
      -- Default to current_period
      first_start_date := v_next_start;
      first_end_date := v_next_end;
      first_period_name := v_next_name;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_first_period_for_work(UUID) TO authenticated;

-- Update backfill_missing_periods to use period_type
CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_work RECORD;
  v_first_start DATE;
  v_first_end DATE;
  v_first_name TEXT;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
  v_new_period_id UUID;
BEGIN
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;

  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;

  -- Get the first period based on period_type
  SELECT first_start_date, first_end_date, first_period_name
  INTO v_first_start, v_first_end, v_first_name
  FROM calculate_first_period_for_work(p_work_id);
  
  IF v_first_start IS NULL THEN
    RETURN 0;
  END IF;

  -- Start from first period and generate all periods until today
  v_next_start := v_first_start;
  v_next_end := v_first_end;
  v_next_name := v_first_name;

  LOOP
    -- ONLY create periods where end_date has PASSED (not today, but before today)
    IF v_next_end >= CURRENT_DATE THEN
      EXIT;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;

    IF NOT v_period_exists THEN
      INSERT INTO work_recurring_instances (
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        billing_amount,
        status,
        is_billed,
        total_tasks,
        completed_tasks,
        all_tasks_completed
      ) VALUES (
        p_work_id,
        v_next_name,
        v_next_start,
        v_next_end,
        v_work.billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

      -- Copy tasks from service template to the period
      IF v_work.service_id IS NOT NULL THEN
        v_task_count := copy_tasks_to_period(
          v_new_period_id,
          v_work.service_id,
          v_next_start,
          v_next_end,
          v_work.assigned_to
        );

        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_new_period_id;
      END IF;

      -- Copy documents to the period
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

      v_total_created := v_total_created + 1;
    END IF;

    -- Move to next period
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_next_end, v_work.recurrence_pattern);
  END LOOP;

  RETURN v_total_created;
END $$;

GRANT EXECUTE ON FUNCTION backfill_missing_periods(UUID) TO authenticated;

-- Ensure copy_service_tasks_to_work trigger is active for non-recurring works
-- This trigger should automatically copy service tasks to work_tasks on work creation
-- Verify it's properly copying tasks with due dates
DROP TRIGGER IF EXISTS trigger_copy_service_tasks_to_work ON works;

CREATE TRIGGER trigger_copy_service_tasks_to_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION copy_service_tasks_to_work();
