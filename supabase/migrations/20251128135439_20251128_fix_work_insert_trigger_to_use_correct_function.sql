/*
  # Fix Work Insert Trigger to Use Correct Function

  ## Problem
  The trigger `trigger_auto_generate_periods_for_recurring_work` was calling the deleted function `backfill_missing_periods(uuid)`. 
  This function was removed and replaced with `auto_generate_periods_and_tasks(uuid)` which has the updated logic.

  ## Solution
  Update the trigger function to call the correct function: `auto_generate_periods_and_tasks()`

  ## Changes
  - Updated `trigger_auto_generate_periods_for_recurring_work()` to call `auto_generate_periods_and_tasks()` instead of `backfill_missing_periods()`
*/

-- Fix the trigger function to call the correct function
CREATE OR REPLACE FUNCTION trigger_auto_generate_periods_for_recurring_work()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process for recurring works with service_id and start_date
  IF NEW.is_recurring = true 
  AND NEW.service_id IS NOT NULL 
  AND NEW.start_date IS NOT NULL THEN
    PERFORM auto_generate_periods_and_tasks(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
