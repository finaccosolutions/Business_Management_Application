/*
  # Fix calculate_next_period_dates Output Parameter Names

  1. Problem
    - calculate_next_period_dates function has OUT parameters: next_start_date, next_end_date, next_period_name
    - backfill_missing_periods tries to SELECT start_date, end_date, period_name from it
    - Parameter name mismatch causes "column start_date does not exist" error

  2. Solution
    - Recreate calculate_next_period_dates with correct output parameter names
    - Use start_date, end_date, period_name (without "next_" prefix)
    - This matches what the caller expects

  3. Changes
    - Drop and recreate calculate_next_period_dates with fixed parameter names
*/

-- Drop the function with wrong parameter names
DROP FUNCTION IF EXISTS calculate_next_period_dates(DATE, TEXT) CASCADE;

-- Recreate with correct output parameter names
CREATE FUNCTION calculate_next_period_dates(
  p_current_end_date DATE,
  p_recurrence_pattern TEXT,
  OUT start_date DATE,
  OUT end_date DATE,
  OUT period_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  start_date := p_current_end_date + INTERVAL '1 day';

  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      end_date := (DATE_TRUNC('month', start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      period_name := TO_CHAR(start_date, 'Month YYYY');

    WHEN 'quarterly' THEN
      end_date := (DATE_TRUNC('quarter', start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      period_name := 'Q' || TO_CHAR(start_date, 'Q YYYY');

    WHEN 'half_yearly' THEN
      end_date := (DATE_TRUNC('quarter', start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      period_name := 'H' || CEIL(EXTRACT(MONTH FROM start_date) / 6.0)::TEXT || ' ' || TO_CHAR(start_date, 'YYYY');

    WHEN 'yearly' THEN
      end_date := (DATE_TRUNC('year', start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      period_name := 'FY ' || TO_CHAR(start_date, 'YYYY-') || TO_CHAR(start_date + INTERVAL '1 year', 'YY');

    ELSE
      end_date := (DATE_TRUNC('month', start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      period_name := TO_CHAR(start_date, 'Month YYYY');
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_next_period_dates(DATE, TEXT) TO authenticated;

-- Re-enable the trigger now that the function is fixed
ALTER TABLE works ENABLE TRIGGER trigger_auto_generate_periods_for_recurring_work;
