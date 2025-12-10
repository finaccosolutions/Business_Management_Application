/*
  # Update auto_generate_periods_and_tasks to use financial_year_start_month from works table
  
  1. Changes
    - Reads financial_year_start_month from works table
    - Uses it for quarterly, half-yearly, and yearly period generation
    - Respects work-specific financial year configuration
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
  v_fy_start_month int;

  v_iter_date date;
  v_period_start date;
  v_period_end date;

  v_task RECORD;
  v_task_recurrence text;
  v_task_period_end date;
  v_task_due_date date;
  v_month_index int;
  v_quarter_index int;
  v_half_year_index int;

  v_period_id uuid;
  v_period_name text;
  v_exists boolean;
  v_task_title_with_suffix text;
  v_has_qualifying_task boolean;

  v_quarter_num int;
  v_half_year_num int;
  v_financial_year text;
  v_month_num int;

BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  IF NOT FOUND THEN
    RAISE NOTICE 'auto_generate_periods_and_tasks: work % not found', p_work_id;
    RETURN;
  END IF;

  v_work_recurrence := LOWER(COALESCE(v_work.recurrence_pattern, ''));
  v_work_start_date := v_work.start_date;
  v_service_id := v_work.service_id;
  v_fy_start_month := COALESCE(v_work.financial_year_start_month, 4);

  IF v_service_id IS NULL OR v_work_recurrence = '' OR v_work_recurrence = 'one-time' THEN
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- DAILY WORK
  -------------------------------------------------------------------
  IF v_work_recurrence = 'daily' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := v_current_date - INTERVAL '30 days';
    ELSE
      v_iter_date := v_work_start_date;
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := v_iter_date;

      v_has_qualifying_task := false;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true)
          AND LOWER(COALESCE(task_recurrence_type, 'daily')) = 'daily'
      LOOP
        v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_period_end);

        IF v_task_due_date IS NOT NULL
           AND v_period_end <= v_current_date
           AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
           v_has_qualifying_task := true;
           EXIT;
        END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          v_period_name := TO_CHAR(v_period_end, 'YYYY-MM-DD');
          INSERT INTO work_recurring_instances(
            work_id, period_name, period_start_date, period_end_date,
            status, created_at, updated_at
          ) VALUES (
            p_work_id, v_period_name, v_period_start, v_period_end,
            'pending', NOW(), NOW()
          ) RETURNING id INTO v_period_id;
        END IF;

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
            AND LOWER(COALESCE(task_recurrence_type, 'daily')) = 'daily'
        LOOP
          v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_period_end);

          IF v_task_due_date IS NOT NULL
             AND v_period_end <= v_current_date
             AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

            SELECT EXISTS(
              SELECT 1 FROM recurring_period_tasks
              WHERE work_recurring_instance_id = v_period_id
                AND service_task_id = v_task.id
                AND due_date = v_task_due_date
            ) INTO v_exists;

            IF NOT v_exists THEN
              INSERT INTO recurring_period_tasks(
                work_recurring_instance_id, service_task_id, title,
                description, due_date, priority, estimated_hours,
                status, sort_order, created_at, updated_at
              ) VALUES (
                v_period_id, v_task.id, v_task.title,
                v_task.description, v_task_due_date, v_task.priority,
                v_task.estimated_hours, 'pending',
                COALESCE(v_task.sort_order, 0),
                NOW(), NOW()
              );
            END IF;
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '1 day')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- WEEKLY WORK
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'weekly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('week', v_current_date)::date - INTERVAL '1 week';
    ELSE
      v_iter_date := date_trunc('week', v_work_start_date)::date;
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_iter_date + INTERVAL '6 days')::date;

      v_has_qualifying_task := false;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true)
          AND LOWER(COALESCE(task_recurrence_type, 'weekly')) IN ('weekly', 'daily')
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'weekly'));

        IF v_task_recurrence = 'weekly' THEN
          v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_period_end);

          IF v_task_due_date IS NOT NULL
             AND v_period_end <= v_current_date
             AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
             v_has_qualifying_task := true;
             EXIT;
          END IF;
        ELSIF v_task_recurrence = 'daily' THEN
          FOR v_month_index IN 0..6 LOOP
            v_task_period_end := (v_period_start + (v_month_index || ' day')::interval)::date;
            v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_task_period_end, v_task_period_end);

            IF v_task_due_date IS NOT NULL
               AND v_task_period_end <= v_current_date
               AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
               v_has_qualifying_task := true;
               EXIT;
            END IF;
          END LOOP;

          IF v_has_qualifying_task THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          v_period_name := 'Week ' || EXTRACT(WEEK FROM v_period_end)::text
            || ' ' || EXTRACT(YEAR FROM v_period_end)::text;
          INSERT INTO work_recurring_instances(
            work_id, period_name, period_start_date, period_end_date,
            status, created_at, updated_at
          ) VALUES (
            p_work_id, v_period_name, v_period_start, v_period_end,
            'pending', NOW(), NOW()
          ) RETURNING id INTO v_period_id;
        END IF;

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
            AND LOWER(COALESCE(task_recurrence_type, 'weekly')) IN ('weekly', 'daily')
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'weekly'));

          IF v_task_recurrence = 'weekly' THEN
            v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_period_end);

            IF v_task_due_date IS NOT NULL
               AND v_period_end <= v_current_date
               AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

              v_task_title_with_suffix := v_task.title || ' - Week ' || EXTRACT(WEEK FROM v_period_end)::text;

              SELECT EXISTS(
                SELECT 1 FROM recurring_period_tasks
                WHERE work_recurring_instance_id = v_period_id
                  AND service_task_id = v_task.id
                  AND due_date = v_task_due_date
              ) INTO v_exists;

              IF NOT v_exists THEN
                INSERT INTO recurring_period_tasks(
                  work_recurring_instance_id, service_task_id, title,
                  description, due_date, priority, estimated_hours,
                  status, sort_order, created_at, updated_at
                ) VALUES (
                  v_period_id, v_task.id, v_task_title_with_suffix,
                  v_task.description, v_task_due_date, v_task.priority,
                  v_task.estimated_hours, 'pending',
                  COALESCE(v_task.sort_order, 0),
                  NOW(), NOW()
                );
              END IF;
            END IF;
          ELSIF v_task_recurrence = 'daily' THEN
            FOR v_month_index IN 0..6 LOOP
              v_task_period_end := (v_period_start + (v_month_index || ' day')::interval)::date;
              v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_task_period_end, v_task_period_end);

              IF v_task_due_date IS NOT NULL
                 AND v_task_period_end <= v_current_date
                 AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks
                  WHERE work_recurring_instance_id = v_period_id
                    AND service_task_id = v_task.id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id, title,
                    description, due_date, priority, estimated_hours,
                    status, sort_order, created_at, updated_at
                  ) VALUES (
                    v_period_id, v_task.id, v_task.title,
                    v_task.description, v_task_due_date, v_task.priority,
                    v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order, 0),
                    NOW(), NOW()
                  );
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '1 week')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- MONTHLY WORK
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'monthly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '1 month';
    ELSE
      v_iter_date := date_trunc('month', v_work_start_date)::date - INTERVAL '1 month';
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (date_trunc('month', v_iter_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;

      v_has_qualifying_task := false;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true)
          AND LOWER(COALESCE(task_recurrence_type, 'monthly')) IN ('monthly', 'weekly', 'daily')
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'monthly'));

        IF v_task_recurrence = 'monthly' THEN
          v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_period_end);

          IF v_task_due_date IS NOT NULL
             AND v_period_end <= v_current_date
             AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
            v_has_qualifying_task := true;
            EXIT;
          END IF;

        ELSIF v_task_recurrence IN ('weekly','daily') THEN
          FOR v_month_index IN 0..(EXTRACT(DAY FROM v_period_end)::int - 1) LOOP
            v_task_period_end := (v_period_start + (v_month_index || ' day')::interval)::date;
            v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_task_period_end, v_task_period_end);

            IF v_task_due_date IS NOT NULL
               AND v_task_period_end <= v_current_date
               AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
              v_has_qualifying_task := true;
              EXIT;
            END IF;
          END LOOP;

          IF v_has_qualifying_task THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          v_period_name := TO_CHAR(v_period_end, 'Mon YYYY');
          INSERT INTO work_recurring_instances(
            work_id, period_name, period_start_date, period_end_date,
            status, created_at, updated_at
          ) VALUES (
            p_work_id, v_period_name, v_period_start, v_period_end,
            'pending', NOW(), NOW()
          ) RETURNING id INTO v_period_id;
        END IF;

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
            AND LOWER(COALESCE(task_recurrence_type, 'monthly')) IN ('monthly', 'weekly', 'daily')
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'monthly'));

          IF v_task_recurrence = 'monthly' THEN
            v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_period_end);

            IF v_task_due_date IS NOT NULL
               AND v_period_end <= v_current_date
               AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

              v_task_title_with_suffix := v_task.title || ' - ' || TRIM(TO_CHAR(v_period_end, 'Mon'));

              SELECT EXISTS(
                SELECT 1 FROM recurring_period_tasks
                WHERE work_recurring_instance_id = v_period_id
                  AND service_task_id = v_task.id
                  AND due_date = v_task_due_date
              ) INTO v_exists;

              IF NOT v_exists THEN
                INSERT INTO recurring_period_tasks(
                  work_recurring_instance_id, service_task_id, title,
                  description, due_date, priority, estimated_hours,
                  status, sort_order, created_at, updated_at
                ) VALUES (
                  v_period_id, v_task.id, v_task_title_with_suffix,
                  v_task.description, v_task_due_date,
                  v_task.priority, v_task.estimated_hours, 'pending',
                  COALESCE(v_task.sort_order, 0),
                  NOW(), NOW()
                );
              END IF;
            END IF;

          ELSIF v_task_recurrence IN ('weekly','daily') THEN
            FOR v_month_index IN 0..(EXTRACT(DAY FROM v_period_end)::int - 1) LOOP
              v_task_period_end := (v_period_start + (v_month_index || ' day')::interval)::date;
              v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_task_period_end, v_task_period_end);

              IF v_task_due_date IS NOT NULL
                AND v_task_period_end <= v_current_date
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks
                  WHERE work_recurring_instance_id = v_period_id
                    AND service_task_id = v_task.id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id, title,
                    description, due_date, priority, estimated_hours,
                    status, sort_order, created_at, updated_at
                  ) VALUES (
                    v_period_id, v_task.id, v_task.title,
                    v_task.description, v_task_due_date, v_task.priority,
                    v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order, 0),
                    NOW(), NOW()
                  );
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '1 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- QUARTERLY WORK (using configured FY start month)
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'quarterly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '3 month';
    ELSE
      v_iter_date := date_trunc('month', (v_work_start_date - INTERVAL '3 month'))::date;
    END IF;

    v_iter_date := make_date(
        EXTRACT(YEAR FROM v_iter_date)::int,
        CASE 
          WHEN EXTRACT(MONTH FROM v_iter_date)::int >= v_fy_start_month THEN 
            (((EXTRACT(MONTH FROM v_iter_date)::int - v_fy_start_month) / 3) * 3) + v_fy_start_month
          ELSE
            (((EXTRACT(MONTH FROM v_iter_date)::int + 12 - v_fy_start_month) / 3) * 3) + v_fy_start_month - 12
        END,
        1
    );

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_period_start + INTERVAL '3 month' - INTERVAL '1 day')::date;

      v_has_qualifying_task := false;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true)
          AND LOWER(COALESCE(task_recurrence_type, 'quarterly')) IN ('quarterly', 'monthly', 'weekly', 'daily')
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'quarterly'));

        IF v_task_recurrence = 'quarterly' THEN
          v_task_period_end := v_period_end;
          v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_task_period_end);

          IF v_task_due_date IS NOT NULL
             AND v_task_period_end <= v_current_date
             AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
            v_has_qualifying_task := true;
            EXIT;
          END IF;

        ELSIF v_task_recurrence IN ('monthly','weekly','daily') THEN
          FOR v_month_index IN 0..2 LOOP
            v_task_period_end := (v_period_start + (v_month_index || ' month')::interval)::date;
            v_task_period_end := (date_trunc('month', v_task_period_end) + INTERVAL '1 month' - INTERVAL '1 day')::date;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, (v_task_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date, v_task_period_end);

              IF v_task_due_date IS NOT NULL
                 AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                v_has_qualifying_task := true;
                EXIT;
              END IF;
            END IF;
          END LOOP;

          IF v_has_qualifying_task THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          v_month_num := EXTRACT(MONTH FROM v_period_start)::int;
          v_quarter_num := ((v_month_num - v_fy_start_month + 12) % 12) / 3 + 1;
          
          v_period_name := 'Q' || v_quarter_num::text || ' ' || EXTRACT(YEAR FROM v_period_start)::int;
          INSERT INTO work_recurring_instances(
            work_id, period_name, period_start_date, period_end_date,
            status, created_at, updated_at
          ) VALUES(
            p_work_id, v_period_name, v_period_start, v_period_end,
            'pending', NOW(), NOW()
          ) RETURNING id INTO v_period_id;
        END IF;

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
            AND LOWER(COALESCE(task_recurrence_type, 'quarterly')) IN ('quarterly', 'monthly', 'weekly', 'daily')
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'quarterly'));

          IF v_task_recurrence = 'quarterly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_task_period_end);

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks
                  WHERE work_recurring_instance_id = v_period_id
                    AND service_task_id = v_task.id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id, title,
                    description, due_date, priority, estimated_hours,
                    status, sort_order, created_at, updated_at
                  ) VALUES (
                    v_period_id, v_task.id, v_task.title,
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order, 0),
                    NOW(), NOW()
                  );
                END IF;
              END IF;
            END IF;

          ELSIF v_task_recurrence IN ('monthly','weekly','daily') THEN
            FOR v_month_index IN 0..2 LOOP
              v_task_period_end := (v_period_start + (v_month_index || ' month')::interval)::date;
              v_task_period_end := (date_trunc('month', v_task_period_end)
                                   + INTERVAL '1 month' - INTERVAL '1 day')::date;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_period(
                  v_task.id, (v_task_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date, v_task_period_end
                );

                IF v_task_due_date IS NOT NULL
                  AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                  v_task_title_with_suffix := v_task.title || ' - ' || TRIM(TO_CHAR(v_task_period_end, 'Mon'));
                  
                  SELECT EXISTS(
                    SELECT 1 FROM recurring_period_tasks
                    WHERE work_recurring_instance_id = v_period_id
                      AND service_task_id = v_task.id
                      AND due_date = v_task_due_date
                  ) INTO v_exists;

                  IF NOT v_exists THEN
                    INSERT INTO recurring_period_tasks(
                      work_recurring_instance_id, service_task_id, title,
                      description, due_date, priority, estimated_hours,
                      status, sort_order, created_at, updated_at
                    ) VALUES (
                      v_period_id, v_task.id, v_task_title_with_suffix,
                      v_task.description, v_task_due_date, v_task.priority,
                      v_task.estimated_hours, 'pending',
                      COALESCE(v_task.sort_order, 0) + v_month_index * 1000,
                      NOW(), NOW()
                    );
                  END IF;
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '3 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- HALF-YEARLY WORK (using configured FY start month)
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'half-yearly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '6 month';
    ELSE
      v_iter_date := date_trunc('month', v_work_start_date)::date - INTERVAL '6 month';
    END IF;

    IF EXTRACT(MONTH FROM v_iter_date)::int >= v_fy_start_month THEN
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int, v_fy_start_month, 1);
    ELSIF EXTRACT(MONTH FROM v_iter_date)::int < v_fy_start_month THEN
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int - 1, v_fy_start_month, 1);
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_period_start + INTERVAL '6 month' - INTERVAL '1 day')::date;

      v_has_qualifying_task := false;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true)
          AND LOWER(COALESCE(task_recurrence_type, 'half-yearly')) IN ('half-yearly', 'quarterly', 'monthly', 'weekly', 'daily')
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'half-yearly'));

        IF v_task_recurrence = 'half-yearly' THEN
          v_task_period_end := v_period_end;
          v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_task_period_end);

          IF v_task_due_date IS NOT NULL
             AND v_task_period_end <= v_current_date
             AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
            v_has_qualifying_task := true;
            EXIT;
          END IF;

        ELSIF v_task_recurrence IN ('quarterly','monthly','weekly','daily') THEN
          FOR v_month_index IN 0..5 LOOP
            v_task_period_end := (v_period_start + (v_month_index || ' month')::interval)::date;
            v_task_period_end := (date_trunc('month', v_task_period_end)
                                 + INTERVAL '1 month' - INTERVAL '1 day')::date;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, (v_task_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date, v_task_period_end
              );

              IF v_task_due_date IS NOT NULL
                 AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                v_has_qualifying_task := true;
                EXIT;
              END IF;
            END IF;
          END LOOP;

          IF v_has_qualifying_task THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          v_month_num := EXTRACT(MONTH FROM v_period_start)::int;
          v_half_year_num := ((v_month_num - v_fy_start_month + 12) % 12) / 6 + 1;
          v_period_name := 'H' || v_half_year_num::text || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

          INSERT INTO work_recurring_instances(
            work_id, period_name, period_start_date, period_end_date,
            status, created_at, updated_at
          ) VALUES(
            p_work_id, v_period_name, v_period_start, v_period_end,
            'pending', NOW(), NOW()
          ) RETURNING id INTO v_period_id;
        END IF;

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
            AND LOWER(COALESCE(task_recurrence_type, 'half-yearly')) IN ('half-yearly', 'quarterly', 'monthly', 'weekly', 'daily')
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'half-yearly'));

          IF v_task_recurrence = 'half-yearly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, v_period_start, v_task_period_end
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks
                  WHERE work_recurring_instance_id = v_period_id
                    AND service_task_id = v_task.id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id, title,
                    description, due_date, priority, estimated_hours,
                    status, sort_order, created_at, updated_at
                  ) VALUES (
                    v_period_id, v_task.id, v_task.title,
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order, 0),
                    NOW(), NOW()
                  );
                END IF;
              END IF;
            END IF;

          ELSIF v_task_recurrence IN ('quarterly','monthly','weekly','daily') THEN
            FOR v_month_index IN 0..5 LOOP
              v_task_period_end := (v_period_start + (v_month_index || ' month')::interval)::date;
              v_task_period_end := (date_trunc('month', v_task_period_end)
                                   + INTERVAL '1 month' - INTERVAL '1 day')::date;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_period(
                  v_task.id, (v_task_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date, v_task_period_end
                );

                IF v_task_due_date IS NOT NULL
                  AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                  v_task_title_with_suffix := v_task.title || ' - ' || TRIM(TO_CHAR(v_task_period_end, 'Mon'));
                  
                  SELECT EXISTS(
                    SELECT 1 FROM recurring_period_tasks
                    WHERE work_recurring_instance_id = v_period_id
                      AND service_task_id = v_task.id
                      AND due_date = v_task_due_date
                  ) INTO v_exists;

                  IF NOT v_exists THEN
                    INSERT INTO recurring_period_tasks(
                      work_recurring_instance_id, service_task_id, title,
                      description, due_date, priority, estimated_hours,
                      status, sort_order, created_at, updated_at
                    ) VALUES (
                      v_period_id, v_task.id, v_task_title_with_suffix,
                      v_task.description, v_task_due_date, v_task.priority,
                      v_task.estimated_hours, 'pending',
                      COALESCE(v_task.sort_order, 0) + v_month_index * 1000,
                      NOW(), NOW()
                    );
                  END IF;
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '6 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- YEARLY WORK (using configured FY start month)
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'yearly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '12 month';
    ELSE
      v_iter_date := date_trunc('month', v_work_start_date)::date - INTERVAL '12 month';
    END IF;

    IF EXTRACT(MONTH FROM v_iter_date)::int < v_fy_start_month THEN
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int - 1, v_fy_start_month, 1);
    ELSE
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int, v_fy_start_month, 1);
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_period_start + INTERVAL '12 month' - INTERVAL '1 day')::date;

      v_has_qualifying_task := false;

      FOR v_task IN
        SELECT * FROM service_tasks
        WHERE service_id = v_service_id AND COALESCE(is_active, true)
          AND LOWER(COALESCE(task_recurrence_type, 'yearly')) IN ('yearly', 'half-yearly', 'quarterly', 'monthly', 'weekly', 'daily')
      LOOP
        v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'yearly'));

        IF v_task_recurrence = 'yearly' THEN
          v_task_period_end := v_period_end;
          v_task_due_date := public.calculate_task_due_date_in_period(v_task.id, v_period_start, v_task_period_end);

          IF v_task_due_date IS NOT NULL
             AND v_task_period_end <= v_current_date
             AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
            v_has_qualifying_task := true;
            EXIT;
          END IF;

        ELSIF v_task_recurrence IN ('half-yearly','quarterly','monthly','weekly','daily') THEN
          FOR v_month_index IN 0..11 LOOP
            v_task_period_end := (v_period_start + (v_month_index || ' month')::interval)::date;
            v_task_period_end := (date_trunc('month', v_task_period_end)
                                 + INTERVAL '1 month' - INTERVAL '1 day')::date;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, (v_task_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date, v_task_period_end
              );

              IF v_task_due_date IS NOT NULL
                 AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                v_has_qualifying_task := true;
                EXIT;
              END IF;
            END IF;
          END LOOP;

          IF v_has_qualifying_task THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          v_financial_year := EXTRACT(YEAR FROM v_period_start)::text || '-' || 
                             SUBSTRING((EXTRACT(YEAR FROM v_period_start) + 1)::text, 3, 2);
          
          v_period_name := 'FY ' || v_financial_year;
          INSERT INTO work_recurring_instances(
            work_id, period_name, period_start_date, period_end_date,
            status, created_at, updated_at
          ) VALUES(
            p_work_id, v_period_name, v_period_start, v_period_end,
            'pending', NOW(), NOW()
          ) RETURNING id INTO v_period_id;
        END IF;

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
            AND LOWER(COALESCE(task_recurrence_type, 'yearly')) IN ('yearly', 'half-yearly', 'quarterly', 'monthly', 'weekly', 'daily')
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'yearly'));

          IF v_task_recurrence = 'yearly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, v_period_start, v_task_period_end
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks
                  WHERE work_recurring_instance_id = v_period_id
                    AND service_task_id = v_task.id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id, title,
                    description, due_date, priority, estimated_hours,
                    status, sort_order, created_at, updated_at
                  ) VALUES (
                    v_period_id, v_task.id, v_task.title,
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order, 0),
                    NOW(), NOW()
                  );
                END IF;
              END IF;
            END IF;

          ELSIF v_task_recurrence IN ('half-yearly','quarterly','monthly','weekly','daily') THEN
            FOR v_month_index IN 0..11 LOOP
              v_task_period_end := (v_period_start + (v_month_index || ' month')::interval)::date;
              v_task_period_end := (date_trunc('month', v_task_period_end)
                                   + INTERVAL '1 month' - INTERVAL '1 day')::date;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_period(
                  v_task.id, (v_task_period_end - INTERVAL '1 month' + INTERVAL '1 day')::date, v_task_period_end
                );

                IF v_task_due_date IS NOT NULL
                  AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                  v_task_title_with_suffix := v_task.title || ' - ' || TRIM(TO_CHAR(v_task_period_end, 'Mon'));
                  
                  SELECT EXISTS(
                    SELECT 1 FROM recurring_period_tasks
                    WHERE work_recurring_instance_id = v_period_id
                      AND service_task_id = v_task.id
                      AND due_date = v_task_due_date
                  ) INTO v_exists;

                  IF NOT v_exists THEN
                    INSERT INTO recurring_period_tasks(
                      work_recurring_instance_id, service_task_id, title,
                      description, due_date, priority, estimated_hours,
                      status, sort_order, created_at, updated_at
                    ) VALUES (
                      v_period_id, v_task.id, v_task_title_with_suffix,
                      v_task.description, v_task_due_date, v_task.priority,
                      v_task.estimated_hours, 'pending',
                      COALESCE(v_task.sort_order, 0) + v_month_index * 1000,
                      NOW(), NOW()
                    );
                  END IF;
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '12 month')::date;
    END LOOP;
  END IF;

  RETURN;
END;
$$;
