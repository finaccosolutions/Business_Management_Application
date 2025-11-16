/*
  # Create period management functions for non-recurring and recurring works

  1. Functions created:
    - create_period_for_non_recurring_work: Creates single period for non-recurring works
    - backfill_all_recurring_works: Backfills all periods for recurring works up to today
    - Trigger to auto-create periods on work insert

  2. Behavior:
    - Non-recurring works: Single period from start_date to completion_date (or today)
    - Recurring works: All periods that have ended are created upfront
    - Both get tasks and documents copied automatically
*/

-- Function to create single period for non-recurring work
CREATE FUNCTION create_period_for_non_recurring_work(p_work_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_work_is_recurring BOOLEAN;
  v_work_start_date DATE;
  v_work_completion_date DATE;
  v_work_billing_amount NUMERIC;
  v_work_service_id UUID;
  v_work_assigned_to UUID;
  v_period_end_date DATE;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_period_exists BOOLEAN;
BEGIN
  SELECT is_recurring, start_date, completion_date, billing_amount, service_id, assigned_to
  INTO v_work_is_recurring, v_work_start_date, v_work_completion_date, v_work_billing_amount, v_work_service_id, v_work_assigned_to
  FROM works
  WHERE id = p_work_id;

  IF v_work_is_recurring IS NULL OR v_work_is_recurring = TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_work_start_date IS NULL THEN
    RETURN FALSE;
  END IF;

  v_period_end_date := COALESCE(v_work_completion_date, CURRENT_DATE);

  SELECT EXISTS (
    SELECT 1 FROM work_recurring_instances WHERE work_id = p_work_id
  ) INTO v_period_exists;

  IF v_period_exists THEN
    RETURN FALSE;
  END IF;

  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    billing_amount,
    status,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    p_work_id,
    'Single Period',
    v_work_start_date,
    v_period_end_date,
    v_work_billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  IF v_work_service_id IS NOT NULL THEN
    v_task_count := copy_tasks_to_period(
      v_new_period_id,
      v_work_service_id,
      v_work_start_date,
      v_period_end_date,
      v_work_assigned_to
    );

    UPDATE work_recurring_instances
    SET total_tasks = v_task_count
    WHERE id = v_new_period_id;
  END IF;

  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for auto-creating periods on non-recurring work insert
CREATE OR REPLACE FUNCTION trigger_auto_create_period_for_non_recurring_work()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring = FALSE AND NEW.start_date IS NOT NULL THEN
    PERFORM create_period_for_non_recurring_work(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS auto_create_period_for_non_recurring_work ON works;

CREATE TRIGGER auto_create_period_for_non_recurring_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_create_period_for_non_recurring_work();

-- Backfill all existing recurring works with periods up to today
DO $$
DECLARE
  v_work RECORD;
  v_periods_created INTEGER;
BEGIN
  FOR v_work IN
    SELECT id FROM works WHERE is_recurring = TRUE AND recurrence_pattern IS NOT NULL
  LOOP
    v_periods_created := backfill_missing_periods(v_work.id);
  END LOOP;
END $$;

-- Create periods for all existing non-recurring works that don't have periods
DO $$
DECLARE
  v_work RECORD;
BEGIN
  FOR v_work IN
    SELECT w.id
    FROM works w
    WHERE w.is_recurring = FALSE
    AND w.start_date IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM work_recurring_instances WHERE work_id = w.id
    )
  LOOP
    PERFORM create_period_for_non_recurring_work(v_work.id);
  END LOOP;
END $$;
