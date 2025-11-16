/*
  # Fix calculate_next_period_dates Function Signature

  ## Problem
  The function calculate_next_period_dates is defined with DATE parameters, but code is calling it with TIMESTAMP parameters.
  Error: function calculate_next_period_dates(timestamp without time zone, text) does not exist

  ## Solution
  Create an overloaded version of calculate_next_period_dates that accepts TIMESTAMP parameters and casts them to DATE.
  This ensures compatibility with all callers.
*/

-- Create overloaded function that accepts timestamp parameters
CREATE OR REPLACE FUNCTION public.calculate_next_period_dates(
  p_current_end_date timestamp without time zone,
  p_recurrence_pattern text,
  OUT next_start_date date,
  OUT next_end_date date,
  OUT next_period_name text
)
RETURNS record
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Cast timestamp to date and call the main function
  SELECT * INTO next_start_date, next_end_date, next_period_name
  FROM calculate_next_period_dates(p_current_end_date::date, p_recurrence_pattern);
END;
$function$;
