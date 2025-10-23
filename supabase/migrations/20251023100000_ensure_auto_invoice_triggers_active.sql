/*
  # Ensure Auto-Invoice Triggers Are Active

  This migration ensures that the auto-invoice triggers are properly set up
  and will fire when all tasks in a work are completed.

  ## Changes
  1. Recreate triggers for non-recurring works (work_tasks)
  2. Recreate triggers for recurring works (recurring_period_tasks)
  3. Verify trigger functions exist and are correct
*/

-- ============================================================================
-- Drop and Recreate Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_recurring_tasks_complete ON recurring_period_tasks;

-- Trigger for non-recurring works
CREATE TRIGGER trigger_auto_invoice_on_work_tasks_complete
  AFTER UPDATE OF status ON work_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_work_tasks_complete();

-- Trigger for recurring works
CREATE TRIGGER trigger_auto_invoice_on_recurring_tasks_complete
  AFTER UPDATE OF status ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_recurring_tasks_complete();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== AUTO-INVOICE TRIGGERS ACTIVE ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Triggers Recreated:';
  RAISE NOTICE '  ✓ trigger_auto_invoice_on_work_tasks_complete';
  RAISE NOTICE '  ✓ trigger_auto_invoice_on_recurring_tasks_complete';
  RAISE NOTICE '';
  RAISE NOTICE 'How to Test:';
  RAISE NOTICE '  1. Go to Work Details page';
  RAISE NOTICE '  2. Mark all tasks as completed';
  RAISE NOTICE '  3. Invoice should auto-create if auto_bill = true';
  RAISE NOTICE '  4. Check Invoices page for new draft invoice';
  RAISE NOTICE '';
END $$;
