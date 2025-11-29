/*
  # Fix Missing Period Creation Trigger on Work Insert

  The handle_recurring_work_creation function exists but the trigger that calls it 
  on works table INSERT is missing. This causes recurring work periods and tasks 
  to never be created when inserting a work record.
  
  Solution: Create the trigger that was declared but never applied.
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS handle_recurring_work_insert ON works;

-- Create the missing trigger for handle_recurring_work_creation on works table insert
CREATE TRIGGER handle_recurring_work_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();
