/*
  # Fix Auto-Invoice Trigger Timing
  
  ## Problem
  The `auto_invoice_on_period_completion` trigger is set to AFTER UPDATE, which means
  it cannot modify the NEW record to set the invoice_id. This causes the invoice_id
  to remain NULL even after an invoice is created.
  
  ## Solution
  Change the trigger from AFTER UPDATE to BEFORE UPDATE so the function can:
  1. Create the invoice
  2. Set NEW.invoice_id and NEW.is_billed
  3. Return the modified NEW record
  
  ## Changes
  - Drops existing AFTER UPDATE trigger
  - Creates new BEFORE UPDATE trigger with proper WHEN condition
  - Ensures invoice_id is properly set on the period record
*/

-- Drop the existing AFTER trigger
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;

-- Create BEFORE UPDATE trigger so function can modify NEW record
CREATE TRIGGER auto_invoice_on_period_completion
  BEFORE UPDATE
  ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();
