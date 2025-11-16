/*
  # Fix create_periods_for_recurring_work to use correct column

  The recurrence_pattern is stored on the works table, not services table.
  This fixes the function to read from the correct source.
*/

DROP FUNCTION IF EXISTS create_periods_for_recurring_work(uuid) CASCADE;

CREATE OR REPLACE FUNCTION create_periods_for_recurring_work(p_work_id uuid)
RETURNS void AS $$
DECLARE
  v_work RECORD;
  v_period_id uuid;
  v_task_count integer;
  v_next_start_date date;
  v_next_end_date date;
  v_period_name text;
  v_recurrence_pattern text;
BEGIN
  -- Get work details
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF v_work IS NULL OR NOT v_work.is_recurring THEN
    RETURN;
  END IF;

  -- Use recurrence_pattern from works table
  v_recurrence_pattern := COALESCE(v_work.recurrence_pattern, 'monthly');

  -- Calculate first period dates based on work start date
  CASE v_recurrence_pattern
    WHEN 'monthly' THEN
      v_next_start_date := v_work.start_date;
      v_next_end_date := (DATE_TRUNC('month', v_next_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_next_start_date, 'Mon YYYY');
      
    WHEN 'quarterly' THEN
      v_next_start_date := v_work.start_date;
      v_next_end_date := (DATE_TRUNC('quarter', v_next_start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'Q' || TO_CHAR(v_next_start_date, 'Q') || ' ' || TO_CHAR(v_next_start_date, 'YYYY');
      
    WHEN 'half_yearly' THEN
      v_next_start_date := v_work.start_date;
      v_next_end_date := (DATE_TRUNC('quarter', v_next_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'H' || CASE WHEN EXTRACT(MONTH FROM v_next_start_date) <= 6 THEN '1' ELSE '2' END || ' ' || TO_CHAR(v_next_start_date, 'YYYY');
      
    WHEN 'yearly' THEN
      v_next_start_date := v_work.start_date;
      v_next_end_date := (DATE_TRUNC('year', v_next_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_next_start_date, 'YYYY');
      
    ELSE
      v_next_start_date := v_work.start_date;
      v_next_end_date := v_next_start_date + INTERVAL '30 days';
      v_period_name := TO_CHAR(v_next_start_date, 'Mon YYYY');
  END CASE;

  -- Create the first recurring period instance
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status,
    billing_amount,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    p_work_id,
    v_period_name,
    v_next_start_date,
    v_next_end_date,
    'pending',
    v_work.billing_amount,
    false,
    0,
    0,
    false
  ) RETURNING id INTO v_period_id;

  -- Copy service tasks to the period
  v_task_count := copy_tasks_to_period(
    v_period_id,
    v_work.service_id,
    v_next_start_date,
    v_next_end_date,
    v_work.assigned_to
  );

  -- Update period with task count
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_period_id;

  -- Copy documents to the period
  PERFORM copy_documents_to_period(v_period_id, p_work_id);

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in create_periods_for_recurring_work: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
