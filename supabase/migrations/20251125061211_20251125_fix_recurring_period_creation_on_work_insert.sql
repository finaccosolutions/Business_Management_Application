/*
  # Fix Recurring Period Creation on Work Insert
  
  ## Problem
  - When a recurring work is created, NO periods are being created automatically
  - The trigger exists but the backfill logic isn't working correctly
  - Only create periods for past and current period (not future)
  
  ## Solution
  1. Fix the trigger to properly call backfill on work creation
  2. Update backfill_missing_periods to create periods from work start_date up to and including current/ongoing period
  3. Only create periods where period_end_date <= CURRENT_DATE (no future periods)
  4. Ensure tasks are copied from service template to each period
  
  ## Implementation
  - Recreate trigger_auto_generate_periods_for_recurring_work to properly call backfill
  - Update backfill_missing_periods with correct logic
  - Add helper function to calculate first period based on period_type
*/

-- Drop existing trigger to recreate it
DROP TRIGGER IF EXISTS trigger_auto_generate_periods_for_recurring_work ON works;

-- Recreate the trigger function with proper logic
CREATE OR REPLACE FUNCTION trigger_auto_generate_periods_for_recurring_work()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process for recurring works with service_id and start_date
  IF NEW.is_recurring = true 
  AND NEW.service_id IS NOT NULL 
  AND NEW.start_date IS NOT NULL THEN
    -- Call backfill to create ALL past and current periods immediately
    PERFORM backfill_missing_periods(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_auto_generate_periods_for_recurring_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_periods_for_recurring_work();

-- Update the backfill function to implement smart logic
CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id uuid)
RETURNS integer AS $$
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
  
  -- Calculate first period based on period_type and start_date
  SELECT first_start_date, first_end_date, first_period_name
  INTO v_first_start, v_first_end, v_first_name
  FROM calculate_first_period_for_work(p_work_id);
  
  IF v_first_start IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Start from first period and generate all periods until today (inclusive)
  v_next_start := v_first_start;
  v_next_end := v_first_end;
  v_next_name := v_first_name;
  
  LOOP
    -- ONLY create periods where end_date has PASSED or is TODAY (current period)
    -- Do NOT create future periods
    IF v_next_end > CURRENT_DATE THEN
      EXIT;
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;
    
    IF NOT v_period_exists THEN
      -- Create the period
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure auto_generate_next_period_for_work creates NEXT period after today
CREATE OR REPLACE FUNCTION auto_generate_next_period_for_work(p_work_id uuid)
RETURNS boolean AS $$
DECLARE
  v_work RECORD;
  v_latest_period RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_period_exists BOOLEAN;
BEGIN
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
  AND is_recurring = TRUE;
  
  IF v_work IS NULL THEN
    RETURN FALSE;
  END IF;
  
  SELECT * INTO v_latest_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY period_end_date DESC
  LIMIT 1;
  
  -- If no periods exist, backfill all missing periods from start_date to today
  IF v_latest_period IS NULL THEN
    PERFORM backfill_missing_periods(p_work_id);
    RETURN TRUE;
  END IF;
  
  -- Calculate next period after the latest one
  SELECT start_date, end_date, period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    v_work.recurrence_pattern
  );
  
  -- Only create if the next period's end date has already passed
  IF v_next_end >= CURRENT_DATE THEN
    RETURN FALSE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = v_next_start
  ) INTO v_period_exists;
  
  IF v_period_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Create the next period
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
  
  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
