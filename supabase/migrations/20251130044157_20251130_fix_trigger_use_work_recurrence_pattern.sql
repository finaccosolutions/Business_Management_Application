/*
  # Fix Recurring Work Trigger - Use Work's Recurrence Pattern

  ## Problem
  Trigger was looking for recurrence_type on services table, but services have NULL values.
  The actual recurrence type is stored as recurrence_pattern on the works table itself.

  ## Solution
  Update trigger to use NEW.recurrence_pattern (from the work being created) instead of 
  looking up a potentially NULL value from services.recurrence_type.
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works CASCADE;
DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

-- Create updated trigger that uses work's recurrence_pattern
CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_current_date DATE;
  v_recurrence_type TEXT;
BEGIN
  -- Set work_type based on is_recurring flag
  IF NEW.is_recurring THEN
    NEW.work_type := 'recurring';
  ELSE
    NEW.work_type := 'standard';
  END IF;
  
  -- Only process recurring works
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;
  
  -- Ensure start_date is set (required for backfill)
  IF NEW.start_date IS NULL THEN
    NEW.start_date := CURRENT_DATE;
  END IF;
  
  -- Get recurrence type from work's recurrence_pattern field
  -- (not from service which may be NULL)
  v_recurrence_type := COALESCE(NEW.recurrence_pattern, 'monthly');
  
  -- Use current date for period creation eligibility check
  v_current_date := CURRENT_DATE;
  
  -- Backfill from work start date to current date, respecting task due dates
  PERFORM backfill_recurring_work_at_creation(
    NEW.id,
    NEW.start_date,
    v_recurrence_type,
    v_current_date
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on BEFORE INSERT so work_type is set before insert
CREATE TRIGGER trg_handle_recurring_work_creation
BEFORE INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
