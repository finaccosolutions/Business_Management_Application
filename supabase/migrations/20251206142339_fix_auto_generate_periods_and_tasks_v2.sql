-- Helper function used by UI/triggers: compute due date for a task in a specific year/month
CREATE OR REPLACE FUNCTION public.calculate_task_due_date_in_month(
  p_task_id uuid,
  p_year int,
  p_month int
) RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  t service_tasks%ROWTYPE;
  p_period_end date;
  v_max_day int;
  v_day_in_month int;
  v_due date;
BEGIN
  SELECT * INTO t FROM service_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- construct period_end = last day of requested month
  p_period_end := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;

  v_due := NULL;

  -- priority:
  -- 1. exact_due_date
  -- 2. specific_period_dates keyed by period_end::text
  -- 3. due_offset_type + due_offset_value (day/month/day_of_month / days/months)
  -- 4. due_date_offset_days
  -- 5. due_day_of_month
  -- fallback: period_end

  IF t.exact_due_date IS NOT NULL THEN
    v_due := t.exact_due_date;
    RETURN v_due;
  END IF;

  IF t.specific_period_dates IS NOT NULL AND (t.specific_period_dates ? p_period_end::text) THEN
    v_due := (t.specific_period_dates ->> p_period_end::text)::date;
    RETURN v_due;
  END IF;

  IF t.due_offset_type IS NOT NULL AND t.due_offset_value IS NOT NULL THEN
    IF LOWER(t.due_offset_type) IN ('day','days') THEN
      v_due := (p_period_end + t.due_offset_value)::date;
      RETURN v_due;

    ELSIF LOWER(t.due_offset_type) IN ('month','months') THEN
      v_due := (p_period_end + (t.due_offset_value || ' month')::interval)::date;
      RETURN v_due;

    ELSIF LOWER(t.due_offset_type) = 'day_of_month' THEN
      v_max_day := EXTRACT(DAY FROM p_period_end)::int;
      v_day_in_month := LEAST(GREATEST(t.due_offset_value,1)::int, v_max_day);
      v_due := make_date(EXTRACT(YEAR FROM p_period_end)::int,
                         EXTRACT(MONTH FROM p_period_end)::int,
                         v_day_in_month);
      RETURN v_due;
    END IF;
  END IF;

  IF t.due_date_offset_days IS NOT NULL THEN
    v_due := (p_period_end + t.due_date_offset_days)::date;
    RETURN v_due;
  END IF;

  IF t.due_day_of_month IS NOT NULL THEN
    v_max_day := EXTRACT(DAY FROM p_period_end)::int;
    v_day_in_month := LEAST(GREATEST(t.due_day_of_month,1)::int, v_max_day);
    v_due := make_date(EXTRACT(YEAR FROM p_period_end)::int,
                       EXTRACT(MONTH FROM p_period_end)::int,
                       v_day_in_month);
    RETURN v_due;
  END IF;

  -- fallback
  v_due := p_period_end;
  RETURN v_due;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'calculate_task_due_date_in_month error for task %/%: %',
           p_task_id, p_year, SQLERRM;
    RETURN NULL;
END;
$$;


