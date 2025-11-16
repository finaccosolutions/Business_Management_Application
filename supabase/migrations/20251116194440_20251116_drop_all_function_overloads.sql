/*
  # Drop all function overloads permanently

  1. Problem
    - calculate_next_period_dates has 2 versions (date, text) and (timestamp, text)
    - Need to keep only the clean date version
    - Remove wrapper versions
*/

-- Drop both versions
DROP FUNCTION IF EXISTS calculate_next_period_dates(date, text);
DROP FUNCTION IF EXISTS calculate_next_period_dates(timestamp without time zone, text);
DROP FUNCTION IF EXISTS calculate_next_period_dates(timestamp with time zone, text);

-- Recreate single clean version
CREATE FUNCTION calculate_next_period_dates(
  p_current_end DATE,
  p_recurrence_pattern TEXT
)
RETURNS TABLE (
  next_start_date DATE,
  next_end_date DATE,
  next_period_name TEXT
) AS $$
DECLARE
  v_next_start DATE;
  v_next_end DATE;
  v_period_name TEXT;
BEGIN
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := (DATE_TRUNC('month', v_next_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_next_start, 'Mon YYYY');
    WHEN 'quarterly' THEN
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := (DATE_TRUNC('quarter', v_next_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'Q' || TO_CHAR(v_next_start, 'Q') || ' ' || TO_CHAR(v_next_start, 'YYYY');
    WHEN 'yearly' THEN
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := (DATE_TRUNC('year', v_next_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_next_start, 'YYYY');
    ELSE
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := p_current_end + INTERVAL '30 days';
      v_period_name := TO_CHAR(v_next_start, 'Mon YYYY');
  END CASE;

  RETURN QUERY SELECT v_next_start, v_next_end, v_period_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
