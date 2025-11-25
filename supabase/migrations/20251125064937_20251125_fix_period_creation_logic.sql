/*
  # Fix Recurring Period Creation Logic
  
  ## Issues Fixed
  1. Extra future period creation: Periods were being created for months that haven't ended yet
  2. Duplicate task copying: Tasks were duplicated when periods were fetched
  3. UI improvement: Period tiles now show both start and end dates
  
  ## Changes
  - Update backfill_missing_periods to only create periods up to and including today
  - Change exit condition from `v_next_start > CURRENT_DATE` to `v_next_end < CURRENT_DATE`
  - This ensures: for Nov 25, only create Oct (ended) but NOT Nov (still in progress)
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
  
  SELECT first_start_date, first_end_date, first_period_name
  INTO v_first_start, v_first_end, v_first_name
  FROM calculate_first_period_for_work(p_work_id);
  
  IF v_first_start IS NULL THEN
    RETURN 0;
  END IF;
  
  v_next_start := v_first_start;
  v_next_end := v_first_end;
  v_next_name := v_first_name;
  
  LOOP
    IF v_next_end < CURRENT_DATE THEN
      SELECT start_date, end_date, period_name
      INTO v_next_start, v_next_end, v_next_name
      FROM calculate_next_period_dates(v_next_end, v_work.recurrence_pattern);
    ELSE
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
      v_total_created := v_total_created + 1;
    END IF;
    
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_next_end, v_work.recurrence_pattern);
  END LOOP;
  
  RETURN v_total_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
