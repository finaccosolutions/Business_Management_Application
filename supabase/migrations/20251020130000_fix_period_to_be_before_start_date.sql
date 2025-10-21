/*
  # Fix Period Creation to Be BEFORE Start Date

  ## Problem
  When creating recurring work with start_date = 2025-10-01:
  - Current behavior: Period is October 2025 (2025-10-01 to 2025-10-31)
  - Expected behavior: Period should be September 2025 (2025-09-01 to 2025-09-30)

  The first period should be the period BEFORE the start date, not the period containing it.

  ## Solution
  Subtract one period from the start date before calculating the period.
  For monthly: Go back one month from start date, then find that month's period.
*/

-- ============================================================================
-- STEP 1: Update calculate_first_period_dates to go back one period
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_first_period_dates(
  p_start_date DATE,
  p_recurrence_pattern TEXT,
  OUT first_start_date DATE,
  OUT first_end_date DATE,
  OUT first_period_name TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_reference_date DATE;
BEGIN
  -- Go back one period from the start date to get the "previous" period
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      -- Go back 1 month
      v_reference_date := (p_start_date - INTERVAL '1 month')::DATE;
      first_start_date := DATE_TRUNC('month', v_reference_date)::DATE;
      first_end_date := (first_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');

    WHEN 'quarterly' THEN
      -- Go back 3 months
      v_reference_date := (p_start_date - INTERVAL '3 months')::DATE;
      first_start_date := DATE_TRUNC('quarter', v_reference_date)::DATE;
      first_end_date := (first_start_date + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      first_period_name := 'Q' || TO_CHAR(first_start_date, 'Q YYYY');

    WHEN 'half_yearly' THEN
      -- Go back 6 months
      v_reference_date := (p_start_date - INTERVAL '6 months')::DATE;
      IF EXTRACT(MONTH FROM v_reference_date) <= 6 THEN
        first_start_date := DATE_TRUNC('year', v_reference_date)::DATE;
      ELSE
        first_start_date := (DATE_TRUNC('year', v_reference_date) + INTERVAL '6 months')::DATE;
      END IF;
      first_end_date := (first_start_date + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      first_period_name := 'H' || CEIL(EXTRACT(MONTH FROM first_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(first_start_date, 'YYYY');

    WHEN 'yearly' THEN
      -- Go back 1 year
      v_reference_date := (p_start_date - INTERVAL '1 year')::DATE;
      IF EXTRACT(MONTH FROM v_reference_date) >= 4 THEN
        first_start_date := (DATE_TRUNC('year', v_reference_date) + INTERVAL '3 months')::DATE;
      ELSE
        first_start_date := (DATE_TRUNC('year', v_reference_date) - INTERVAL '9 months')::DATE;
      END IF;
      first_end_date := (first_start_date + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      first_period_name := 'FY ' || TO_CHAR(first_start_date, 'YYYY-') || TO_CHAR(first_start_date + INTERVAL '1 year', 'YY');

    ELSE
      -- Default to monthly
      v_reference_date := (p_start_date - INTERVAL '1 month')::DATE;
      first_start_date := DATE_TRUNC('month', v_reference_date)::DATE;
      first_end_date := (first_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      first_period_name := TO_CHAR(first_start_date, 'Month YYYY');
  END CASE;
END;
$$;

COMMENT ON FUNCTION calculate_first_period_dates IS
  'Calculates the first period which is the period BEFORE the work start date. For start_date = Oct 1, returns September period.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_first_period_dates TO authenticated;
