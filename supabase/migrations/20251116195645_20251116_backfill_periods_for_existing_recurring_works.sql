/*
  # Backfill Periods for Existing Recurring Works

  Creates initial periods for all recurring works that don't have any periods yet.
  This fixes the issue where existing recurring works have no periods.
*/

DO $$
DECLARE
  v_work RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Find all recurring works with no periods
  FOR v_work IN 
    SELECT w.id 
    FROM works w
    WHERE w.is_recurring = true
    AND NOT EXISTS (
      SELECT 1 FROM work_recurring_instances wri WHERE wri.work_id = w.id
    )
  LOOP
    -- Create periods for this work
    PERFORM create_periods_for_recurring_work(v_work.id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Created periods for % recurring works', v_count;
END $$;
