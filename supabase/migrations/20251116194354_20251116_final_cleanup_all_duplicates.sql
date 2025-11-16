/*
  # Final cleanup of all duplicate functions

  1. Remove all duplicate functions that were created in previous migrations
  2. Keep only one clean version of each
*/

-- Drop all versions of each function to start fresh
DROP FUNCTION IF EXISTS calculate_next_period_dates(date, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(timestamp with time zone, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_due_date(date, integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_due_date(date, integer, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_due_date(timestamp with time zone, integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, integer, text) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date(timestamp with time zone, date, integer) CASCADE;

-- Recreate single clean version of calculate_next_period_dates
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
