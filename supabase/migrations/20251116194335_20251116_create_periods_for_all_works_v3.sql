/*
  # Create periods for all works (v3 - with fixed copy_documents)

  1. Non-recurring works get single period on creation
  2. Recurring works backfilled with all periods up to today
  3. Existing works without periods get periods created
*/

-- Trigger function for non-recurring works
CREATE OR REPLACE FUNCTION trigger_auto_create_period_for_non_recurring_work()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_recurring = FALSE AND NEW.start_date IS NOT NULL THEN
    PERFORM create_period_for_non_recurring_work(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_period_for_non_recurring_work ON works;

CREATE TRIGGER auto_create_period_for_non_recurring_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_create_period_for_non_recurring_work();

-- Backfill all existing recurring works
DO $$
DECLARE
  v_work RECORD;
BEGIN
  FOR v_work IN
    SELECT id FROM works WHERE is_recurring = TRUE AND recurrence_pattern IS NOT NULL
  LOOP
    PERFORM backfill_missing_periods(v_work.id);
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
