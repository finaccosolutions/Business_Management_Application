/*
  # Fix Period Creation Logic and Duplicate Tasks

  ## Issues Fixed
  1. **Period Creation**: Clarified logic to only create periods that have ENDED (period_end_date < TODAY)
     - For work starting 5-11-2025 on date 25-11-2025: Only Oct period (ended) should exist, NOT Nov (still ongoing)
  
  2. **Duplicate Tasks**: Added deduplication check in copy_tasks_to_period
     - Prevents duplicate task insertion if function is called multiple times
     - Checks if task already exists for the period before inserting
  
  ## Changes
  - Update backfill_missing_periods with clearer condition: `v_next_end < CURRENT_DATE` (not <= to exclude current day periods)
  - Update copy_tasks_to_period to check if task already exists before inserting
  - Add NOT EXISTS check to prevent duplicates
*/

-- Drop the existing copy_tasks_to_period function
DROP FUNCTION IF EXISTS copy_tasks_to_period(uuid, uuid, date, date, uuid);

-- Recreate with duplicate prevention
CREATE OR REPLACE FUNCTION copy_tasks_to_period(p_period_id uuid, p_service_id uuid, p_period_start_date date, p_period_end_date date, p_assigned_to uuid)
RETURNS integer AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
BEGIN
  IF p_service_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    IF v_task.due_date_offset_days IS NOT NULL THEN
      v_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSE
      v_due_date := p_period_end_date + INTERVAL '10 days';
    END IF;

    -- PREVENT DUPLICATES: Only insert if this exact task doesn't already exist for this period
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      due_date,
      status,
      assigned_to
    )
    SELECT
      p_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_due_date,
      'pending',
      p_assigned_to
    WHERE NOT EXISTS (
      SELECT 1 FROM recurring_period_tasks
      WHERE work_recurring_instance_id = p_period_id
      AND service_task_id = v_task.id
    );

    -- Count only newly inserted rows
    GET DIAGNOSTICS v_task_count = ROW_COUNT;

  END LOOP;

  RETURN v_task_count;
END
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update backfill_missing_periods with explicit logic
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
  
  -- Loop: Only create periods that have ENDED (period_end_date < TODAY)
  -- This means: for Oct (ends 31-10) on date 25-11: CREATE (31-10 < 25-11 = true)
  --             for Nov (ends 30-11) on date 25-11: SKIP (30-11 < 25-11 = false, still ongoing)
  LOOP
    -- Check if this period has already ended
    IF v_next_end < CURRENT_DATE THEN
      -- This period has ended, create it if not already exists
      
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
      
      -- Move to next period
      SELECT start_date, end_date, period_name
      INTO v_next_start, v_next_end, v_next_name
      FROM calculate_next_period_dates(v_next_end, v_work.recurrence_pattern);
    ELSE
      -- This period has NOT ended yet, stop creating
      EXIT;
    END IF;
  END LOOP;
  
  RETURN v_total_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