-- Main function (updated). Generates recurring periods & tasks for a work.
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

  -- quarter iteration
  v_iter_q_start date;
  v_period_start date;
  v_period_end date;

  -- month iteration
  v_iter_m date;
  v_loop_month_start date;
  v_loop_month_end date;

  v_task RECORD;
  v_task_recurrence text;
  v_task_period_end date;
  v_task_due_date date;
  v_month_index int;

  v_period_id uuid;
  v_period_name text;
  v_exists boolean;
  v_task_title_with_month text;

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
  -- QUARTERLY WORK
  -------------------------------------------------------------------
  IF v_work_recurrence = 'quarterly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_q_start := date_trunc('month', v_current_date)::date - INTERVAL '3 month';
    ELSE
      v_iter_q_start := date_trunc('month', (v_work_start_date - INTERVAL '3 month'))::date;
    END IF;

    v_iter_q_start := make_date(
        EXTRACT(YEAR FROM v_iter_q_start)::int,
        (((EXTRACT(MONTH FROM v_iter_q_start)::int - 1) / 3) * 3) + 1,
        1
    );

    WHILE v_iter_q_start <= v_current_date LOOP
      v_period_start := v_iter_q_start;
      v_period_end := (v_period_start + INTERVAL '3 month' - INTERVAL '1 day')::date;
      v_period_id := NULL;

      IF v_period_start <= v_current_date THEN

        FOR v_task IN
          SELECT * FROM service_tasks
          WHERE service_id = v_service_id AND COALESCE(is_active, true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type,'monthly'));

          -------------------------------------------------------------------
          -- Monthly tasks inside quarter
          -------------------------------------------------------------------
          IF v_task_recurrence = 'monthly' THEN
            FOR v_month_index IN 0..2 LOOP
              v_loop_month_start := (v_period_start + (v_month_index || ' month')::interval)::date;
              v_loop_month_end := (date_trunc('month', v_loop_month_start)
                                        + INTERVAL '1 month' - INTERVAL '1 day')::date;
              v_task_period_end := v_loop_month_end;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_month(
                    v_task.id,
                    EXTRACT(YEAR FROM v_task_period_end)::int,
                    EXTRACT(MONTH FROM v_task_period_end)::int
                );

                IF v_task_due_date IS NOT NULL
                   AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                   AND v_task_due_date <= v_current_date THEN

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
                      ) VALUES(
                        p_work_id, v_period_name, v_period_start, v_period_end,
                        'pending', NOW(), NOW()
                      ) RETURNING id INTO v_period_id;
                    END IF;
                  END IF;

                  v_task_title_with_month :=
                    v_task.title || ' - ' || TRIM(TO_CHAR(v_task_period_end, 'Mon'));

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
                      v_period_id, v_task.id, v_task_title_with_month,
                      v_task.description, v_task_due_date, v_task.priority,
                      v_task.estimated_hours, 'pending',
                      COALESCE(v_task.sort_order,0) + v_month_index*1000,
                      NOW(), NOW()
                    );
                  END IF;

                END IF;
              END IF;
            END LOOP;

          -------------------------------------------------------------------
          -- Quarterly tasks
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'quarterly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_month(
                  v_task.id,
                  EXTRACT(YEAR FROM v_task_period_end)::int,
                  EXTRACT(MONTH FROM v_task_period_end)::int
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                AND v_task_due_date <= v_current_date THEN

                IF v_period_id IS NULL THEN
                  SELECT id INTO v_period_id
                  FROM work_recurring_instances
                  WHERE work_id = p_work_id AND period_end_date = v_period_end
                  LIMIT 1;

                  IF v_period_id IS NULL THEN
                    v_period_name := 'Q' ||
                      (((EXTRACT(MONTH FROM v_period_start)::int - 1)/3)+1)::int::text
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
                    'pending', COALESCE(v_task.sort_order,0),
                    NOW(), NOW()
                  );
                END IF;
              END IF;
            END IF;

          -------------------------------------------------------------------
          -- Yearly or fallback
          -------------------------------------------------------------------
          ELSE
            v_task_period_end := v_period_end;
            v_task_due_date := public.calculate_task_due_date_in_month(
              v_task.id,
              EXTRACT(YEAR FROM v_task_period_end)::int,
              EXTRACT(MONTH FROM v_task_period_end)::int
            );

            IF v_task_due_date IS NOT NULL
              AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
              AND v_task_due_date <= v_current_date THEN

              IF v_period_id IS NULL THEN
                SELECT id INTO v_period_id
                FROM work_recurring_instances
                WHERE work_id = p_work_id AND period_end_date = v_period_end
                LIMIT 1;

                IF v_period_id IS NULL THEN
                  v_period_name := 'Q' ||
                    (((EXTRACT(MONTH FROM v_period_start)::int - 1)/3)+1)::int::text
                    || ' ' || EXTRACT(YEAR FROM v_period_start)::int;

                  INSERT INTO work_recurring_instances(
                    work_id, period_name, period_start_date, period_end_date,
                    status, created_at, updated_at
                  ) VALUES (
                    p_work_id, v_period_name, v_period_start,
                    v_period_end, 'pending', NOW(), NOW()
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
                  COALESCE(v_task.sort_order,0),
                  NOW(), NOW()
                );
              END IF;

            END IF;
          END IF;
        END LOOP;

      END IF;

      v_iter_q_start := (v_iter_q_start + INTERVAL '3 month')::date;
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
          WHERE service_id = v_service_id AND COALESCE(is_active,true)
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type,'monthly'));

          -------------------------------------------------------------------
          -- Monthly tasks
          -------------------------------------------------------------------
          IF v_task_recurrence = 'monthly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_month(
                v_task.id,
                EXTRACT(YEAR FROM v_task_period_end)::int,
                EXTRACT(MONTH FROM v_task_period_end)::int
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                AND v_task_due_date <= v_current_date THEN

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

                v_task_title_with_month :=
                  v_task.title || ' - ' || TRIM(TO_CHAR(v_task_period_end, 'Mon'));

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
                    v_period_id, v_task.id, v_task_title_with_month,
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order,0),
                    NOW(), NOW()
                  );
                END IF;

              END IF;
            END IF;

          -------------------------------------------------------------------
          -- Quarterly tasks inside monthly work
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'quarterly' THEN
            v_loop_month_start := v_period_start;

            v_task_period_end :=
              (
                make_date(
                  EXTRACT(YEAR FROM v_loop_month_start)::int,
                  (((EXTRACT(MONTH FROM v_loop_month_start)::int - 1)/3)*3)+1,
                  1
                )
                + INTERVAL '3 month' - INTERVAL '1 day'
              )::date;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_month(
                v_task.id,
                EXTRACT(YEAR FROM v_task_period_end)::int,
                EXTRACT(MONTH FROM v_task_period_end)::int
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                AND v_task_due_date <= v_current_date THEN

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
                    p_work_id, v_period_name, v_period_start,
                    v_period_end, 'pending', NOW(), NOW()
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
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours,
                    'pending', COALESCE(v_task.sort_order,0),
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

  END IF; -- end recurrence type branches

  RETURN;
END;
$$;
