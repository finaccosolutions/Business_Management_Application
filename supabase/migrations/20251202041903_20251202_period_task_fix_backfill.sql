/*
  # Backfill Function - Creates Periods Only at Work Creation Time
  
  ## Key: Only called once during work creation via trigger
  - Creates all periods from work start to current date
  - Respects eligibility rules for each period
  - No automatic ongoing period generation
*/

DROP FUNCTION IF EXISTS backfill_recurring_work_at_creation(UUID, DATE, TEXT, DATE) CASCADE;

CREATE FUNCTION backfill_recurring_work_at_creation(
  p_work_id UUID,
  p_start_date DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Create periods from work start date to current date based on recurrence
  IF p_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_start_date)::DATE;
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'monthly', p_current_date);
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;

  ELSIF p_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', p_start_date)::DATE;
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start)::DATE + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date);
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;

  ELSIF p_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', p_start_date)::DATE;
    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start)::DATE + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      PERFORM create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'yearly', p_current_date);
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;
