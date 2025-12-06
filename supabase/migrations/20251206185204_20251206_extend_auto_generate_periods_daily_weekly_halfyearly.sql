/*
  # Extend auto_generate_periods_and_tasks for daily, weekly, half-yearly periods

  1. Changes
    - Add support for daily, weekly, and half-yearly work recurrence patterns
    - Implement task filtering by period type:
      * Daily periods: only daily tasks
      * Weekly periods: weekly or daily tasks
      * Monthly periods: monthly, weekly, or daily tasks
      * Quarterly periods: quarterly, monthly, weekly, or daily tasks
      * Half-yearly periods: half-yearly, quarterly, monthly, weekly, or daily tasks
    - Maintain consistent logic with existing monthly/quarterly implementations

  2. Task Recurrence Filtering
    - Each period type only includes tasks with matching or shorter recurrence intervals
    - Daily: shortest period, only daily tasks
    - Weekly: daily + weekly tasks
    - Monthly: daily + weekly + monthly tasks
    - Quarterly: daily + weekly + monthly + quarterly tasks
    - Half-yearly: daily + weekly + monthly + quarterly + half-yearly tasks
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

  v_iter_start date;
  v_period_start date;
  v_period_end date;

  v_iter_m date;
  v_loop_month_start date;
  v_loop_month_end date;

  v_task RECORD;
  v_task_recurrence text;
  v_task_period_end date;
  v_task_due_date date;
  v_loop_index int;

  v_period_id uuid;
  v_period_name text;
  v_exists boolean;
  v_task_title_with_suffix text;

BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  IF NOT FOUND THEN
    RAISE NOTICE 'auto_generate_periods_and_tasks: work % not found', p_work_id;
    RETURN;
  END IF;

  v_work_recurrence := LOWER(COALESCE(v_work.recurrence_pattern, ''));
  v_work_start_date := v_work.start_date;
  v_service_id := v_work.service_id;

  IF v_service_id IS NULL OR v_work_recurrence = '' OR v_work_recurrence = 'one-time' THEN
    RETURN;
  END IF;

  -------------------------------------------------------------------
  -- DAILY WORK
  -------------------------------------------------------------------
  IF v_work_recurrence = 'daily' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_start := v_current_date - INTERVAL '7 day';
    ELSE
      v_iter_start := v_work_start_date;
    END IF;

    WHILE v_iter_start <= v_current_date LOOP
      v_period_start := v_iter_start;
      v_period_end := v_iter_start;
      v_period_id := NULL;

      IF v_period_start <= v_current_date THEN
        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'daily'));

          IF v_task_recurrence = 'daily' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_month(
                v_task.id,
                EXTRACT(YEAR FROM v_task_period_end)::int,
                EXTRACT(MONTH FROM v_task_period_end)::int
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

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
            END IF;
          END IF;
        END LOOP;
      END IF;

      v_iter_start := (v_iter_start + INTERVAL '1 day')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- WEEKLY WORK
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'weekly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_start := date_trunc('week', v_current_date)::date - INTERVAL '1 week';
    ELSE
      v_iter_start := date_trunc('week', v_work_start_date)::date;
    END IF;

    WHILE v_iter_start <= v_current_date LOOP
      v_period_start := v_iter_start;
      v_period_end := (v_iter_start + INTERVAL '6 day')::date;
      v_period_id := NULL;

      IF v_period_start <= v_current_date THEN
        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'weekly'));

          IF v_task_recurrence IN ('weekly', 'daily') THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_month(
                v_task.id,
                EXTRACT(YEAR FROM v_task_period_end)::int,
                EXTRACT(MONTH FROM v_task_period_end)::int
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                SELECT id INTO v_period_id
                FROM work_recurring_instances
                WHERE work_id = p_work_id AND period_end_date = v_period_end
                LIMIT 1;

                IF v_period_id IS NULL THEN
                  v_period_name := 'W' || EXTRACT(WEEK FROM v_period_end)::text
                    || ' ' || EXTRACT(YEAR FROM v_period_end)::text;

                  INSERT INTO work_recurring_instances(
                    work_id, period_name, period_start_date, period_end_date,
                    status, created_at, updated_at
                  ) VALUES (
                    p_work_id, v_period_name, v_period_start, v_period_end,
                    'pending', NOW(), NOW()
                  ) RETURNING id INTO v_period_id;
                END IF;

                v_task_title_with_suffix := v_task.title || ' - W' || EXTRACT(WEEK FROM v_task_period_end)::text;

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
            END IF;
          END IF;
        END LOOP;
      END IF;

      v_iter_start := (v_iter_start + INTERVAL '1 week')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- HALF-YEARLY WORK
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'half-yearly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_start := date_trunc('month', v_current_date)::date - INTERVAL '6 month';
    ELSE
      v_iter_start := date_trunc('month', v_work_start_date)::date;
    END IF;

    v_iter_start := make_date(
      EXTRACT(YEAR FROM v_iter_start)::int,
      (((EXTRACT(MONTH FROM v_iter_start)::int - 1) / 6) * 6) + 1,
      1
    );

    WHILE v_iter_start <= v_current_date LOOP
      v_period_start := v_iter_start;
      v_period_end := (v_period_start + INTERVAL '6 month' - INTERVAL '1 day')::date;
      v_period_id := NULL;

      IF v_period_start <= v_current_date THEN

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'monthly'));

          IF v_task_recurrence IN ('half-yearly', 'quarterly', 'monthly', 'weekly', 'daily') THEN
            FOR v_loop_index IN 0..5 LOOP
              v_loop_month_start := (v_period_start + (v_loop_index || ' month')::interval)::date;
              v_loop_month_end := (date_trunc('month', v_loop_month_start)
                                   + INTERVAL '1 month' - INTERVAL '1 day')::date;

              IF v_task_recurrence = 'monthly' OR v_task_recurrence = 'weekly' OR v_task_recurrence = 'daily' THEN
                v_task_period_end := v_loop_month_end;

                IF v_task_period_end <= v_current_date THEN
                  v_task_due_date := public.calculate_task_due_date_in_month(
                    v_task.id,
                    EXTRACT(YEAR FROM v_task_period_end)::int,
                    EXTRACT(MONTH FROM v_task_period_end)::int
                  );

                  IF v_task_due_date IS NOT NULL
                    AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                    IF v_period_id IS NULL THEN
                      SELECT id INTO v_period_id
                      FROM work_recurring_instances
                      WHERE work_id = p_work_id
                        AND period_end_date = v_period_end
                      LIMIT 1;

                      IF v_period_id IS NULL THEN
                        v_period_name := 'H' ||
                          (((EXTRACT(MONTH FROM v_period_start)::int - 1) / 6) + 1)::int::text
                          || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

                        INSERT INTO work_recurring_instances(
                          work_id, period_name, period_start_date, period_end_date,
                          status, created_at, updated_at
                        ) VALUES (
                          p_work_id, v_period_name, v_period_start, v_period_end,
                          'pending', NOW(), NOW()
                        ) RETURNING id INTO v_period_id;
                      END IF;
                    END IF;

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
                        COALESCE(v_task.sort_order, 0) + v_loop_index * 1000,
                        NOW(), NOW()
                      );
                    END IF;

                  END IF;
                END IF;

              ELSIF v_task_recurrence = 'quarterly' THEN
                IF v_loop_index % 3 = 0 THEN
                  v_task_period_end := v_loop_month_end;

                  IF v_task_period_end <= v_current_date THEN
                    v_task_due_date := public.calculate_task_due_date_in_month(
                      v_task.id,
                      EXTRACT(YEAR FROM v_task_period_end)::int,
                      EXTRACT(MONTH FROM v_task_period_end)::int
                    );

                    IF v_task_due_date IS NOT NULL
                      AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                      IF v_period_id IS NULL THEN
                        SELECT id INTO v_period_id
                        FROM work_recurring_instances
                        WHERE work_id = p_work_id
                          AND period_end_date = v_period_end
                        LIMIT 1;

                        IF v_period_id IS NULL THEN
                          v_period_name := 'H' ||
                            (((EXTRACT(MONTH FROM v_period_start)::int - 1) / 6) + 1)::int::text
                            || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

                          INSERT INTO work_recurring_instances(
                            work_id, period_name, period_start_date, period_end_date,
                            status, created_at, updated_at
                          ) VALUES (
                            p_work_id, v_period_name, v_period_start, v_period_end,
                            'pending', NOW(), NOW()
                          ) RETURNING id INTO v_period_id;
                        END IF;
                      END IF;

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
                          COALESCE(v_task.sort_order, 0) + v_loop_index * 1000,
                          NOW(), NOW()
                        );
                      END IF;

                    END IF;
                  END IF;
                END IF;

              ELSIF v_task_recurrence = 'half-yearly' THEN
                IF v_loop_index = 5 THEN
                  v_task_period_end := v_period_end;

                  IF v_task_period_end <= v_current_date THEN
                    v_task_due_date := public.calculate_task_due_date_in_month(
                      v_task.id,
                      EXTRACT(YEAR FROM v_task_period_end)::int,
                      EXTRACT(MONTH FROM v_task_period_end)::int
                    );

                    IF v_task_due_date IS NOT NULL
                      AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                      IF v_period_id IS NULL THEN
                        SELECT id INTO v_period_id
                        FROM work_recurring_instances
                        WHERE work_id = p_work_id
                          AND period_end_date = v_period_end
                        LIMIT 1;

                        IF v_period_id IS NULL THEN
                          v_period_name := 'H' ||
                            (((EXTRACT(MONTH FROM v_period_start)::int - 1) / 6) + 1)::int::text
                            || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

                          INSERT INTO work_recurring_instances(
                            work_id, period_name, period_start_date, period_end_date,
                            status, created_at, updated_at
                          ) VALUES (
                            p_work_id, v_period_name, v_period_start, v_period_end,
                            'pending', NOW(), NOW()
                          ) RETURNING id INTO v_period_id;
                        END IF;
                      END IF;

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
                  END IF;
                END IF;

              END IF;
            END LOOP;
          END IF;
        END LOOP;

      END IF;

      v_iter_start := (v_iter_start + INTERVAL '6 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- QUARTERLY WORK
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'quarterly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_start := date_trunc('month', v_current_date)::date - INTERVAL '3 month';
    ELSE
      v_iter_start := date_trunc('month', (v_work_start_date - INTERVAL '3 month'))::date;
    END IF;

    v_iter_start := make_date(
      EXTRACT(YEAR FROM v_iter_start)::int,
      (((EXTRACT(MONTH FROM v_iter_start)::int - 1) / 3) * 3) + 1,
      1
    );

    WHILE v_iter_start <= v_current_date LOOP
      v_period_start := v_iter_start;
      v_period_end := (v_period_start + INTERVAL '3 month' - INTERVAL '1 day')::date;
      v_period_id := NULL;

      IF v_period_start <= v_current_date THEN

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'monthly'));

          IF v_task_recurrence IN ('quarterly', 'monthly', 'weekly', 'daily') THEN
            FOR v_loop_index IN 0..2 LOOP
              v_loop_month_start := (v_period_start + (v_loop_index || ' month')::interval)::date;
              v_loop_month_end := (date_trunc('month', v_loop_month_start)
                                   + INTERVAL '1 month' - INTERVAL '1 day')::date;

              IF v_task_recurrence = 'monthly' OR v_task_recurrence = 'weekly' OR v_task_recurrence = 'daily' THEN
                v_task_period_end := v_loop_month_end;

                IF v_task_period_end <= v_current_date THEN
                  v_task_due_date := public.calculate_task_due_date_in_month(
                    v_task.id,
                    EXTRACT(YEAR FROM v_task_period_end)::int,
                    EXTRACT(MONTH FROM v_task_period_end)::int
                  );

                  IF v_task_due_date IS NOT NULL
                    AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                    IF v_period_id IS NULL THEN
                      SELECT id INTO v_period_id
                      FROM work_recurring_instances
                      WHERE work_id = p_work_id
                        AND period_end_date = v_period_end
                      LIMIT 1;

                      IF v_period_id IS NULL THEN
                        v_period_name := 'Q' ||
                          (((EXTRACT(MONTH FROM v_period_start)::int - 1) / 3) + 1)::int::text
                          || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

                        INSERT INTO work_recurring_instances(
                          work_id, period_name, period_start_date, period_end_date,
                          status, created_at, updated_at
                        ) VALUES (
                          p_work_id, v_period_name, v_period_start, v_period_end,
                          'pending', NOW(), NOW()
                        ) RETURNING id INTO v_period_id;
                      END IF;
                    END IF;

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
                        COALESCE(v_task.sort_order, 0) + v_loop_index * 1000,
                        NOW(), NOW()
                      );
                    END IF;

                  END IF;
                END IF;

              ELSIF v_task_recurrence = 'quarterly' THEN
                v_task_period_end := v_period_end;

                IF v_task_period_end <= v_current_date THEN
                  v_task_due_date := public.calculate_task_due_date_in_month(
                    v_task.id,
                    EXTRACT(YEAR FROM v_task_period_end)::int,
                    EXTRACT(MONTH FROM v_task_period_end)::int
                  );

                  IF v_task_due_date IS NOT NULL
                    AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                    IF v_period_id IS NULL THEN
                      SELECT id INTO v_period_id
                      FROM work_recurring_instances
                      WHERE work_id = p_work_id AND period_end_date = v_period_end
                      LIMIT 1;

                      IF v_period_id IS NULL THEN
                        v_period_name := 'Q' ||
                          (((EXTRACT(MONTH FROM v_period_start)::int - 1) / 3) + 1)::int::text
                          || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

                        INSERT INTO work_recurring_instances(
                          work_id, period_name, period_start_date,
                          period_end_date, status, created_at, updated_at
                        ) VALUES (
                          p_work_id, v_period_name, v_period_start,
                          v_period_end, 'pending', NOW(), NOW()
                        )
                        RETURNING id INTO v_period_id;
                      END IF;
                    END IF;

                    SELECT EXISTS(
                      SELECT 1 FROM recurring_period_tasks
                      WHERE work_recurring_instance_id = v_period_id
                        AND service_task_id = v_task.id
                        AND due_date = v_task_due_date
                    ) INTO v_exists;

                    IF NOT v_exists THEN
                      INSERT INTO recurring_period_tasks(
                        work_recurring_instance_id, service_task_id,
                        title, description, due_date,
                        priority, estimated_hours, status, sort_order,
                        created_at, updated_at
                      ) VALUES (
                        v_period_id, v_task.id, v_task.title,
                        v_task.description, v_task_due_date,
                        v_task.priority, v_task.estimated_hours,
                        'pending', COALESCE(v_task.sort_order, 0),
                        NOW(), NOW()
                      );
                    END IF;
                  END IF;
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;

      END IF;

      v_iter_start := (v_iter_start + INTERVAL '3 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- MONTHLY WORK
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'monthly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_m := date_trunc('month', v_current_date)::date - INTERVAL '1 month';
    ELSE
      v_iter_m := date_trunc('month', v_work_start_date)::date - INTERVAL '1 month';
    END IF;

    WHILE v_iter_m <= v_current_date LOOP
      v_period_start := v_iter_m;
      v_period_end := (date_trunc('month', v_iter_m)
                       + INTERVAL '1 month' - INTERVAL '1 day')::date;
      v_period_id := NULL;

      IF v_period_start <= v_current_date THEN

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'monthly'));

          IF v_task_recurrence IN ('monthly', 'weekly', 'daily') THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_month(
                v_task.id,
                EXTRACT(YEAR FROM v_task_period_end)::int,
                EXTRACT(MONTH FROM v_task_period_end)::int
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

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
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order, 0),
                    NOW(), NOW()
                  );
                END IF;

              END IF;
            END IF;

          END IF;

        END LOOP;

      END IF;

      v_iter_m := (v_iter_m + INTERVAL '1 month')::date;
    END LOOP;

  END IF;

  RETURN;
END;
$$;
