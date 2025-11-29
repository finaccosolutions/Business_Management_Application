/*
  # Fix Recurring Work Period and Task Creation - Correct Backfill Logic

  ## Problems Fixed
  1. Trigger checking `work_type` column instead of `is_recurring` boolean - causing NO periods/tasks to be created
  2. Backfill logic using `p_start_date` (work start date) not being set correctly from actual `start_date` column
  3. Need to set `work_type = 'recurring'` when creating recurring works
  4. Backfill should respect task due dates to avoid creating unnecessary periods

  ## Logic Implementation
  For a recurring work created on date D with start_date S:
  - For MONTHLY: Create periods from S to current date, only if first task's last due date has elapsed
    - Example: Work start 28-11-2025, current 29-11-2025, tasks due 10th, 15th, 20th
    - Last task of Nov was 20th (already elapsed on 29th), so NO period created for Nov
    - Only create periods where at least one task's last due date has passed
  
  - For QUARTERLY: Create Q1/Q2/Q3/Q4 periods with same logic
  - For YEARLY: Create yearly periods with same logic

  ## Solution
  1. Update trigger to check `is_recurring = true` instead of `work_type = 'recurring'`
  2. Ensure `work_type = 'recurring'` is set when `is_recurring = true`
  3. Use `start_date` column (not work_start_date)
  4. Keep task-driven period creation logic
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works CASCADE;
DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

-- Update trigger to check is_recurring flag and ensure work_type is set
CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_record RECORD;
  v_current_date DATE;
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
  
  -- Get service and recurrence info
  SELECT id, recurrence_type INTO v_service_record
  FROM services WHERE id = NEW.service_id;
  
  IF v_service_record IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Use current date for period creation eligibility check
  v_current_date := CURRENT_DATE;
  
  -- Backfill from work start date to current date, respecting task due dates
  PERFORM backfill_recurring_work_at_creation(
    NEW.id,
    NEW.start_date,
    v_service_record.recurrence_type,
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
