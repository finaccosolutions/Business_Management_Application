/*
  # Period Creation with Task Assignment - Safeguarded Version
  
  ## Key Change: Tasks are added ONLY when period is created
  - Prevents retroactive task addition to existing periods
  - Ensures tasks_generated_at timestamp is set once
*/

DROP FUNCTION IF EXISTS create_period_with_all_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;

CREATE FUNCTION create_period_with_all_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_service_id UUID;
  v_work_start_date DATE;
  v_period_id UUID;
  v_task_record RECORD;
  v_task_due_date DATE;
  v_month_iter INTEGER;
  v_year_iter INTEGER;
  v_period_end_month INTEGER;
  v_period_end_year INTEGER;
  v_period_created BOOLEAN := FALSE;
BEGIN
  SELECT service_id, start_date INTO v_service_id, v_work_start_date 
  FROM works 
  WHERE id = p_work_id;
  
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if period should be created (at least one qualifying task exists)
  IF NOT should_create_period_for_date(v_service_id, p_period_start, p_period_end, p_current_date, v_work_start_date) THEN
    RETURN FALSE;
  END IF;

  -- Check if period already exists
  SELECT id INTO v_period_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  IF v_period_id IS NULL THEN
    -- Create period for the first time
    INSERT INTO work_recurring_instances (
      work_id,
      period_start_date,
      period_end_date,
      instance_date,
      period_name,
      status,
      total_tasks,
      completed_tasks,
      all_tasks_completed,
      tasks_generated_at,
      updated_at
    )
    VALUES (
      p_work_id,
      p_period_start,
      p_period_end,
      CURRENT_DATE,
      generate_period_name(p_period_start, p_period_end, p_recurrence_type),
      'pending',
      0,
      0,
      FALSE,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_period_id;
    
    v_period_created := TRUE;
  END IF;

  -- Add tasks ONLY if period was just created
  IF v_period_created THEN
    FOR v_task_record IN
      SELECT id, title, description, priority, estimated_hours, default_assigned_to, sort_order, task_recurrence_type
      FROM service_tasks
      WHERE service_id = v_service_id
      AND is_active = TRUE
      ORDER BY sort_order ASC
    LOOP
      IF v_task_record.task_recurrence_type = 'monthly' THEN
        v_month_iter := EXTRACT(MONTH FROM p_period_start)::INTEGER;
        v_year_iter := EXTRACT(YEAR FROM p_period_start)::INTEGER;
        v_period_end_month := EXTRACT(MONTH FROM p_period_end)::INTEGER;
        v_period_end_year := EXTRACT(YEAR FROM p_period_end)::INTEGER;

        WHILE TRUE LOOP
          v_task_due_date := calculate_task_due_date_in_month(v_task_record.id, v_month_iter, v_year_iter);

          -- Insert only if three conditions are met
          IF v_task_due_date >= v_work_start_date 
             AND v_task_due_date <= p_current_date THEN
            INSERT INTO recurring_period_tasks (
              work_recurring_instance_id,
              service_task_id,
              title,
              description,
              due_date,
              status,
              priority,
              assigned_to,
              estimated_hours,
              sort_order,
              display_order,
              created_at,
              updated_at
            )
            VALUES (
              v_period_id,
              v_task_record.id,
              v_task_record.title || ' - ' || get_month_name(v_month_iter),
              v_task_record.description,
              v_task_due_date,
              'pending',
              v_task_record.priority,
              v_task_record.default_assigned_to,
              v_task_record.estimated_hours,
              v_task_record.sort_order,
              v_task_record.sort_order,
              NOW(),
              NOW()
            )
            ON CONFLICT DO NOTHING;
          END IF;

          -- Exit loop if we've processed all months in the period
          IF v_year_iter = v_period_end_year AND v_month_iter >= v_period_end_month THEN
            EXIT;
          END IF;

          v_month_iter := v_month_iter + 1;
          IF v_month_iter > 12 THEN
            v_month_iter := 1;
            v_year_iter := v_year_iter + 1;
          END IF;
        END LOOP;
      ELSE
        -- Quarterly/Yearly tasks
        v_task_due_date := calculate_task_due_date_for_period(v_task_record.id, p_period_start, p_period_end);

        -- Insert only if three conditions are met
        IF v_task_due_date >= v_work_start_date 
           AND v_task_due_date <= p_current_date THEN
          INSERT INTO recurring_period_tasks (
            work_recurring_instance_id,
            service_task_id,
            title,
            description,
            due_date,
            status,
            priority,
            assigned_to,
            estimated_hours,
            sort_order,
            display_order,
            created_at,
            updated_at
          )
          VALUES (
            v_period_id,
            v_task_record.id,
            v_task_record.title,
            v_task_record.description,
            v_task_due_date,
            'pending',
            v_task_record.priority,
            v_task_record.default_assigned_to,
            v_task_record.estimated_hours,
            v_task_record.sort_order,
            v_task_record.sort_order,
            NOW(),
            NOW()
          )
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END LOOP;

    -- Update total tasks count
    UPDATE work_recurring_instances
    SET total_tasks = (
      SELECT COUNT(*) FROM recurring_period_tasks
      WHERE work_recurring_instance_id = v_period_id
    )
    WHERE id = v_period_id;
  END IF;

  RETURN v_period_created;
END;
$$ LANGUAGE plpgsql;
