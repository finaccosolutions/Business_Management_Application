/*
  # Fix backfill_missing_periods to Include Current Period
  
  ## Problem
  - Current logic: `IF v_next_end > CURRENT_DATE THEN EXIT;` 
  - This stops BEFORE creating the current period
  - Should be: `IF v_next_end < CURRENT_DATE THEN EXIT;` to create up to and including current
  
  ## Correct Logic
  - Create periods where period_end_date <= CURRENT_DATE (all periods that have ended or are ending today)
  - This includes the current period if it hasn't fully ended yet
  - For Nov 25: Create Oct (ended) and Nov (currently in progress, ends Nov 30)
*/

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
  
  -- Start from first period and generate all periods up to and including current period
  v_next_start := v_first_start;
  v_next_end := v_first_end;
  v_next_name := v_first_name;
  
  LOOP
    -- Create periods where end_date <= today (includes current period if today is within it)
    -- Stop only when we reach a future period
    IF v_next_start > CURRENT_DATE THEN
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
    v_next_start := v_next_end + INTERVAL '1 day';
    
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      v_next_end := (DATE_TRUNC('month', v_next_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_next_name := TO_CHAR(v_next_start, 'Month YYYY');
    
    WHEN 'quarterly' THEN
      v_next_end := (DATE_TRUNC('quarter', v_next_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      v_next_name := 'Q' || TO_CHAR(v_next_start, 'Q YYYY');
    
    WHEN 'half_yearly' THEN
      v_next_end := (DATE_TRUNC('quarter', v_next_start) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      v_next_name := 'H' || CEIL(EXTRACT(MONTH FROM v_next_start) / 6.0)::TEXT || ' ' || TO_CHAR(v_next_start, 'YYYY');
    
    WHEN 'yearly' THEN
      v_next_end := (DATE_TRUNC('year', v_next_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      v_next_name := 'FY ' || TO_CHAR(v_next_start, 'YYYY-') || TO_CHAR(v_next_end, 'YY');
    
    ELSE
      v_next_end := (DATE_TRUNC('month', v_next_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_next_name := TO_CHAR(v_next_start, 'Month YYYY');
    END CASE;
  END LOOP;
  
  RETURN v_total_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
