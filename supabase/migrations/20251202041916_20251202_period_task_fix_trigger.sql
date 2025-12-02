/*
  # Work Creation Trigger - Single, Unified Version
  
  ## Only trigger: Handles recurring work creation and backfill
  - Prevents multiple triggers from executing
  - Ensures backfill happens once at creation
*/

DROP TRIGGER IF EXISTS trg_handle_recurring_work_creation ON works CASCADE;
DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_record RECORD;
BEGIN
  -- Only process recurring works
  IF NEW.work_type != 'recurring' THEN
    RETURN NEW;
  END IF;
  
  -- Get service info
  SELECT id, recurrence_type INTO v_service_record
  FROM services WHERE id = NEW.service_id;
  
  IF v_service_record IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Backfill from work start date to current date - this is the ONLY place periods are created
  PERFORM backfill_recurring_work_at_creation(
    NEW.id,
    NEW.start_date,
    COALESCE(v_service_record.recurrence_type, 'monthly'),
    CURRENT_DATE
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_recurring_work_creation
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
