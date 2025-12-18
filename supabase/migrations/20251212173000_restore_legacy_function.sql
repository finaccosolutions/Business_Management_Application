/*
  # Restore Legacy Function
  
  Restores `calculate_task_due_date` as it is apparently still in use 
  (likely by triggers or specific frontend calls missed in search).
*/

CREATE OR REPLACE FUNCTION public.calculate_task_due_date(
  p_period_end_date date, 
  p_offset_value int, 
  p_offset_type text
)
RETURNS date
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN CASE LOWER(COALESCE(p_offset_type, 'Days'))
    WHEN 'days' THEN
      p_period_end_date + COALESCE(p_offset_value, 0)
    WHEN 'months' THEN
      (p_period_end_date + (COALESCE(p_offset_value, 0) || ' months')::INTERVAL)::date
    WHEN 'month_start' THEN
      -- Legacy: treat as days from period end
      p_period_end_date + COALESCE(p_offset_value, 0)
    ELSE
      -- Default: treat as days
      p_period_end_date + COALESCE(p_offset_value, 0)
  END;
END;
$$;
