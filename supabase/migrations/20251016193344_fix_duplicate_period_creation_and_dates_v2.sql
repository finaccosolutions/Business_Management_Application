/*
  # Fix duplicate period creation and incorrect dates

  ## Issues Fixed
  1. Drop ALL versions of calculate_period_dates function
  2. Recreate only the correct 3-parameter version
  3. Fix period date boundaries to show correct start/end dates
  
  ## Changes
  - Remove all calculate_period_dates function versions
  - Ensure period dates match the actual period being tracked
*/

-- Drop ALL versions of the function
DROP FUNCTION IF EXISTS calculate_period_dates(text, integer, date);
DROP FUNCTION IF EXISTS calculate_period_dates(text, text, date);

-- Recreate the correct version
CREATE FUNCTION calculate_period_dates(
  p_base_pattern TEXT,
  p_period_type TEXT,
  p_reference_date DATE
)
RETURNS TABLE(period_start_date DATE, period_end_date DATE, period_name TEXT) AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_name TEXT;
BEGIN
  -- Calculate period based on pattern and type
  CASE p_base_pattern
    WHEN 'monthly' THEN
      IF p_period_type = 'previous_period' THEN
        -- Previous Month: Full previous calendar month
        v_start_date := DATE_TRUNC('month', p_reference_date - INTERVAL '1 month')::DATE;
        v_end_date := (DATE_TRUNC('month', p_reference_date) - INTERVAL '1 day')::DATE;
      ELSIF p_period_type = 'next_period' THEN
        -- Next Month: Full next calendar month
        v_start_date := DATE_TRUNC('month', p_reference_date + INTERVAL '1 month')::DATE;
        v_end_date := (DATE_TRUNC('month', p_reference_date + INTERVAL '2 months') - INTERVAL '1 day')::DATE;
      ELSE
        -- Current Month: Current calendar month
        v_start_date := DATE_TRUNC('month', p_reference_date)::DATE;
        v_end_date := (DATE_TRUNC('month', p_reference_date) + INTERVAL '1 month - 1 day')::DATE;
      END IF;
      v_name := TO_CHAR(v_start_date, 'Month YYYY');

    WHEN 'quarterly' THEN
      IF p_period_type = 'previous_period' THEN
        -- Previous Quarter
        v_start_date := DATE_TRUNC('quarter', p_reference_date - INTERVAL '3 months')::DATE;
        v_end_date := (DATE_TRUNC('quarter', p_reference_date) - INTERVAL '1 day')::DATE;
      ELSIF p_period_type = 'next_period' THEN
        -- Next Quarter
        v_start_date := DATE_TRUNC('quarter', p_reference_date + INTERVAL '3 months')::DATE;
        v_end_date := (DATE_TRUNC('quarter', p_reference_date + INTERVAL '6 months') - INTERVAL '1 day')::DATE;
      ELSE
        -- Current Quarter
        v_start_date := DATE_TRUNC('quarter', p_reference_date)::DATE;
        v_end_date := (DATE_TRUNC('quarter', p_reference_date) + INTERVAL '3 months - 1 day')::DATE;
      END IF;
      v_name := 'Q' || EXTRACT(QUARTER FROM v_start_date)::TEXT || ' ' || EXTRACT(YEAR FROM v_start_date)::TEXT;

    WHEN 'half_yearly' THEN
      IF p_period_type = 'previous_period' THEN
        -- Previous Half Year
        IF EXTRACT(MONTH FROM p_reference_date) <= 6 THEN
          v_start_date := (DATE_TRUNC('year', p_reference_date) - INTERVAL '6 months')::DATE;
          v_end_date := (DATE_TRUNC('year', p_reference_date) - INTERVAL '1 day')::DATE;
          v_name := 'H2 ' || EXTRACT(YEAR FROM v_start_date)::TEXT;
        ELSE
          v_start_date := DATE_TRUNC('year', p_reference_date)::DATE;
          v_end_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '6 months - 1 day')::DATE;
          v_name := 'H1 ' || EXTRACT(YEAR FROM v_start_date)::TEXT;
        END IF;
      ELSIF p_period_type = 'next_period' THEN
        -- Next Half Year
        IF EXTRACT(MONTH FROM p_reference_date) <= 6 THEN
          v_start_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '6 months')::DATE;
          v_end_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '1 year - 1 day')::DATE;
          v_name := 'H2 ' || EXTRACT(YEAR FROM v_start_date)::TEXT;
        ELSE
          v_start_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '1 year')::DATE;
          v_end_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '18 months - 1 day')::DATE;
          v_name := 'H1 ' || EXTRACT(YEAR FROM v_start_date)::TEXT;
        END IF;
      ELSE
        -- Current Half Year
        IF EXTRACT(MONTH FROM p_reference_date) <= 6 THEN
          v_start_date := DATE_TRUNC('year', p_reference_date)::DATE;
          v_end_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '6 months - 1 day')::DATE;
          v_name := 'H1 ' || EXTRACT(YEAR FROM v_start_date)::TEXT;
        ELSE
          v_start_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '6 months')::DATE;
          v_end_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '1 year - 1 day')::DATE;
          v_name := 'H2 ' || EXTRACT(YEAR FROM v_start_date)::TEXT;
        END IF;
      END IF;

    WHEN 'yearly' THEN
      IF p_period_type = 'previous_period' THEN
        -- Previous Year
        v_start_date := DATE_TRUNC('year', p_reference_date - INTERVAL '1 year')::DATE;
        v_end_date := (DATE_TRUNC('year', p_reference_date) - INTERVAL '1 day')::DATE;
      ELSIF p_period_type = 'next_period' THEN
        -- Next Year
        v_start_date := DATE_TRUNC('year', p_reference_date + INTERVAL '1 year')::DATE;
        v_end_date := (DATE_TRUNC('year', p_reference_date + INTERVAL '2 years') - INTERVAL '1 day')::DATE;
      ELSE
        -- Current Year
        v_start_date := DATE_TRUNC('year', p_reference_date)::DATE;
        v_end_date := (DATE_TRUNC('year', p_reference_date) + INTERVAL '1 year - 1 day')::DATE;
      END IF;
      v_name := 'FY ' || EXTRACT(YEAR FROM v_start_date)::TEXT;

    ELSE
      RAISE EXCEPTION 'Invalid recurrence pattern: %', p_base_pattern;
  END CASE;

  RETURN QUERY SELECT v_start_date, v_end_date, v_name;
END;
$$ LANGUAGE plpgsql;
