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

  -- iteration variables
  v_iter_date date;
  v_period_start date;
  v_period_end date;
  
  -- task variables
  v_task RECORD;
  v_task_recurrence text;
  v_task_period_end date;
  v_task_due_date date;
  v_month_index int;
  v_quarter_index int;
  v_half_year_index int;
  
  -- other variables
  v_period_id uuid;
  v_period_name text;
  v_exists boolean;
  v_task_title_with_suffix text;
  
  -- quarter/half-year/year specific
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

      IF v_period_end <= v_current_date THEN
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
          v_task_due_date := public.calculate_task_due_date_in_period(
            v_task.id, v_period_start, v_period_end
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

      IF v_period_end <= v_current_date THEN
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
            v_task_due_date := public.calculate_task_due_date_in_period(
              v_task.id, v_period_start, v_period_end
            );

            IF v_task_due_date IS NOT NULL THEN
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
      v_period_end := (date_trunc('month', v_iter_date)
                       + INTERVAL '1 month' - INTERVAL '1 day')::date;

      IF v_period_end <= v_current_date THEN
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
            v_task_due_date := public.calculate_task_due_date_in_period(
              v_task.id, v_period_start, v_period_end
            );

            IF v_task_due_date IS NOT NULL THEN
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
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '1 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- QUARTERLY WORK (Financial Quarters starting from April)
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'quarterly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '3 month';
    ELSE
      v_iter_date := date_trunc('month', (v_work_start_date - INTERVAL '3 month'))::date;
    END IF;

    -- Adjust to start from April for financial year
    v_iter_date := make_date(
        EXTRACT(YEAR FROM v_iter_date)::int,
        CASE 
          WHEN EXTRACT(MONTH FROM v_iter_date)::int >= 4 THEN 
            (((EXTRACT(MONTH FROM v_iter_date)::int - 4) / 3) * 3) + 4
          ELSE
            (((EXTRACT(MONTH FROM v_iter_date)::int + 8) / 3) * 3) + 4 - 12
        END,
        1
    );

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_period_start + INTERVAL '3 month' - INTERVAL '1 day')::date;

      IF v_period_start <= v_current_date THEN
        -- Check if period already exists
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          -- Calculate quarter number (1-4) starting from April
          v_month_num := EXTRACT(MONTH FROM v_period_start)::int;
          IF v_month_num >= 4 AND v_month_num <= 6 THEN
            v_quarter_num := 1;
          ELSIF v_month_num >= 7 AND v_month_num <= 9 THEN
            v_quarter_num := 2;
          ELSIF v_month_num >= 10 AND v_month_num <= 12 THEN
            v_quarter_num := 3;
          ELSE
            v_quarter_num := 4;
          END IF;
          
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
          AND LOWER(COALESCE(task_recurrence_type, 'monthly')) IN ('quarterly', 'monthly', 'weekly', 'daily')
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type, 'monthly'));
          
          -------------------------------------------------------------------
          -- Monthly tasks inside quarter
          -------------------------------------------------------------------
          IF v_task_recurrence IN ('monthly', 'weekly', 'daily') THEN
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

          -------------------------------------------------------------------
          -- Quarterly tasks
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'quarterly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, v_period_start, v_period_end
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
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '3 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- HALF-YEARLY WORK (Financial Half-years: H1=Apr-Sep, H2=Oct-Mar)
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'half-yearly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '6 month';
    ELSE
      v_iter_date := date_trunc('month', v_work_start_date)::date - INTERVAL '6 month';
    END IF;

    -- Adjust to start from April for financial year
    IF EXTRACT(MONTH FROM v_iter_date)::int BETWEEN 4 AND 9 THEN
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int, 4, 1);
    ELSIF EXTRACT(MONTH FROM v_iter_date)::int >= 10 THEN
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int, 10, 1);
    ELSE
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int - 1, 10, 1);
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_period_start + INTERVAL '6 month' - INTERVAL '1 day')::date;

      IF v_period_start <= v_current_date THEN
        -- Check if period already exists
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          -- Calculate half-year number (1-2) starting from April
          IF EXTRACT(MONTH FROM v_period_start)::int = 4 THEN
            v_half_year_num := 1;
            v_period_name := 'H1 ' || EXTRACT(YEAR FROM v_period_start)::int;
          ELSE
            v_half_year_num := 2;
            v_period_name := 'H2 ' || EXTRACT(YEAR FROM v_period_start)::int;
          END IF;

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
          
          -------------------------------------------------------------------
          -- Monthly tasks inside half-year
          -------------------------------------------------------------------
          IF v_task_recurrence IN ('monthly', 'weekly', 'daily') THEN
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

          -------------------------------------------------------------------
          -- Quarterly tasks inside half-year
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'quarterly' THEN
            FOR v_quarter_index IN 0..1 LOOP
              v_task_period_end := (v_period_start + (v_quarter_index * 3 || ' month')::interval)::date;
              v_task_period_end := (v_task_period_end + INTERVAL '3 month' - INTERVAL '1 day')::date;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_period(
                  v_task.id, (v_task_period_end - INTERVAL '3 month' + INTERVAL '1 day')::date, v_task_period_end
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
                      COALESCE(v_task.sort_order, 0) + v_quarter_index * 1000,
                      NOW(), NOW()
                    );
                  END IF;
                END IF;
              END IF;
            END LOOP;

          -------------------------------------------------------------------
          -- Half-yearly tasks
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'half-yearly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, v_period_start, v_period_end
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
          END IF;
        END LOOP;
      END IF;

      v_iter_date := (v_iter_date + INTERVAL '6 month')::date;
    END LOOP;

  -------------------------------------------------------------------
  -- YEARLY WORK (Financial Year: April 1 to March 31) - FIXED
  -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'yearly' THEN
    IF v_work_start_date IS NULL THEN
      v_iter_date := date_trunc('month', v_current_date)::date - INTERVAL '12 month';
    ELSE
      v_iter_date := date_trunc('month', v_work_start_date)::date - INTERVAL '12 month';
    END IF;

    -- Adjust to start from April for financial year
    IF EXTRACT(MONTH FROM v_iter_date)::int < 4 THEN
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int - 1, 4, 1);
    ELSE
      v_iter_date := make_date(EXTRACT(YEAR FROM v_iter_date)::int, 4, 1);
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := (v_period_start + INTERVAL '12 month' - INTERVAL '1 day')::date;

      IF v_period_start <= v_current_date THEN
        -- Check if period already exists
        SELECT id INTO v_period_id
        FROM work_recurring_instances
        WHERE work_id = p_work_id AND period_end_date = v_period_end
        LIMIT 1;

        IF v_period_id IS NULL THEN
          -- Financial year format: 2024-25 for April 2024 to March 2025
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
          
          -------------------------------------------------------------------
          -- Yearly tasks
          -------------------------------------------------------------------
          IF v_task_recurrence = 'yearly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_task_due_date_in_period(
                v_task.id, v_period_start, v_period_end
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

          -------------------------------------------------------------------
          -- Monthly tasks inside year
          -------------------------------------------------------------------
          ELSIF v_task_recurrence IN ('monthly', 'weekly', 'daily') THEN
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

          -------------------------------------------------------------------
          -- Quarterly tasks inside year
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'quarterly' THEN
            FOR v_quarter_index IN 0..3 LOOP
              v_task_period_end := (v_period_start + (v_quarter_index * 3 || ' month')::interval)::date;
              v_task_period_end := (v_task_period_end + INTERVAL '3 month' - INTERVAL '1 day')::date;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_period(
                  v_task.id, (v_task_period_end - INTERVAL '3 month' + INTERVAL '1 day')::date, v_task_period_end
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
                      COALESCE(v_task.sort_order, 0) + v_quarter_index * 1000,
                      NOW(), NOW()
                    );
                  END IF;
                END IF;
              END IF;
            END LOOP;

          -------------------------------------------------------------------
          -- Half-yearly tasks inside year
          -------------------------------------------------------------------
          ELSIF v_task_recurrence = 'half-yearly' THEN
            FOR v_half_year_index IN 0..1 LOOP
              v_task_period_end := (v_period_start + (v_half_year_index * 6 || ' month')::interval)::date;
              v_task_period_end := (v_task_period_end + INTERVAL '6 month' - INTERVAL '1 day')::date;

              IF v_task_period_end <= v_current_date THEN
                v_task_due_date := public.calculate_task_due_date_in_period(
                  v_task.id, (v_task_period_end - INTERVAL '6 month' + INTERVAL '1 day')::date, v_task_period_end
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
                      COALESCE(v_task.sort_order, 0) + v_half_year_index * 1000,
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