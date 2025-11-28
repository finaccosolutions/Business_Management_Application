/*
  # Backfill Missing Periods and Tasks Based on Task Period Expiry
  
  ## Purpose
  Create missing periods and tasks for dates up to TODAY where task periods 
  have already elapsed but periods weren't created.
  
  ## Logic
  1. For each recurring work with a service, find the last created period
  2. Check when each task's period expires from the last period end date
  3. Create missing periods for each elapsed task period expiry
  4. Add appropriate tasks to each new period based on task expiry
  
  ## Safety
  - Only creates periods up to CURRENT_DATE
  - Checks for existing periods before inserting
  - Checks for duplicate tasks before inserting
  - Does not affect existing functions or triggers
*/

DO $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_task RECORD;
  v_period_exists BOOLEAN;
  v_last_period_end_date DATE;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_periods_created INTEGER := 0;
  v_tasks_created INTEGER := 0;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_earliest_task_expiry DATE;
BEGIN
  
  -- Loop through all recurring works with services
  FOR v_work IN
    SELECT w.* FROM works w
    WHERE w.is_recurring = TRUE
    AND w.service_id IS NOT NULL
    AND w.start_date IS NOT NULL
  LOOP
    
    -- Get the last created period for this work
    SELECT * INTO v_last_period
    FROM work_recurring_instances
    WHERE work_id = v_work.id
    ORDER BY period_end_date DESC
    LIMIT 1;
    
    -- If no periods exist, skip (auto-creation will handle initial period)
    IF v_last_period IS NULL THEN
      CONTINUE;
    END IF;
    
    v_last_period_end_date := v_last_period.period_end_date;
    
    -- Main loop: Create periods based on when earliest task expires
    LOOP
      -- Find when the earliest task's period expires from the last period
      v_earliest_task_expiry := find_earliest_task_expiry_date(v_work.service_id, v_last_period_end_date);
      
      -- If earliest task expiry is still in future, stop creating periods
      IF v_earliest_task_expiry > CURRENT_DATE THEN
        EXIT;
      END IF;
      
      -- Calculate next period dates based on work recurrence
      SELECT start_date, end_date, period_name
      INTO v_next_start, v_next_end, v_next_name
      FROM calculate_next_period_dates(v_last_period_end_date, v_work.recurrence_pattern);
      
      -- Don't create periods beyond today
      IF v_next_start > CURRENT_DATE THEN
        EXIT;
      END IF;
      
      -- Check if this period already exists
      SELECT EXISTS (
        SELECT 1 FROM work_recurring_instances
        WHERE work_id = v_work.id
        AND period_start_date = v_next_start
      ) INTO v_period_exists;
      
      IF NOT v_period_exists THEN
        -- Create the new period
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
          all_tasks_completed,
          created_at,
          updated_at
        ) VALUES (
          v_work.id,
          v_next_name,
          v_next_start,
          v_next_end,
          v_work.billing_amount,
          'pending',
          FALSE,
          0,
          0,
          FALSE,
          NOW(),
          NOW()
        )
        RETURNING id INTO v_new_period_id;
        
        v_periods_created := v_periods_created + 1;
        
        -- Add tasks whose period has elapsed to this new period
        v_task_count := 0;
        FOR v_task IN
          SELECT * FROM get_tasks_to_add_for_period(
            v_work.service_id,
            v_next_end,
            v_last_period_end_date
          )
        LOOP
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
            assigned_to,
            created_at,
            updated_at
          ) VALUES (
            v_new_period_id,
            v_task.task_id,
            v_task.title,
            v_task.description,
            v_task.priority,
            v_task.estimated_hours,
            v_task.sort_order,
            v_task.due_date,
            'pending',
            v_task.assigned_to,
            NOW(),
            NOW()
          );
          
          v_task_count := v_task_count + 1;
          v_tasks_created := v_tasks_created + 1;
        END LOOP;
        
        -- Update period with task count
        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_new_period_id;
        
        -- Copy documents to the new period
        PERFORM copy_documents_to_period(v_new_period_id, v_work.id);
      END IF;
      
      -- Move to next period end date
      v_last_period_end_date := v_next_end;
    END LOOP;
  END LOOP;
  
  -- Log completion
  RAISE NOTICE 'Backfill Complete: % periods created, % tasks created',
    v_periods_created, v_tasks_created;
END $$;
