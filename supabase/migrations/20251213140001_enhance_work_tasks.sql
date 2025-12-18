-- Add assigned_to column to work_task_configs table
ALTER TABLE work_task_configs 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES staff_members(id);

-- Add assigned_to column to recurring_period_tasks table
ALTER TABLE recurring_period_tasks 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES staff_members(id);

-- Helper function to calculate due date based on explicit config values
CREATE OR REPLACE FUNCTION public.calculate_due_date_from_config(
  p_year int,
  p_month int,
  p_exact_due_date date,
  p_due_offset_type text,
  p_due_offset_value int
) RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  p_period_end date;
  v_max_day int;
  v_day_in_month int;
  v_due date;
BEGIN
  -- construct period_end = last day of requested month
  p_period_end := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_due := NULL;

  -- 1. exact_due_date
  IF p_exact_due_date IS NOT NULL THEN
    RETURN p_exact_due_date;
  END IF;

  -- 2. due_offset_type + due_offset_value
  IF p_due_offset_type IS NOT NULL AND p_due_offset_value IS NOT NULL THEN
    IF LOWER(p_due_offset_type) IN ('day','days') THEN
      v_due := (p_period_end + p_due_offset_value)::date;
      RETURN v_due;

    ELSIF LOWER(p_due_offset_type) IN ('month','months') THEN
      v_due := (p_period_end + (p_due_offset_value || ' month')::interval)::date;
      RETURN v_due;

    ELSIF LOWER(p_due_offset_type) = 'day_of_month' THEN
      v_max_day := EXTRACT(DAY FROM p_period_end)::int;
      v_day_in_month := LEAST(GREATEST(p_due_offset_value,1)::int, v_max_day);
      v_due := make_date(
                 EXTRACT(YEAR FROM p_period_end)::int,
                 EXTRACT(MONTH FROM p_period_end)::int,
                 v_day_in_month
               );
      RETURN v_due;
    END IF;
  END IF;

  -- fallback: period_end
  RETURN p_period_end;
END;
$$;

-- Main function updated to use work_task_configs
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

    -- Align to standard quarter start (Jan, Apr, Jul, Oct) if needed, or simple 3-month blocks?
    -- The legacy code did some alignment: (((month-1)/3)*3)+1. Let's keep that.
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

        -- NOW ITERATE OVER WORK_TASK_CONFIGS
        FOR v_task IN
          SELECT wtc.*, 
                 st.title, st.description, st.priority, st.estimated_hours, st.sort_order 
          FROM work_task_configs wtc 
          JOIN service_tasks st ON wtc.service_task_id = st.id
          WHERE wtc.work_id = p_work_id
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
                v_task_due_date := public.calculate_due_date_from_config(
                    EXTRACT(YEAR FROM v_task_period_end)::int,
                    EXTRACT(MONTH FROM v_task_period_end)::int,
                    v_task.exact_due_date,
                    v_task.due_offset_type,
                    v_task.due_offset_value
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
                      AND service_task_id = v_task.service_task_id
                      AND due_date = v_task_due_date
                  ) INTO v_exists;

                  IF NOT v_exists THEN
                    INSERT INTO recurring_period_tasks(
                      work_recurring_instance_id, service_task_id, title,
                      description, due_date, priority, estimated_hours,
                      status, sort_order, created_at, updated_at,
                      assigned_to  -- NEW COLUMN
                    ) VALUES (
                      v_period_id, v_task.service_task_id, v_task_title_with_month,
                      v_task.description, v_task_due_date, v_task.priority,
                      v_task.estimated_hours, 'pending',
                      COALESCE(v_task.sort_order,0) + v_month_index*1000,
                      NOW(), NOW(),
                      v_task.assigned_to 
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
              v_task_due_date := public.calculate_due_date_from_config(
                  EXTRACT(YEAR FROM v_task_period_end)::int,
                  EXTRACT(MONTH FROM v_task_period_end)::int,
                  v_task.exact_due_date,
                  v_task.due_offset_type,
                  v_task.due_offset_value
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
                    AND service_task_id = v_task.service_task_id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id,
                    title, description, due_date,
                    priority, estimated_hours, status, sort_order,
                    created_at, updated_at,
                    assigned_to -- NEW
                  ) VALUES (
                    v_period_id, v_task.service_task_id, v_task.title,
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours,
                    'pending', COALESCE(v_task.sort_order,0),
                    NOW(), NOW(),
                    v_task.assigned_to
                  );
                END IF;
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

        -- NOW ITERATE OVER WORK_TASK_CONFIGS
        FOR v_task IN
          SELECT wtc.*, 
                 st.title, st.description, st.priority, st.estimated_hours, st.sort_order 
          FROM work_task_configs wtc 
          JOIN service_tasks st ON wtc.service_task_id = st.id
          WHERE wtc.work_id = p_work_id
        LOOP
          v_task_recurrence := LOWER(COALESCE(v_task.task_recurrence_type,'monthly'));

          -- Monthly tasks
          IF v_task_recurrence = 'monthly' THEN
            v_task_period_end := v_period_end;

            IF v_task_period_end <= v_current_date THEN
              v_task_due_date := public.calculate_due_date_from_config(
                EXTRACT(YEAR FROM v_task_period_end)::int,
                EXTRACT(MONTH FROM v_task_period_end)::int,
                v_task.exact_due_date,
                v_task.due_offset_type,
                v_task.due_offset_value
              );

              IF v_task_due_date IS NOT NULL
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN

                IF v_period_id IS NULL THEN
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
                END IF;

                v_task_title_with_month :=
                  v_task.title || ' - ' || TRIM(TO_CHAR(v_task_period_end, 'Mon'));

                SELECT EXISTS(
                  SELECT 1 FROM recurring_period_tasks
                  WHERE work_recurring_instance_id = v_period_id
                    AND service_task_id = v_task.service_task_id
                    AND due_date = v_task_due_date
                ) INTO v_exists;

                IF NOT v_exists THEN
                  INSERT INTO recurring_period_tasks(
                    work_recurring_instance_id, service_task_id, title,
                    description, due_date, priority, estimated_hours,
                    status, sort_order, created_at, updated_at,
                    assigned_to -- NEW
                  ) VALUES (
                    v_period_id, v_task.service_task_id, v_task_title_with_month,
                    v_task.description, v_task_due_date,
                    v_task.priority, v_task.estimated_hours, 'pending',
                    COALESCE(v_task.sort_order,0),
                    NOW(), NOW(),
                    v_task.assigned_to 
                  );
                END IF;

              END IF;
            END IF;

          END IF; -- end monthly check
        END LOOP;

      END IF;

      v_iter_m := (v_iter_m + INTERVAL '1 month')::date;
    END LOOP;

  END IF; -- end recurrence type branches

  RETURN;
END;
$$;
