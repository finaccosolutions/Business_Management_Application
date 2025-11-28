/*
  # Fix Quarterly Period Creation Logic

  ## Issues Fixed
  1. Quarter mapping was wrong (Q1=Jan-Mar instead of Apr-Jun)
  2. Periods created for past dates even when work start date is after last task due date
  3. Multiple periods (Q3, Q4) created for future-dated work
  4. Tasks not being created in periods

  ## Solution
  1. Fix quarter calculation to use Apr-Jun for Q1, Jul-Sep for Q2, Oct-Dec for Q3, Jan-Mar for Q4
  2. Add validation to skip periods where work start date > last task due date in that period
  3. Only create periods when their task expiry dates have actually elapsed
*/

-- Create quarter calculation function with correct mapping
CREATE OR REPLACE FUNCTION calculate_quarter_for_date(p_date DATE)
RETURNS TABLE(quarter_num INTEGER, quarter_start DATE, quarter_end DATE, quarter_name TEXT) AS $$
DECLARE
  v_month INTEGER;
  v_year INTEGER;
BEGIN
  v_month := EXTRACT(MONTH FROM p_date)::INTEGER;
  v_year := EXTRACT(YEAR FROM p_date)::INTEGER;
  
  -- Financial year quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  IF v_month >= 4 AND v_month <= 6 THEN
    -- Q1: Apr-Jun
    quarter_num := 1;
    quarter_start := DATE_TRUNC('year', p_date)::DATE + INTERVAL '3 months';
    quarter_end := DATE_TRUNC('year', p_date)::DATE + INTERVAL '6 months' - INTERVAL '1 day';
    quarter_name := 'Q1 ' || v_year::TEXT;
  ELSIF v_month >= 7 AND v_month <= 9 THEN
    -- Q2: Jul-Sep
    quarter_num := 2;
    quarter_start := DATE_TRUNC('year', p_date)::DATE + INTERVAL '6 months';
    quarter_end := DATE_TRUNC('year', p_date)::DATE + INTERVAL '9 months' - INTERVAL '1 day';
    quarter_name := 'Q2 ' || v_year::TEXT;
  ELSIF v_month >= 10 AND v_month <= 12 THEN
    -- Q3: Oct-Dec
    quarter_num := 3;
    quarter_start := DATE_TRUNC('year', p_date)::DATE + INTERVAL '9 months';
    quarter_end := DATE_TRUNC('year', p_date)::DATE + INTERVAL '12 months' - INTERVAL '1 day';
    quarter_name := 'Q3 ' || v_year::TEXT;
  ELSE
    -- Q4: Jan-Mar (previous year)
    quarter_num := 4;
    quarter_start := DATE_TRUNC('year', p_date)::DATE - INTERVAL '9 months';
    quarter_end := DATE_TRUNC('year', p_date)::DATE - INTERVAL '1 day';
    quarter_name := 'Q4 ' || (v_year - 1)::TEXT;
  END IF;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Calculate last task due date for a period
CREATE OR REPLACE FUNCTION calculate_last_task_due_date_for_period(
  p_service_id UUID,
  p_period_end_date DATE
)
RETURNS DATE AS $$
DECLARE
  v_last_due_date DATE := NULL;
  v_task RECORD;
  v_task_expiry_date DATE;
BEGIN
  FOR v_task IN
    SELECT st.task_period_type, st.task_period_value, st.task_period_unit, st.due_date_offset_days
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    AND st.task_period_type IS NOT NULL
  LOOP
    -- Calculate the due date for this task (period_end + offset days)
    v_task_expiry_date := p_period_end_date + (COALESCE(v_task.due_date_offset_days, 10) || ' days')::INTERVAL;
    
    IF v_last_due_date IS NULL OR v_task_expiry_date > v_last_due_date THEN
      v_last_due_date := v_task_expiry_date;
    END IF;
  END LOOP;
  
  RETURN v_last_due_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Drop old functions
DROP FUNCTION IF EXISTS calculate_first_period_for_work(uuid);
DROP FUNCTION IF EXISTS calculate_next_period_dates(date, text);

-- Recreate with correct quarter mapping and eligibility check
CREATE OR REPLACE FUNCTION calculate_first_period_for_work(p_work_id uuid, 
  OUT first_start_date DATE, 
  OUT first_end_date DATE, 
  OUT first_period_name TEXT) AS $$
DECLARE
  v_work RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_start_date DATE;
  v_quarter_info RECORD;
  v_last_task_due_date DATE;
BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN;
  END IF;
  
  v_start_date := v_work.start_date::DATE;
  
  -- For quarterly pattern, use correct quarter mapping
  IF v_work.recurrence_pattern = 'quarterly' THEN
    -- Get quarter containing the work start_date
    SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_start_date);
    v_period_start := v_quarter_info.quarter_start;
    v_period_end := v_quarter_info.quarter_end;
    v_period_name := v_quarter_info.quarter_name;
    
    -- Apply period_type adjustment BEFORE eligibility check
    CASE COALESCE(v_work.period_type, 'current_period')
    WHEN 'previous_period' THEN
      -- Go back ONE quarter
      v_period_start := v_period_start - INTERVAL '3 months';
      v_period_end := v_period_end - INTERVAL '3 months';
      SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_period_start);
      v_period_name := v_quarter_info.quarter_name;
    
    WHEN 'next_period' THEN
      -- Go forward ONE quarter
      v_period_start := v_period_start + INTERVAL '3 months';
      v_period_end := v_period_end + INTERVAL '3 months';
      SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_period_start);
      v_period_name := v_quarter_info.quarter_name;
    END CASE;
    
    -- Check if work start date is AFTER last task due date - if so, skip this period
    IF v_work.service_id IS NOT NULL THEN
      v_last_task_due_date := calculate_last_task_due_date_for_period(v_work.service_id, v_period_end);
      IF v_last_task_due_date IS NOT NULL AND v_start_date > v_last_task_due_date THEN
        -- Period is not eligible, return NULL to skip it
        RETURN;
      END IF;
    END IF;
    
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
    RETURN;
  END IF;

  -- For other patterns, use existing logic
  CASE v_work.recurrence_pattern
  WHEN 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  
  WHEN 'half_yearly' THEN
    IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
      v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
      v_period_end := (DATE_TRUNC('year', v_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
    ELSE
      v_period_start := (DATE_TRUNC('year', v_start_date) + INTERVAL '6 months')::DATE;
      v_period_end := (DATE_TRUNC('year', v_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    END IF;
    v_period_name := 'H' || CEIL(EXTRACT(MONTH FROM v_period_start) / 6.0)::TEXT || ' ' || TO_CHAR(v_period_start, 'YYYY');
  
  WHEN 'yearly' THEN
    v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('year', v_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    v_period_name := 'FY ' || TO_CHAR(v_period_start, 'YYYY-') || TO_CHAR(v_period_end, 'YY');
  
  ELSE
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  END CASE;
  
  -- Check eligibility: if work start date > last task due date, skip
  IF v_work.service_id IS NOT NULL THEN
    v_last_task_due_date := calculate_last_task_due_date_for_period(v_work.service_id, v_period_end);
    IF v_last_task_due_date IS NOT NULL AND v_start_date > v_last_task_due_date THEN
      RETURN;
    END IF;
  END IF;

  -- Apply period_type adjustment
  CASE COALESCE(v_work.period_type, 'current_period')
  WHEN 'previous_period' THEN
    -- Go back ONE period
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      first_start_date := (v_period_start - INTERVAL '1 month')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    
    WHEN 'half_yearly' THEN
      first_start_date := (v_period_start - INTERVAL '6 months')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := 'H' || CEIL(EXTRACT(MONTH FROM first_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(first_start_date, 'YYYY');
    
    WHEN 'yearly' THEN
      first_start_date := (v_period_start - INTERVAL '1 year')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := 'FY ' || TO_CHAR(first_start_date, 'YYYY-') || TO_CHAR(first_end_date, 'YY');
    
    ELSE
      first_start_date := (v_period_start - INTERVAL '1 month')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    END CASE;
  
  WHEN 'current_period' THEN
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
  
  WHEN 'next_period' THEN
    -- Go forward ONE period
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('month', first_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    
    WHEN 'half_yearly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('year', first_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      first_period_name := 'H' || CEIL(EXTRACT(MONTH FROM first_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(first_start_date, 'YYYY');
    
    WHEN 'yearly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('year', first_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      first_period_name := 'FY ' || TO_CHAR(first_start_date, 'YYYY-') || TO_CHAR(first_end_date, 'YY');
    
    ELSE
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('month', first_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    END CASE;
  
  ELSE
    -- Default to current_period
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate calculate_next_period_dates
CREATE OR REPLACE FUNCTION calculate_next_period_dates(
  p_last_period_end_date DATE,
  p_recurrence_pattern TEXT,
  OUT start_date DATE,
  OUT end_date DATE,
  OUT period_name TEXT
) AS $$
DECLARE
  v_quarter_info RECORD;
  v_next_date DATE;
BEGIN
  -- Calculate the next period start (day after current period end)
  v_next_date := p_last_period_end_date + INTERVAL '1 day';
  
  IF p_recurrence_pattern = 'quarterly' THEN
    SELECT * INTO v_quarter_info FROM calculate_quarter_for_date(v_next_date);
    start_date := v_quarter_info.quarter_start;
    end_date := v_quarter_info.quarter_end;
    period_name := v_quarter_info.quarter_name;
  ELSIF p_recurrence_pattern = 'monthly' THEN
    start_date := DATE_TRUNC('month', v_next_date)::DATE;
    end_date := (DATE_TRUNC('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    period_name := TO_CHAR(start_date, 'Month YYYY');
  ELSIF p_recurrence_pattern = 'half_yearly' THEN
    IF EXTRACT(MONTH FROM v_next_date) <= 6 THEN
      start_date := DATE_TRUNC('year', v_next_date)::DATE;
      end_date := (DATE_TRUNC('year', v_next_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
    ELSE
      start_date := (DATE_TRUNC('year', v_next_date) + INTERVAL '6 months')::DATE;
      end_date := (DATE_TRUNC('year', v_next_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    END IF;
    period_name := 'H' || CEIL(EXTRACT(MONTH FROM start_date) / 6.0)::TEXT || ' ' || TO_CHAR(start_date, 'YYYY');
  ELSIF p_recurrence_pattern = 'yearly' THEN
    start_date := DATE_TRUNC('year', v_next_date)::DATE;
    end_date := (DATE_TRUNC('year', v_next_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    period_name := 'FY ' || TO_CHAR(start_date, 'YYYY-') || TO_CHAR(end_date, 'YY');
  ELSE
    start_date := DATE_TRUNC('month', v_next_date)::DATE;
    end_date := (DATE_TRUNC('month', v_next_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    period_name := TO_CHAR(start_date, 'Month YYYY');
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
