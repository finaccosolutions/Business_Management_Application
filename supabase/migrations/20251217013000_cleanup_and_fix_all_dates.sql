-- FINAL CLEANUP & FIX for Task Generation and Due Date Logic
-- 1. DROP ALL conflicting or legacy functions to remove ambiguity
DROP FUNCTION IF EXISTS public.calculate_due_date_from_config(int, int, date, text, int);
DROP FUNCTION IF EXISTS public.calculate_task_due_date(uuid, date, date);
DROP FUNCTION IF EXISTS public.calculate_task_due_date_in_month(uuid, integer, integer);
-- Drop the Main function to ensure clean recreation
DROP FUNCTION IF EXISTS public.auto_generate_periods_and_tasks(uuid);

-- 2. RE-CREATE the Single Source of Truth: calculate_configured_task_due_date
-- Now with strict Start Date + Offset logic
CREATE OR REPLACE FUNCTION public.calculate_configured_task_due_date(
  p_config_record RECORD, 
  p_period_start date,
  p_period_end date
) RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  v_due date;
  v_max_day int;
  v_target_year int;
  v_target_month int;
  v_target_day int;
  v_dow_target int; 
  v_current_dow int;
  v_days_diff int;
  v_period_type text;
BEGIN
  v_due := NULL;
  v_period_type := LOWER(COALESCE(p_config_record.effective_recurrence, ''));

  -- A. Priority 1: Exact Date
  IF p_config_record.config_exact_date IS NOT NULL THEN
    IF p_config_record.config_exact_date BETWEEN p_period_start AND p_period_end THEN
       RETURN p_config_record.config_exact_date;
    ELSE
       RETURN NULL; 
    END IF;
  END IF;

  -- B. Determine Base Start Date (v_due) based on Settings

  -- B1. Specific Month/Day (e.g. Yearly/Quarterly)
  v_target_month := NULL;
  IF p_config_record.recurrence_start_month IS NOT NULL AND p_config_record.recurrence_start_month > 0 THEN
      v_target_month := p_config_record.recurrence_start_month;
  END IF;

  v_target_day := 1;
  IF p_config_record.recurrence_start_day ~ '^[0-9]+$' AND v_period_type != 'daily' THEN
      v_target_day := p_config_record.recurrence_start_day::int;
  END IF;

  IF v_target_month IS NOT NULL THEN
      v_target_year := EXTRACT(YEAR FROM p_period_start)::int;
      BEGIN
          v_max_day := EXTRACT(DAY FROM (make_date(v_target_year, v_target_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int;
          v_due := make_date(v_target_year, v_target_month, LEAST(v_target_day, v_max_day));
          
          IF NOT(v_due BETWEEN p_period_start AND p_period_end) AND EXTRACT(YEAR FROM p_period_end) > v_target_year THEN
             v_target_year := EXTRACT(YEAR FROM p_period_end)::int;
             v_max_day := EXTRACT(DAY FROM (make_date(v_target_year, v_target_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int;
             v_due := make_date(v_target_year, v_target_month, LEAST(v_target_day, v_max_day));
          END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- B2. Weekly (Day Name)
  IF v_due IS NULL AND v_period_type = 'weekly' THEN
       IF p_config_record.recurrence_start_day IS NOT NULL AND NOT (p_config_record.recurrence_start_day ~ '^[0-9]+$') THEN
           v_dow_target := CASE LOWER(Trim(p_config_record.recurrence_start_day))
              WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
              WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
              WHEN 'saturday' THEN 6 ELSE 1 END;
           
           v_current_dow := EXTRACT(DOW FROM p_period_start)::int;
           v_days_diff := v_dow_target - v_current_dow;
           IF v_days_diff < 0 THEN v_days_diff := v_days_diff + 7; END IF;
           v_due := (p_period_start + (v_days_diff || ' days')::interval)::date;
       END IF;
  END IF;

  -- B3. Day of Month (Monthly/Quarterly without specific month)
  IF v_due IS NULL AND p_config_record.recurrence_start_day ~ '^[0-9]+$' AND v_period_type != 'daily' THEN
       v_target_day := p_config_record.recurrence_start_day::int;
       v_due := p_period_start + ((v_target_day - 1) || ' days')::interval;
  END IF;

  -- B4. Fallback: Period Start
  IF v_due IS NULL THEN
      v_due := p_period_start;
  END IF;

  -- C. Apply Offsets to the Base Date
  IF v_due IS NOT NULL THEN
     IF p_config_record.due_offset_value IS NOT NULL AND p_config_record.due_offset_value > 0 THEN
        IF p_config_record.due_offset_type = 'days' THEN
            v_due := v_due + (p_config_record.due_offset_value || ' days')::interval;
        ELSIF p_config_record.due_offset_type = 'weeks' THEN
            v_due := v_due + (p_config_record.due_offset_value || ' weeks')::interval;
        ELSIF p_config_record.due_offset_type = 'months' THEN
            v_due := v_due + (p_config_record.due_offset_value || ' months')::interval;
        END IF;
     END IF;
  END IF;

  RETURN v_due;
END;
$$;


-- 3. RE-CREATE the Main Task Generation Function using correct dependency
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
                  INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                  SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                  WHERE NOT EXISTS (SELECT 1 FROM recurring_period_tasks WHERE work_recurring_instance_id = v_period_id AND service_task_id = v_task_record.id AND due_date = v_task_due_date);
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
                   INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                   SELECT v_period_id, v_task_record.id, v_task_record.title || ' - W' || public.get_week_number_in_month(v_period_end, v_weekly_start_day)::text, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                   WHERE NOT EXISTS (SELECT 1 FROM recurring_period_tasks WHERE work_recurring_instance_id = v_period_id AND service_task_id = v_task_record.id AND due_date = v_task_due_date);
                END IF;
             ELSIF v_task_recurrence = 'daily' THEN
                FOR i IN 0..6 LOOP
                   v_task_period_end := (v_period_start + (i || ' day')::interval)::date;
                   IF v_task_record.start_date IS NULL OR v_task_period_end >= v_task_record.start_date THEN
                      v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, v_task_period_end);
                      IF v_task_period_end <= v_current_date AND v_task_due_date IS NOT NULL AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) THEN
                         INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                         SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                         WHERE NOT EXISTS (SELECT 1 FROM recurring_period_tasks WHERE work_recurring_instance_id = v_period_id AND service_task_id = v_task_record.id AND due_date = v_task_due_date);
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
          ELSIF v_task_recurrence = 'weekly' THEN
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
                 
                 IF v_task_due_date IS NOT NULL 
                    AND v_task_due_date >= v_period_start 
                    AND v_task_due_date <= v_period_end
                    AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date) 
                 THEN 
                     v_has_qualifying_task := true; EXIT; 
                 END IF;
                 v_task_period_end := v_task_period_end + INTERVAL '1 week';
             END LOOP;
          ELSIF v_task_recurrence = 'daily' THEN
             v_task_period_end := v_period_start;
             while v_task_period_end <= v_period_end LOOP
                v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, v_task_period_end);
                IF v_task_due_date IS NOT NULL
                   AND v_task_due_date >= v_period_start 
                   AND v_task_due_date <= v_period_end
                   AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                THEN 
                   v_has_qualifying_task := true; EXIT; 
                END IF;
                v_task_period_end := v_task_period_end + INTERVAL '1 day';
             END LOOP;
          END IF;
          IF v_has_qualifying_task THEN EXIT; END IF;
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
                   INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                   SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                   WHERE NOT EXISTS (SELECT 1 FROM recurring_period_tasks WHERE work_recurring_instance_id = v_period_id AND service_task_id = v_task_record.id AND due_date = v_task_due_date);
                END IF;
             ELSIF v_task_recurrence = 'weekly' THEN
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
                    
                    IF v_task_due_date IS NOT NULL 
                       AND v_task_due_date >= v_period_start 
                       AND v_task_due_date <= v_period_end
                       AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                    THEN
                       INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                       SELECT v_period_id, v_task_record.id, 
                              v_task_record.title || ' (' || TO_CHAR(v_task_period_end, 'Mon DD') || ' - ' || TO_CHAR(v_task_period_end + 6, 'Mon DD') || ')', 
                              v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                       WHERE NOT EXISTS (SELECT 1 FROM recurring_period_tasks WHERE work_recurring_instance_id = v_period_id AND service_task_id = v_task_record.id AND due_date = v_task_due_date);
                    END IF;
                    v_task_period_end := v_task_period_end + INTERVAL '1 week';
                END LOOP;
             
             ELSIF v_task_recurrence = 'daily' THEN
                v_task_period_end := v_period_start;
                WHILE v_task_period_end <= v_period_end LOOP
                   v_task_due_date := public.calculate_configured_task_due_date(v_task_record, v_task_period_end, v_task_period_end);
                   IF v_task_due_date IS NOT NULL
                      AND v_task_due_date >= v_period_start
                      AND v_task_due_date <= v_period_end 
                      AND (v_work_start_date IS NULL OR v_task_due_date >= v_work_start_date)
                   THEN
                      INSERT INTO recurring_period_tasks(work_recurring_instance_id, service_task_id, title, description, due_date, priority, estimated_hours, status, sort_order)
                      SELECT v_period_id, v_task_record.id, v_task_record.title, v_task_record.description, v_task_due_date, v_task_record.priority, v_task_record.estimated_hours, 'pending', COALESCE(v_task_record.sort_order, 0)
                      WHERE NOT EXISTS (SELECT 1 FROM recurring_period_tasks WHERE work_recurring_instance_id = v_period_id AND service_task_id = v_task_record.id AND due_date = v_task_due_date);
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
