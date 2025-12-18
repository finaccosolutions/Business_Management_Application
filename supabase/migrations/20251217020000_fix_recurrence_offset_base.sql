-- Fix calculate_configured_task_due_date to use Period End as fallback base for Offsets
-- This ensures that tasks without a specific start day (generic period tasks) calculate offsets from the Period End (e.g., Reporting Deadlines).

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

  -- B4. Fallback: Period End
  -- If no specific start date is configured (e.g. "Do on Monday", "Do on 5th"), 
  -- we treat this as a general task for the period (e.g. "Weekly Report", "Monthly Return").
  -- In this case, "Due Offset" is calculated relative to the PERIOD END Date.
  IF v_due IS NULL THEN
      v_due := p_period_end;
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
