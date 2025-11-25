/*
  # Auto-create Periods for Recurring Work on Creation

  1. Problem
    - When creating a recurring work, periods were not being generated automatically
    - User had to navigate to Periods & Tasks page manually
    - Expected periods based on service template and period_type

  2. Solution
    - Create trigger `trigger_auto_generate_periods_for_recurring_work` that fires AFTER work insert
    - For recurring works with service_id, call `auto_generate_next_period_for_work()`
    - This generates initial periods based on start_date and period_type
    - Each period gets tasks from service template with correct due dates

  3. Implementation
    - Trigger on `works` table
    - Only fires for NEW.is_recurring = TRUE
    - Checks NEW.service_id exists
    - Calls `auto_generate_next_period_for_work(work_id)` which:
      - Calls `backfill_missing_periods()` to generate all periods from start_date to today
      - For each period, copies tasks from service template via `copy_tasks_to_period()`
      - Sets correct due dates based on period_end_date + offset_days from service_task

  4. Flow
    - User creates recurring work with service (e.g., GST monthly filing)
    - Trigger automatically fires after insert
    - All periods from start_date to today are created
    - Each period has tasks from service template
    - User sees periods in "Periods & Tasks" page immediately
*/

-- Drop trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS trigger_auto_generate_periods_for_recurring_work ON works;

-- Create trigger function to auto-generate periods for recurring works
CREATE FUNCTION trigger_auto_generate_periods_for_recurring_work()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process for recurring works with service_id
  IF NEW.is_recurring = true 
    AND NEW.service_id IS NOT NULL 
    AND NEW.start_date IS NOT NULL THEN
    
    -- Call the existing period generation function
    PERFORM auto_generate_next_period_for_work(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Create trigger that fires after a new work is inserted
CREATE TRIGGER trigger_auto_generate_periods_for_recurring_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_periods_for_recurring_work();

-- Enable the trigger
ALTER TABLE works ENABLE TRIGGER trigger_auto_generate_periods_for_recurring_work;