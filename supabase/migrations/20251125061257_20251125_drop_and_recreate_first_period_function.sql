/*
  # Drop and Recreate calculate_first_period_for_work
  
  Fix the function signature and logic
*/

DROP FUNCTION IF EXISTS calculate_first_period_for_work(uuid);

CREATE OR REPLACE FUNCTION calculate_first_period_for_work(p_work_id uuid)
RETURNS TABLE(first_start_date DATE, first_end_date DATE, first_period_name TEXT) AS $$
DECLARE
  v_work RECORD;
  v_base_date DATE;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
BEGIN
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Start with the period containing the work start_date
  SELECT start_date, end_date, period_name
  INTO v_period_start, v_period_end, v_period_name
  FROM calculate_next_period_dates(
    v_work.start_date::DATE - INTERVAL '1 day',
    v_work.recurrence_pattern
  );
  
  -- Apply period_type logic
  CASE COALESCE(v_work.period_type, 'previous_period')
  WHEN 'previous_period' THEN
    -- Go back ONE period from the period containing start_date
    SELECT start_date, end_date, period_name
    INTO first_start_date, first_end_date, first_period_name
    FROM calculate_next_period_dates(
      v_period_start - INTERVAL '1 day',
      v_work.recurrence_pattern
    );
  
  WHEN 'current_period' THEN
    -- Use the period containing start_date
    first_start_date := v_period_start;
    first_end_date := v_period_end;
    first_period_name := v_period_name;
  
  WHEN 'next_period' THEN
    -- Go forward ONE period from the period containing start_date
    SELECT start_date, end_date, period_name
    INTO first_start_date, first_end_date, first_period_name
    FROM calculate_next_period_dates(
      v_period_end,
      v_work.recurrence_pattern
    );
  
  ELSE
    -- Default to previous_period
    SELECT start_date, end_date, period_name
    INTO first_start_date, first_end_date, first_period_name
    FROM calculate_next_period_dates(
      v_period_start - INTERVAL '1 day',
      v_work.recurrence_pattern
    );
  END CASE;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
