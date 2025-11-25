/*
  # Fix calculate_first_period_for_work - Simplified Version
  
  Rewrite to properly calculate first period based on period_type
*/

DROP FUNCTION IF EXISTS calculate_first_period_for_work(uuid);

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
  v_end_date DATE;
  v_name TEXT;
BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate period containing the work start_date
  v_start_date := v_work.start_date::DATE;
  
  CASE v_work.recurrence_pattern
  WHEN 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  
  WHEN 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', v_start_date)::DATE;
    v_period_end := (DATE_TRUNC('quarter', v_start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    v_period_name := 'Q' || TO_CHAR(v_period_start, 'Q YYYY');
  
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
  
  -- Now apply period_type adjustment
  CASE COALESCE(v_work.period_type, 'previous_period')
  WHEN 'previous_period' THEN
    -- Go back ONE period
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      first_start_date := (v_period_start - INTERVAL '1 month')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    
    WHEN 'quarterly' THEN
      first_start_date := (v_period_start - INTERVAL '3 months')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := 'Q' || TO_CHAR(first_start_date, 'Q YYYY');
    
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
    
    WHEN 'quarterly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('quarter', first_start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      first_period_name := 'Q' || TO_CHAR(first_start_date, 'Q YYYY');
    
    WHEN 'half_yearly' THEN
      first_start_date := (v_period_end + INTERVAL '1 day')::DATE;
      first_end_date := (DATE_TRUNC('quarter', first_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
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
    -- Default to previous_period
    CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      first_start_date := (v_period_start - INTERVAL '1 month')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
    
    WHEN 'quarterly' THEN
      first_start_date := (v_period_start - INTERVAL '3 months')::DATE;
      first_end_date := (v_period_start - INTERVAL '1 day')::DATE;
      first_period_name := 'Q' || TO_CHAR(first_start_date, 'Q YYYY');
    
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
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
