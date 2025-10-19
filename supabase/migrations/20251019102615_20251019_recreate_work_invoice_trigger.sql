/*
  # Recreate Non-Recurring Work Invoice Trigger
  
  ## Problem:
  The trigger for auto-generating invoices on non-recurring work completion is not firing.
  The function exists and looks correct, but the trigger may have been misconfigured.
  
  ## Solution:
  Drop and recreate the trigger to ensure it's properly configured.
*/

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;

-- Recreate the trigger
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'Auto-generates invoice when non-recurring work status changes to completed with auto_bill enabled.';
