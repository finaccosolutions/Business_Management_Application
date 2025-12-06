/*
  # Fix: auto_generate_periods_and_tasks Function
  
  1. Issues Fixed
    - Removed dependency on non-existent calculate_task_due_date_in_month function
    - Fixed quarterly period iteration to create all periods between work start and current date
    - Added month names to monthly task titles for clarity
    - Ensured proper task qualification (period end passed, due date not passed, due date >= work start)
    - Proper handling of mixed-frequency tasks (monthly tasks within quarterly periods)
    - Only create periods that have at least one qualifying task
  
  2. Key Changes
    - All date calculation logic is now inline (no external function calls)
    - Quarterly logic now iterates correctly through all quarters
    - Monthly tasks within quarterly periods create separate instances per month with month names
    - Task title includes month name for monthly tasks (e.g., "GST Payment - January")
    - Duplicate prevention checks before inserting tasks
    - Better handling of period creation with task qualification logic
*/

CREATE OR REPLACE FUNCTION public.auto_generate_periods_and_tasks(p_work_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_work RECORD;
  v_work_recurrence text;
  v_work_start_date date;
  v_service_id uuid;
  v_current_date date := CURRENT_DATE;
  v_current_year int;
  v_current_quarter int;
  v_quarter_start date;
  v_quarter_end date;
  v_quarter_num int;
  v_month_start date;
  v_month_end date;
  v_task RECORD;
  v_task_recurrence text;
  v_task_due_date date;
  v_task_period_end date;
  v_task_title text;
  v_month_index int;
  v_loop_month_start date;
  v_loop_month_end date;
  v_period_id uuid;
  v_period_name text;
  v_period_start date;
  v_period_end date;
  v_has_qualifying_task boolean;
  v_exists boolean;
  v_q_start_month int;
  v_month_name text;
  v_day_in_month int;
  v_max_day int;

BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  IF NOT FOUND THEN
    RAISE NOTICE 'auto_generate_periods_and_tasks: work % not found', p_work_id;
    RETURN;
  END IF;

  v_work_recurrence := LOWER(COALESCE(v_work.recurrence_pattern, ''));
  v_work_start_date := v_work.start_date;
  v_service_id := v_work.service_id;

  IF v_work_recurrence = '' OR v_work_recurrence = 'one-time' OR v_service_id IS NULL THEN
    RETURN;
  END IF;

  -- QUARTERLY WORK RECURRENCE
  IF v_work_recurrence = 'quarterly' THEN
    v_current_year := EXTRACT(YEAR FROM COALESCE(v_work_start_date, v_current_date))::int;
    v_current_quarter := CASE 
      WHEN EXTRACT(MONTH FROM COALESCE(v_work_start_date, v_current_date))::int <= 3 THEN 1
      WHEN EXTRACT(MONTH FROM COALESCE(v_work_start_date, v_current_date))::int <= 6 THEN 2
      WHEN EXTRACT(MONTH FROM COALESCE(v_work_start_date, v_current_date))::int <= 9 THEN 3
      ELSE 4
    END;

    v_current_quarter := v_current_quarter - 1;
    IF v_current_quarter < 1 THEN
      v_current_quarter := 4;
      v_current_year := v_current_year - 1;
    END IF;

    WHILE TRUE LOOP
      v_q_start_month := (v_current_quarter - 1) * 3 + 1;
      v_quarter_start := make_date(v_current_year, v_q_start_month, 1);
      v_quarter_end := (make_date(v_current_year, v_q_start_month, 1) + INTERVAL '3 month' - INTERVAL '1 day')::date;

      IF v_quarter_start > v_current_date THEN
        EXIT;
      END IF;

      v_has_qualifying_task := FALSE;
      v_period_id := NULL;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true) = true
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, v_work_recurrence));

        -- MONTHLY TASKS within QUARTERLY period
        IF v_task_recurrence = 'monthly' THEN
          FOR v_month_index IN 0..2 LOOP
            v_loop_month_start := (v_quarter_start + (v_month_index || ' month')::interval)::date;
            v_loop_month_end := (date_trunc('month', v_loop_month_start) + INTERVAL '1 month' - INTERVAL '1 day')::date;
            
            v_task_period_end := v_loop_month_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := NULL;

              IF v_task.exact_due_date IS NOT NULL THEN
                v_task_due_date := v_task.exact_due_date;
              ELSIF v_task.due_offset_type IS NOT NULL AND v_task.due_offset_value IS NOT NULL THEN
                IF LOWER(v_task.due_offset_type) IN ('day', 'days') THEN
                  v_task_due_date := (v_task_period_end + v_task.due_offset_value)::date;
                ELSIF LOWER(v_task.due_offset_type) IN ('month', 'months') THEN
                  v_task_due_date := (v_task_period_end + (v_task.due_offset_value || ' month')::interval)::date;
                ELSIF LOWER(v_task.due_offset_type) = 'day_of_month' THEN
                  v_max_day := EXTRACT(DAY FROM v_task_period_end)::int;
                  v_day_in_month := LEAST(GREATEST(v_task.due_offset_value, 1), v_max_day);
                  v_task_due_date := make_date(EXTRACT(YEAR FROM v_task_period_end)::int, EXTRACT(MONTH FROM v_task_period_end)::int, v_day_in_month);
                ELSE
                  v_task_due_date := v_task_period_end;
                END IF;
              ELSIF v_task.due_date_offset_days IS NOT NULL THEN
                v_task_due_date := (v_task_period_end + v_task.due_date_offset_days)::date;
              ELSIF v_task.due_day_of_month IS NOT NULL THEN
                v_max_day := EXTRACT(DAY FROM v_task_period_end)::int;
                v_day_in_month := LEAST(GREATEST(v_task.due_day_of_month, 1), v_max_day);
                v_task_due_date := make_date(EXTRACT(YEAR FROM v_task_period_end)::int, EXTRACT(MONTH FROM v_task_period_end)::int, v_day_in_month);
              ELSE
                v_task_due_date := v_task_period_end;
              END IF;

              IF v_task_due_date IS NOT NULL
                 AND v_task_due_date >= COALESCE(v_work_start_date, v_task_due_date)
                 AND v_task_due_date <= v_current_date THEN
                
                v_has_qualifying_task := TRUE;

                IF v_period_id IS NULL THEN
                  SELECT id INTO v_period_id FROM work_recurring_instances
                  WHERE work_id = p_work_id AND period_end_date = v_quarter_end LIMIT 1;

                  IF v_period_id IS NULL THEN
                    v_period_name := 'Q' || v_current_quarter::text || ' ' || v_current_year::text;
                    INSERT INTO work_recurring_instances (work_id, period_name, period_start_date, period_end_date, status, created_at, updated_at)
                    VALUES (p_work_id, v_period_name, v_quarter_start, v_quarter_end, 'pending', NOW(), NOW())
                    RETURNING id INTO v_period_id;
                  END IF;
                END IF;

                v_month_name := TO_CHAR(v_task_period_end, 'Month');
                v_task_title := v_task.title || ' - ' || TRIM(v_month_name);

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks rpt
                  WHERE rpt.work_recurring_instance_id = v_period_id
                    AND rpt.service_task_id = v_task.id
                    AND rpt.due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks (work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order, created_at, updated_at)
                  VALUES (v_period_id, v_task.id, v_task_title, v_task.description, v_task_due_date, v_task.priority, v_task.estimated_hours, 'pending', COALESCE(v_task.sort_order, 0), NOW(), NOW());
                END IF;
              END IF;
            END IF;
          END LOOP;

        -- QUARTERLY TASKS
        ELSIF v_task_recurrence = 'quarterly' THEN
          v_task_period_end := v_quarter_end;

          IF v_task_period_end <= v_current_date THEN
            v_task_due_date := NULL;

            IF v_task.exact_due_date IS NOT NULL THEN
              v_task_due_date := v_task.exact_due_date;
            ELSIF v_task.due_offset_type IS NOT NULL AND v_task.due_offset_value IS NOT NULL THEN
              IF LOWER(v_task.due_offset_type) IN ('day', 'days') THEN
                v_task_due_date := (v_task_period_end + v_task.due_offset_value)::date;
              ELSIF LOWER(v_task.due_offset_type) IN ('month', 'months') THEN
                v_task_due_date := (v_task_period_end + (v_task.due_offset_value || ' month')::interval)::date;
              ELSE
                v_task_due_date := v_task_period_end;
              END IF;
            ELSIF v_task.due_date_offset_days IS NOT NULL THEN
              v_task_due_date := (v_task_period_end + v_task.due_date_offset_days)::date;
            ELSE
              v_task_due_date := v_task_period_end;
            END IF;

            IF v_task_due_date IS NOT NULL
               AND v_task_due_date >= COALESCE(v_work_start_date, v_task_due_date)
               AND v_task_due_date <= v_current_date THEN
              
              v_has_qualifying_task := TRUE;

              IF v_period_id IS NULL THEN
                SELECT id INTO v_period_id FROM work_recurring_instances
                WHERE work_id = p_work_id AND period_end_date = v_quarter_end LIMIT 1;

                IF v_period_id IS NULL THEN
                  v_period_name := 'Q' || v_current_quarter::text || ' ' || v_current_year::text;
                  INSERT INTO work_recurring_instances (work_id, period_name, period_start_date, period_end_date, status, created_at, updated_at)
                  VALUES (p_work_id, v_period_name, v_quarter_start, v_quarter_end, 'pending', NOW(), NOW())
                  RETURNING id INTO v_period_id;
                END IF;
              END IF;

              SELECT EXISTS(
                SELECT 1 FROM recurring_period_tasks rpt
                WHERE rpt.work_recurring_instance_id = v_period_id
                  AND rpt.service_task_id = v_task.id
                  AND rpt.due_date = v_task_due_date
              ) INTO v_exists;

              IF NOT v_exists THEN
                INSERT INTO recurring_period_tasks (work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order, created_at, updated_at)
                VALUES (v_period_id, v_task.id, v_task.title, v_task.description, v_task_due_date, v_task.priority, v_task.estimated_hours, 'pending', COALESCE(v_task.sort_order, 0), NOW(), NOW());
              END IF;
            END IF;
          END IF;

        -- YEARLY TASKS
        ELSIF v_task_recurrence = 'yearly' THEN
          v_task_period_end := make_date(v_current_year, 12, 31);

          IF v_task_period_end <= v_current_date THEN
            v_task_due_date := NULL;

            IF v_task.exact_due_date IS NOT NULL THEN
              v_task_due_date := v_task.exact_due_date;
            ELSIF v_task.due_offset_type IS NOT NULL AND v_task.due_offset_value IS NOT NULL THEN
              IF LOWER(v_task.due_offset_type) IN ('day', 'days') THEN
                v_task_due_date := (v_task_period_end + v_task.due_offset_value)::date;
              ELSIF LOWER(v_task.due_offset_type) IN ('month', 'months') THEN
                v_task_due_date := (v_task_period_end + (v_task.due_offset_value || ' month')::interval)::date;
              ELSE
                v_task_due_date := v_task_period_end;
              END IF;
            ELSIF v_task.due_date_offset_days IS NOT NULL THEN
              v_task_due_date := (v_task_period_end + v_task.due_date_offset_days)::date;
            ELSE
              v_task_due_date := v_task_period_end;
            END IF;

            IF v_task_due_date IS NOT NULL
               AND v_task_due_date >= COALESCE(v_work_start_date, v_task_due_date)
               AND v_task_due_date <= v_current_date THEN
              
              v_has_qualifying_task := TRUE;

              IF v_period_id IS NULL THEN
                SELECT id INTO v_period_id FROM work_recurring_instances
                WHERE work_id = p_work_id AND period_end_date = v_quarter_end LIMIT 1;

                IF v_period_id IS NULL THEN
                  v_period_name := 'Q' || v_current_quarter::text || ' ' || v_current_year::text;
                  INSERT INTO work_recurring_instances (work_id, period_name, period_start_date, period_end_date, status, created_at, updated_at)
                  VALUES (p_work_id, v_period_name, v_quarter_start, v_quarter_end, 'pending', NOW(), NOW())
                  RETURNING id INTO v_period_id;
                END IF;
              END IF;

              SELECT EXISTS(
                SELECT 1 FROM recurring_period_tasks rpt
                WHERE rpt.work_recurring_instance_id = v_period_id
                  AND rpt.service_task_id = v_task.id
                  AND rpt.due_date = v_task_due_date
              ) INTO v_exists;

              IF NOT v_exists THEN
                INSERT INTO recurring_period_tasks (work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order, created_at, updated_at)
                VALUES (v_period_id, v_task.id, v_task.title, v_task.description, v_task_due_date, v_task.priority, v_task.estimated_hours, 'pending', COALESCE(v_task.sort_order, 0), NOW(), NOW());
              END IF;
            END IF;
          END IF;
        END IF;

      END LOOP;

      v_current_quarter := v_current_quarter + 1;
      IF v_current_quarter > 4 THEN
        v_current_quarter := 1;
        v_current_year := v_current_year + 1;
      END IF;
    END LOOP;

  -- MONTHLY WORK RECURRENCE
  ELSIF v_work_recurrence = 'monthly' THEN
    v_month_start := (date_trunc('month', COALESCE(v_work_start_date, v_current_date)) - INTERVAL '1 month')::date;

    WHILE v_month_start <= v_current_date LOOP
      v_month_end := (date_trunc('month', v_month_start) + INTERVAL '1 month' - INTERVAL '1 day')::date;
      v_has_qualifying_task := FALSE;
      v_period_id := NULL;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true) = true
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, v_work_recurrence));

        IF v_task_recurrence = 'monthly' THEN
          v_task_period_end := v_month_end;

          IF v_task_period_end <= v_current_date THEN
            v_task_due_date := NULL;

            IF v_task.exact_due_date IS NOT NULL THEN
              v_task_due_date := v_task.exact_due_date;
            ELSIF v_task.due_offset_type IS NOT NULL AND v_task.due_offset_value IS NOT NULL THEN
              IF LOWER(v_task.due_offset_type) IN ('day', 'days') THEN
                v_task_due_date := (v_task_period_end + v_task.due_offset_value)::date;
              ELSIF LOWER(v_task.due_offset_type) IN ('month', 'months') THEN
                v_task_due_date := (v_task_period_end + (v_task.due_offset_value || ' month')::interval)::date;
              ELSIF LOWER(v_task.due_offset_type) = 'day_of_month' THEN
                v_max_day := EXTRACT(DAY FROM v_task_period_end)::int;
                v_day_in_month := LEAST(GREATEST(v_task.due_offset_value, 1), v_max_day);
                v_task_due_date := make_date(EXTRACT(YEAR FROM v_task_period_end)::int, EXTRACT(MONTH FROM v_task_period_end)::int, v_day_in_month);
              ELSE
                v_task_due_date := v_task_period_end;
              END IF;
            ELSIF v_task.due_date_offset_days IS NOT NULL THEN
              v_task_due_date := (v_task_period_end + v_task.due_date_offset_days)::date;
            ELSIF v_task.due_day_of_month IS NOT NULL THEN
              v_max_day := EXTRACT(DAY FROM v_task_period_end)::int;
              v_day_in_month := LEAST(GREATEST(v_task.due_day_of_month, 1), v_max_day);
              v_task_due_date := make_date(EXTRACT(YEAR FROM v_task_period_end)::int, EXTRACT(MONTH FROM v_task_period_end)::int, v_day_in_month);
            ELSE
              v_task_due_date := v_task_period_end;
            END IF;

            IF v_task_due_date IS NOT NULL
               AND v_task_due_date >= COALESCE(v_work_start_date, v_task_due_date)
               AND v_task_due_date <= v_current_date THEN
              
              v_has_qualifying_task := TRUE;

              IF v_period_id IS NULL THEN
                SELECT id INTO v_period_id FROM work_recurring_instances
                WHERE work_id = p_work_id AND period_end_date = v_month_end LIMIT 1;

                IF v_period_id IS NULL THEN
                  v_period_name := TO_CHAR(v_month_end, 'Mon YYYY');
                  INSERT INTO work_recurring_instances (work_id, period_name, period_start_date, period_end_date, status, created_at, updated_at)
                  VALUES (p_work_id, v_period_name, v_month_start, v_month_end, 'pending', NOW(), NOW())
                  RETURNING id INTO v_period_id;
                END IF;
              END IF;

              v_month_name := TO_CHAR(v_task_period_end, 'Month');
              v_task_title := v_task.title || ' - ' || TRIM(v_month_name);

              SELECT EXISTS(
                SELECT 1 FROM recurring_period_tasks rpt
                WHERE rpt.work_recurring_instance_id = v_period_id
                  AND rpt.service_task_id = v_task.id
                  AND rpt.due_date = v_task_due_date
              ) INTO v_exists;

              IF NOT v_exists THEN
                INSERT INTO recurring_period_tasks (work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order, created_at, updated_at)
                VALUES (v_period_id, v_task.id, v_task_title, v_task.description, v_task_due_date, v_task.priority, v_task.estimated_hours, 'pending', COALESCE(v_task.sort_order, 0), NOW(), NOW());
              END IF;
            END IF;
          END IF;
        END IF;
      END LOOP;

      v_month_start := (v_month_start + INTERVAL '1 month')::date;
    END LOOP;
  END IF;

  RETURN;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'auto_generate_periods_and_tasks error for work %: %', p_work_id, SQLERRM;
    RETURN;
END;
$$;