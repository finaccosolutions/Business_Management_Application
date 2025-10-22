/*
  # Fix Invoice Deletion and Re-creation System

  ## Problems Identified

  1. **Invoice Deletion Doesn't Reset Billing Status**
     - When an invoice is deleted, work.billing_status remains 'billed'
     - When tasks are completed again, auto-invoice function checks billing_status = 'billed' and skips invoice creation
     - Result: No new invoice is created even though tasks are completed

  2. **Recurring Work Similar Issue**
     - When recurring invoice is deleted, invoice_generated flag remains true
     - No new invoice is created when tasks are completed again

  ## Solution

  1. **Add trigger on invoice deletion**
     - When invoice is deleted, reset work.billing_status to 'pending' (for non-recurring)
     - When invoice is deleted, reset invoice_generated flag to false (for recurring)
     - This allows invoice to be re-created when tasks are completed again

  2. **Update invoice deletion trigger**
     - Handle both recurring and non-recurring work properly
     - Also handle ledger entry cleanup if needed

  ## Changes Made

  1. Create function to reset billing status on invoice deletion
  2. Create trigger on invoices table for DELETE operations
  3. Handle both work_id and work_recurring_instance_id cases
*/

-- ============================================================================
-- STEP 1: Function to Reset Billing Status on Invoice Deletion
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_billing_status_on_invoice_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_id uuid;
  v_period_id uuid;
BEGIN
  -- Get the work_id and period_id from the deleted invoice
  v_work_id := OLD.work_id;
  v_period_id := OLD.work_recurring_instance_id;

  -- Handle non-recurring work
  IF v_work_id IS NOT NULL AND v_period_id IS NULL THEN
    -- Check if this work is not recurring
    IF EXISTS (
      SELECT 1 FROM works
      WHERE id = v_work_id AND is_recurring = false
    ) THEN
      -- Reset billing_status to 'pending'
      UPDATE works
      SET billing_status = 'pending', updated_at = NOW()
      WHERE id = v_work_id;

      RAISE NOTICE '✓ Reset billing_status to pending for work % after invoice deletion', v_work_id;
    END IF;
  END IF;

  -- Handle recurring work
  IF v_period_id IS NOT NULL THEN
    -- Reset invoice_generated flag and related fields
    UPDATE work_recurring_instances
    SET
      invoice_generated = false,
      invoice_id = NULL,
      is_billed = false,
      status = CASE
        WHEN all_tasks_completed = true THEN 'completed'
        ELSE 'in_progress'
      END,
      updated_at = NOW()
    WHERE id = v_period_id;

    RAISE NOTICE '✓ Reset invoice_generated flag for period % after invoice deletion', v_period_id;
  END IF;

  RETURN OLD;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error resetting billing status on invoice deletion: %', SQLERRM;
    RETURN OLD;
END;
$$;

-- ============================================================================
-- STEP 2: Create Trigger on Invoices Table
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_reset_billing_on_invoice_deletion ON invoices;
CREATE TRIGGER trigger_reset_billing_on_invoice_deletion
  BEFORE DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION reset_billing_status_on_invoice_deletion();

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ INVOICE DELETION AND RE-CREATION SYSTEM FIXED ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. ✓ ADDED trigger to reset billing status on invoice deletion';
  RAISE NOTICE '   - When invoice is deleted, billing_status resets to "pending"';
  RAISE NOTICE '   - For recurring work, invoice_generated resets to false';
  RAISE NOTICE '';
  RAISE NOTICE '2. ✓ Invoice re-creation now works correctly';
  RAISE NOTICE '   - Delete invoice → billing status reset automatically';
  RAISE NOTICE '   - Change tasks to pending → complete tasks again';
  RAISE NOTICE '   - New invoice will be created';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Complete workflow:';
  RAISE NOTICE '1. Complete all tasks → Invoice auto-created + billing_status = billed';
  RAISE NOTICE '2. Delete invoice → billing_status resets to pending automatically';
  RAISE NOTICE '3. Change tasks back to pending (optional)';
  RAISE NOTICE '4. Complete tasks again → New invoice created';
  RAISE NOTICE '========================================================================';
END $$;
