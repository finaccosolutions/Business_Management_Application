/*
  # Create Trigger to Auto-Generate Next Period When Current Period Ends
  
  When a period is completed (all tasks done and period_end_date has passed),
  automatically create the next period if it doesn't exist.
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_generate_next_recurring_period ON work_recurring_instances;

-- Create the trigger function
CREATE OR REPLACE FUNCTION trigger_auto_generate_next_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_work RECORD;
  v_periods_after_today INTEGER;
BEGIN
  -- Only process when a period is marked as completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Get work details
    SELECT * INTO v_work FROM works WHERE id = NEW.work_id;
    
    -- Skip if work is not recurring or is completed/cancelled
    IF v_work IS NULL OR v_work.is_recurring = FALSE 
       OR v_work.status IN ('completed', 'cancelled') THEN
      RETURN NEW;
    END IF;
    
    -- Check if there's already a period after today
    SELECT COUNT(*) INTO v_periods_after_today
    FROM work_recurring_instances
    WHERE work_id = NEW.work_id
      AND period_start_date > CURRENT_DATE;
    
    -- If no future periods exist, generate the next one
    IF v_periods_after_today = 0 THEN
      PERFORM auto_generate_next_period_for_work(NEW.work_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER trigger_auto_generate_next_recurring_period
AFTER UPDATE ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_generate_next_recurring_period();
