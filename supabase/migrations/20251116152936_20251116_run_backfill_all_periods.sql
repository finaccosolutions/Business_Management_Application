/*
  # Backfill All Missing Periods for Recurring Works

  ## Action
  - Call backfill_missing_periods for all recurring works
  - Generate ALL periods from work start_date to today
  - Preserve all existing periods with statuses intact

  ## Result
  - Each recurring work will have complete period history
  - Missing periods in gaps will be created
  - No existing periods are deleted
*/

DO $$
DECLARE
  v_work_id UUID;
  v_count INTEGER := 0;
  v_created INTEGER := 0;
BEGIN
  FOR v_work_id IN 
    SELECT id FROM works WHERE is_recurring = TRUE ORDER BY created_at
  LOOP
    v_created := backfill_missing_periods(v_work_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill complete: processed % works, created periods as needed', v_count;
END $$;
