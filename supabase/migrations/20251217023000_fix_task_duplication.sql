-- Fix duplicate task generation by ignoring due_date in uniqueness check for 1:1 recurrences
-- This prevents generating a second task if the due date calculation logic changes.

CREATE OR REPLACE FUNCTION public.auto_generate_periods_and_tasks(p_work_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_work RECORD;
  v_work_recurrence text;
  v_work_start_date date;
  v_service_id uuid;
  v_current_date date := CURRENT_DATE;
  v_fy_start_month int;
  v_weekly_start_day text;
  
  v_monthly_start_day int;
  v_quarterly_start_day int;
  v_half_yearly_start_day int;
  v_yearly_start_day int;

  v_iter_date date;
  v_period_start date;
  v_period_end date;

  v_task_record RECORD; 
  v_task_recurrence text;
  v_task_period_end date;
  v_task_due_date date;
  v_period_id uuid;
  v_has_qualifying_task boolean;
  v_period_name text;
  
  i int;
  v_dow int;
  v_target_dow int;

BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_work_recurrence := LOWER(COALESCE(v_work.recurrence_pattern, ''));
  v_work_start_date := v_work.start_date;
  v_service_id := v_work.service_id;
  v_fy_start_month := COALESCE(v_work.financial_year_start_month, 4);
  v_weekly_start_day := COALESCE(v_work.weekly_start_day, 'monday');
  
  v_monthly_start_day := COALESCE(v_work.monthly_start_day, 1);
  v_quarterly_start_day := COALESCE(v_work.quarterly_start_day, 1);
  v_half_yearly_start_day := COALESCE(v_work.half_yearly_start_day, 1);
  v_yearly_start_day := COALESCE(v_work.yearly_start_day, 1);

  IF v_service_id IS NULL OR v_work_recurrence = '' OR v_work_recurrence = 'one-time' THEN RETURN; END IF;

  -- -------------------------------------------------------------------
  -- DAILY WORK
  -- -------------------------------------------------------------------
  IF v_work_recurrence = 'daily' THEN
    IF v_work_start_date IS NULL THEN v_iter_date := v_current_date - INTERVAL '30 days';
    ELSE v_iter_date := v_work_start_date; END IF;

    WHILE v_iter_date <= v_current_date LOOP
      v_period_start := v_iter_date;
      v_period_end := v_iter_date;
      v_has_qualifying_task := false;
      
      -- Check qualifiers first
      FOR v_task_record IN 
        SELECT st.*, wtc.recurrence_start_day, wtc.recurrence_start_month, wtc.exact_due_date as config_exact_date, 
               COALESCE(wtc.task_recurrence_type, st.task_recurrence_type, v_work_recurrence) as effective_recurrence,
               COALESCE(wtc.due_offset_type, st.due_offset_type) as due_offset_type,
               COALESCE(wtc.due_offset_value, st.due_offset_value) as due_offset_value
        FROM service_tasks st
        LEFT JOIN work_task_configs wtc ON wtc.service_task_id = st.id AND wtc.work_id = p_work_id
        WHERE st.service_id = v_service_id AND st.is_active = true
      LOOP
         IF v_task_record.start_date IS NOT NULL AND v_period_end < v_task_record.start_date THEN CONTINUE; END IF;
         IF LOWER(COALESCE(v_task_record.effective_recurrence, 'daily')) = 'daily' THEN
            v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_period_start, v_period_end);
            IF v_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
               v_has_qualifying_task := true; EXIT; 
            END IF;
         END IF;
      END LOOP;

      IF v_has_qualifying_task THEN
         SELECT id INTO v_period_id FROM work_recurring_instances WHERE work_id = p_work_id AND period_end_date = v_period_end LIMIT 1;
         IF v_period_id IS NULL THEN
            INSERT INTO work_recurring_instances(work_id, period_name, period_start_date, period_end_date, status)
            VALUES (p_work_id, TO_CHAR(v_period_end, 'YYYY-MM-DD'), v_period_start, v_period_end, 'pending')
            RETURNING id INTO v_period_id;
         END IF;

         FOR v_task_record IN 
             SELECT st.*, wtc.recurrence_start_day, wtc.recurrence_start_month, wtc.exact_due_date as config_exact_date, 
               COALESCE(wtc.task_recurrence_type, st.task_recurrence_type, v_work_recurrence) as effective_recurrence,
               COALESCE(wtc.due_offset_type, st.due_offset_type) as due_offset_type,
               COALESCE(wtc.due_offset_value, st.due_offset_value) as due_offset_value
            FROM service_tasks st
            LEFT JOIN work_task_configs wtc ON wtc.service_task_id = st.id AND wtc.work_id = p_work_id
            WHERE st.service_id = v_service_id AND st.is_active = true
         LOOP
            IF v_task_record.start_date IS NOT NULL AND v_period_end < v_task_record.start_date THEN CONTINUE; END IF;
            IF LOWER(COALESCE(v_task_record.effective_recurrence, 'daily')) = 'daily' THEN
               v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_period_start, v_period_end);
               IF v_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                  -- DAILY uniqueness: 1 per day/task.
                  INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                  SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                  WHERE NOT EXISTS (
                      SELECT 1 FROM recurring_period_tasks 
                      WHERE work_recurring_instance_id = v_period_id 
                      AND service_task_id = v_task_record.id 
                      -- For daily, we can stick to period instance check because period is daily.
                  );
               END IF;
            END IF;
         END LOOP;
      END IF;
      v_iter_date := (v_iter_date + INTERVAL '1 day')::date;
    END LOOP;

  -- -------------------------------------------------------------------
  -- WEEKLY WORK
  -- -------------------------------------------------------------------
  ELSIF v_work_recurrence = 'weekly' THEN
    IF v_work_start_date IS NULL THEN v_iter_date := public.get_week_start_date(v_current_date - INTERVAL '1 week', v_weekly_start_day);
    ELSE v_iter_date := public.get_week_start_date(v_work_start_date, v_weekly_start_day); END IF;

    WHILE v_iter_date <= v_current_date LOOP
       v_period_start := v_iter_date;
       v_period_end := (v_iter_date + INTERVAL '6 days')::date;
       v_has_qualifying_task := false;
       v_period_id := NULL;

       -- Check qualifiers
       FOR v_task_record IN 
          SELECT st.*, wtc.recurrence_start_day, wtc.recurrence_start_month, wtc.exact_due_date as config_exact_date, 
                 COALESCE(wtc.task_recurrence_type, st.task_recurrence_type, v_work_recurrence) as effective_recurrence,
                 COALESCE(wtc.due_offset_type, st.due_offset_type) as due_offset_type,
                 COALESCE(wtc.due_offset_value, st.due_offset_value) as due_offset_value
          FROM service_tasks st
          LEFT JOIN work_task_configs wtc ON wtc.service_task_id = st.id AND wtc.work_id = p_work_id
          WHERE st.service_id = v_service_id AND st.is_active = true
       LOOP
          IF v_task_record.start_date IS NOT NULL AND v_period_end < v_task_record.start_date THEN CONTINUE; END IF;
          v_task_recurrence := LOWER(COALESCE(v_task_record.effective_recurrence, 'weekly'));
          
          IF v_task_recurrence = 'weekly' THEN
              v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_period_start, v_period_end);
              IF v_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                 v_has_qualifying_task := true; EXIT;
              END IF;
          ELSIF v_task_recurrence = 'daily' THEN
              FOR i IN 0..6 LOOP
                  v_task_period_end := (v_period_start + (i || ' day')::interval)::date;
                  IF v_task_record.start_date IS NULL OR v_task_period_end >= v_task_record.start_date THEN
                     v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, v_task_period_end);
                     IF v_task_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN 
                        v_has_qualifying_task := true; EXIT; 
                     END IF;
                  END IF;
              END LOOP;
              IF v_has_qualifying_task THEN EXIT; END IF;
          END IF;
       END LOOP;

       IF v_has_qualifying_task THEN
          SELECT id INTO v_period_id FROM work_recurring_instances WHERE work_id = p_work_id AND period_end_date = v_period_end LIMIT 1;
          IF v_period_id IS NULL THEN
             INSERT INTO work_recurring_instances(work_id, period_name, period_start_date, period_end_date, status)
             VALUES (p_work_id, 'Week ' || public.get_week_number_in_month(v_period_end, v_weekly_start_day)::text || ' (' || TO_CHAR(v_period_start, 'Mon DD') || ' - ' || TO_CHAR(v_period_end, 'Mon DD') || ')', v_period_start, v_period_end, 'pending')
             RETURNING id INTO v_period_id;
          END IF;

          FOR v_task_record IN 
             SELECT st.*, wtc.recurrence_start_day, wtc.recurrence_start_month, wtc.exact_due_date as config_exact_date, 
                 COALESCE(wtc.task_recurrence_type, st.task_recurrence_type, v_work_recurrence) as effective_recurrence,
                 COALESCE(wtc.due_offset_type, st.due_offset_type) as due_offset_type,
                 COALESCE(wtc.due_offset_value, st.due_offset_value) as due_offset_value
             FROM service_tasks st
             LEFT JOIN work_task_configs wtc ON wtc.service_task_id = st.id AND wtc.work_id = p_work_id
             WHERE st.service_id = v_service_id AND st.is_active = true
          LOOP
             IF v_task_record.start_date IS NOT NULL AND v_period_end < v_task_record.start_date THEN CONTINUE; END IF;
             v_task_recurrence := LOWER(COALESCE(v_task_record.effective_recurrence, 'weekly'));

             IF v_task_recurrence = 'weekly' THEN
                v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_period_start, v_period_end);
                IF v_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                   -- FIX: Remove 'AND due_date = ...' to prevent duplicates if date logic changes
                   INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                   SELECT v_period_id, v_task_record.id, v_task_record.title || ' - W' || public.get_week_number_in_month(v_period_end, v_weekly_start_day)::text, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                   WHERE NOT EXISTS (
                       SELECT 1 FROM recurring_period_tasks 
                       WHERE work_recurring_instance_id = v_period_id 
                       AND service_task_id = v_task_record.id
                   );
                END IF;
             ELSIF v_task_recurrence = 'daily' THEN
                FOR i IN 0..6 LOOP
                   v_task_period_end := (v_period_start + (i || ' day')::interval)::date;
                   IF v_task_record.start_date IS NULL OR v_task_period_end >= v_task_record.start_date THEN
                      v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, v_task_period_end);
                      IF v_task_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                         -- Daily in Weekly: Keep due_date check or use a unique key if implied
                         -- Assuming we can have duplicates if dates differ? No, usually 1 per day.
                         -- But calculate_configured... might return same date? Unlikely for daily.
                         -- Safe to keep due_date check OR include sub-period identifier.
                         INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                         SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                         WHERE NOT EXISTS (
                             SELECT 1 FROM recurring_period_tasks 
                             WHERE work_recurring_instance_id = v_period_id 
                             AND service_task_id = v_task_record.id 
                             AND due_date = v_task_due_date
                         );
                      END IF;
                   END IF;
                END LOOP;
             END IF;
          END LOOP;
       END IF;
       v_iter_date := (v_iter_date + INTERVAL '1 week')::date;
    END LOOP;

  -- -------------------------------------------------------------------
  -- MONTHLY, QUARTERLY, HALF-YEARLY, YEARLY
  -- -------------------------------------------------------------------
  ELSE 
    IF v_work_recurrence = 'monthly' THEN
       v_iter_date := date_trunc('month', COALESCE(v_work_start_date, v_current_date - INTERVAL '1 month'))::date;
    ELSIF v_work_recurrence = 'quarterly' THEN
       v_iter_date := date_trunc('month', COALESCE(v_work_start_date, v_current_date - INTERVAL '3 month'))::date;
    ELSIF v_work_recurrence = 'half-yearly' THEN
       v_iter_date := date_trunc('month', COALESCE(v_work_start_date, v_current_date - INTERVAL '6 month'))::date;
    ELSIF v_work_recurrence = 'yearly' THEN
        v_iter_date := date_trunc('year', COALESCE(v_work_start_date, v_current_date - INTERVAL '1 year'))::date;
    END IF;

    WHILE v_iter_date <= v_current_date LOOP
       IF v_work_recurrence = 'monthly' THEN
          v_period_start := v_iter_date + (v_monthly_start_day - 1 || ' days')::interval;
          v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
          v_period_name := TO_CHAR(v_period_end, 'Mon YYYY');
       ELSIF v_work_recurrence = 'quarterly' THEN
          v_period_start := v_iter_date + (v_quarterly_start_day - 1 || ' days')::interval;
          v_period_end := (v_period_start + INTERVAL '3 month' - INTERVAL '1 day')::date;
          v_period_name := 'Q' || (((EXTRACT(MONTH FROM v_period_start)::int - v_fy_start_month + 12) % 12) / 3 + 1)::text || ' FY' || EXTRACT(YEAR FROM v_period_start)::int;
       ELSIF v_work_recurrence = 'half-yearly' THEN
          v_period_start := v_iter_date + (v_half_yearly_start_day - 1 || ' days')::interval;
          v_period_end := (v_period_start + INTERVAL '6 month' - INTERVAL '1 day')::date;
          v_period_name := 'H' || (((EXTRACT(MONTH FROM v_period_start)::int - v_fy_start_month + 12) % 12) / 6 + 1)::text || ' FY' || EXTRACT(YEAR FROM v_period_start)::int;
       ELSIF v_work_recurrence = 'yearly' THEN
          v_period_start := v_iter_date + (v_yearly_start_day - 1 || ' days')::interval;
          v_period_end := (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
          v_period_name := 'FY ' || EXTRACT(YEAR FROM v_period_start)::text || '-' || (EXTRACT(YEAR FROM v_period_start)+1)::text;
       END IF;

       v_has_qualifying_task := false;
       v_period_id := NULL;

       -- CHECK QUALIFIERS
       FOR v_task_record IN 
          SELECT st.*, wtc.recurrence_start_day, wtc.recurrence_start_month, wtc.exact_due_date as config_exact_date, 
                 COALESCE(wtc.task_recurrence_type, st.task_recurrence_type, v_work_recurrence) as effective_recurrence,
                 COALESCE(wtc.due_offset_type, st.due_offset_type) as due_offset_type,
                 COALESCE(wtc.due_offset_value, st.due_offset_value) as due_offset_value
          FROM service_tasks st
          LEFT JOIN work_task_configs wtc ON wtc.service_task_id = st.id AND wtc.work_id = p_work_id
          WHERE st.service_id = v_service_id AND st.is_active = true
       LOOP
          IF v_task_record.start_date IS NOT NULL AND v_period_end < v_task_record.start_date THEN CONTINUE; END IF;
          v_task_recurrence := LOWER(COALESCE(v_task_record.effective_recurrence, v_work_recurrence));

          IF v_task_recurrence = v_work_recurrence THEN
             v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_period_start, v_period_end);
             IF v_task_due_date IS NOT NULL 
                AND v_task_due_date >= v_period_start
                AND v_task_due_date <= v_period_end
                AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) 
             THEN
                v_has_qualifying_task := true; EXIT;
             END IF;
          -- For Weekly/Daily in Monthly+, we assume they always qualify if range matches
          ELSIF v_task_recurrence = 'weekly' OR v_task_recurrence = 'daily' THEN
             v_has_qualifying_task := true; EXIT;
          END IF;
       END LOOP;

       IF v_has_qualifying_task THEN
          SELECT id INTO v_period_id FROM work_recurring_instances WHERE work_id = p_work_id AND period_end_date = v_period_end LIMIT 1;
          IF v_period_id IS NULL THEN
             INSERT INTO work_recurring_instances(work_id, period_name, period_start_date, period_end_date, status)
             VALUES (p_work_id, v_period_name, v_period_start, v_period_end, 'pending')
             RETURNING id INTO v_period_id;
          END IF;

          FOR v_task_record IN 
             SELECT st.*, wtc.recurrence_start_day, wtc.recurrence_start_month, wtc.exact_due_date as config_exact_date, 
                 COALESCE(wtc.task_recurrence_type, st.task_recurrence_type, v_work_recurrence) as effective_recurrence,
                 COALESCE(wtc.due_offset_type, st.due_offset_type) as due_offset_type,
                 COALESCE(wtc.due_offset_value, st.due_offset_value) as due_offset_value
             FROM service_tasks st
             LEFT JOIN work_task_configs wtc ON wtc.service_task_id = st.id AND wtc.work_id = p_work_id
             WHERE st.service_id = v_service_id AND st.is_active = true
          LOOP
             IF v_task_record.start_date IS NOT NULL AND v_period_end < v_task_record.start_date THEN CONTINUE; END IF;
             v_task_recurrence := LOWER(COALESCE(v_task_record.effective_recurrence, v_work_recurrence));

             IF v_task_recurrence = v_work_recurrence THEN
                v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_period_start, v_period_end);
                
                IF v_task_due_date IS NOT NULL 
                   AND v_task_due_date >= v_period_start
                   AND v_task_due_date <= v_period_end
                   AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) 
                THEN
                   -- FIX: Remove 'AND due_date = ...' for strict 1:1 Recurrence (e.g. Monthly Task in Monthly Work)
                   INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                   SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                   WHERE NOT EXISTS (
                       SELECT 1 FROM recurring_period_tasks 
                       WHERE work_recurring_instance_id = v_period_id 
                       AND service_task_id = v_task_record.id
                   );
                END IF;
             ELSIF v_task_recurrence = 'weekly' THEN
                -- ... (Logic for weekly in monthly - kept as is with date check for now, can be refined if 1 per week implies uniqueness)
                v_task_period_end := v_period_start;
                v_target_dow := CASE LOWER(COALESCE(v_task_record.recurrence_start_day, 'monday'))
                     WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
                     WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 ELSE 1 END;
                
                v_dow := EXTRACT(DOW FROM v_task_period_end)::int;
                IF v_dow <= v_target_dow THEN
                   v_task_period_end := v_task_period_end + (v_target_dow - v_dow || ' days')::interval;
                ELSE
                   v_task_period_end := v_task_period_end + (7 - (v_dow - v_target_dow) || ' days')::interval;
                END IF;

                WHILE v_task_period_end <= v_period_end LOOP
                    v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, (v_task_period_end + 6));
                    IF v_task_due_date IS NOT NULL AND v_task_due_date >= v_period_start AND v_task_due_date <= v_period_end
                       AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                       INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                       SELECT v_period_id, v_task_record.id, 
                              v_task_record.title || ' (' || TO_CHAR(v_task_period_end, 'Mon DD') || ' - ' || TO_CHAR(v_task_period_end + 6, 'Mon DD') || ')', 
                              v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                       WHERE NOT EXISTS (
                           SELECT 1 FROM recurring_period_tasks 
                           WHERE work_recurring_instance_id = v_period_id 
                           AND service_task_id = v_task_record.id 
                           AND due_date = v_task_due_date
                       );
                    END IF;
                    v_task_period_end := v_task_period_end + INTERVAL '1 week';
                END LOOP;
             
             ELSIF v_task_recurrence = 'daily' THEN
                v_task_period_end := v_period_start;
                WHILE v_task_period_end <= v_period_end LOOP
                   v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, v_task_period_end);
                   IF v_task_due_date IS NOT NULL AND v_task_due_date >= v_period_start AND v_task_due_date <= v_period_end 
                      AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                      INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                      SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                      WHERE NOT EXISTS (
                          SELECT 1 FROM recurring_period_tasks 
                          WHERE work_recurring_instance_id = v_period_id 
                          AND service_task_id = v_task_record.id 
                          AND due_date = v_task_due_date
                      );
                   END IF;
                   v_task_period_end := v_task_period_end + INTERVAL '1 day';
                END LOOP;
             END IF;
          END LOOP;
       END IF;
       IF v_work_recurrence = 'monthly' THEN
          v_iter_date := (v_iter_date + INTERVAL '1 month')::date;
       ELSIF v_work_recurrence = 'quarterly' THEN
          v_iter_date := (v_iter_date + INTERVAL '3 month')::date;
       ELSIF v_work_recurrence = 'half-yearly' THEN
          v_iter_date := (v_iter_date + INTERVAL '6 month')::date;
       ELSIF v_work_recurrence = 'yearly' THEN
          v_iter_date := (v_iter_date + INTERVAL '1 year')::date;
       END IF;
    END LOOP;
  END IF;

  RETURN;
END;
$$;
