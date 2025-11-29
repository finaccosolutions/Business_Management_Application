/*
  # Fix Column Name in Work Insert Trigger
  
  The column name is `start_date`, not `work_start_date`
*/

DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works CASCADE;

DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_record RECORD;
  v_current_date DATE;
BEGIN
  -- Only process recurring works
  IF NEW.work_type != 'recurring' THEN
    RETURN NEW;
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

CREATE TRIGGER trg_handle_recurring_work_creation
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
