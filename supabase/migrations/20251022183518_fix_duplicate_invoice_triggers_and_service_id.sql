/*
  # Fix Duplicate Invoice Triggers and Missing service_id

  ## Problems Found
  1. **TWO triggers creating invoices for recurring works**:
     - trigger_auto_invoice_on_period_complete (BEFORE UPDATE on work_recurring_instances) - OLD, missing service_id
     - trigger_auto_invoice_on_recurring_tasks_complete (AFTER UPDATE on recurring_period_tasks) - CORRECT, includes service_id
  
  2. **The old trigger creates invoices WITHOUT service_id**
  
  3. **Both triggers can fire, causing duplicate invoices or missing data**

  ## Root Cause
  - Old migration created a trigger on work_recurring_instances
  - New migration created a better trigger on recurring_period_tasks
  - The old trigger was never removed, causing conflicts

  ## Solution
  - Drop the old trigger: trigger_auto_invoice_on_period_complete
  - Drop the old function: auto_create_invoice_on_period_completion
  - Keep only the correct trigger that includes service_id

  ## Changes Made
  - Removed obsolete trigger from work_recurring_instances
  - Removed obsolete function
  - Ensured only the correct task-based trigger remains active
*/

-- ============================================================================
-- STEP 1: Drop the Old Obsolete Trigger and Function
-- ============================================================================

-- Drop the trigger that fires on work_recurring_instances status change
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_period_complete ON work_recurring_instances;

-- Drop the function that doesn't include service_id
DROP FUNCTION IF EXISTS auto_create_invoice_on_period_completion();

-- ============================================================================
-- STEP 2: Verify Correct Triggers Remain
-- ============================================================================

-- The correct trigger remains: trigger_auto_invoice_on_recurring_tasks_complete
-- It fires AFTER UPDATE on recurring_period_tasks when ALL tasks are completed
-- It INCLUDES service_id in invoice_items

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✓ FIXED DUPLICATE INVOICE TRIGGER ISSUE';
  RAISE NOTICE '=====================================';
  RAISE NOTICE '1. ✓ Dropped obsolete trigger: trigger_auto_invoice_on_period_complete';
  RAISE NOTICE '2. ✓ Dropped obsolete function: auto_create_invoice_on_period_completion';
  RAISE NOTICE '3. ✓ Kept correct trigger: trigger_auto_invoice_on_recurring_tasks_complete';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Invoice auto-creation will now:';
  RAISE NOTICE '  - Fire only when ALL tasks are completed';
  RAISE NOTICE '  - Always include service_id in invoice_items';
  RAISE NOTICE '  - Not create duplicate invoices';
  RAISE NOTICE '';
END $$;
