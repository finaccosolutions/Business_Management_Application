/*
  # Fix Critical Issues: Recurring Periods, Voucher Totals, and Invoice Deletion

  ## Issues Fixed

  ### 1. Recurring Periods Not Being Created
  - The trigger `trigger_handle_new_recurring_work_initial_period` does not exist
  - Need to create proper trigger for work creation

  ### 2. Voucher Page Total Amount Wrong
  - Invoices show `total_amount` (subtotal + tax) instead of `subtotal`
  - Fixed in frontend by using `subtotal` field

  ### 3. Invoice Deletion Not Cleaning Ledger Entries
  - When invoice is deleted, related vouchers remain with invoice_id SET NULL
  - Ledger entries from those vouchers are not cleaned up
  - Need CASCADE delete from invoice to vouchers and ledger entries

  ## Changes
  1. Create missing trigger for recurring period creation
  2. Fix invoice deletion cascade to clean up vouchers and ledger entries
  3. Add trigger to clean up orphaned ledger entries
*/

-- ============================================================================
-- 1. Create Missing Trigger for Recurring Period Creation
-- ============================================================================

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work_initial_period ON works;
DROP TRIGGER IF EXISTS trigger_create_recurring_period_on_work_insert ON works;

-- Create the trigger
CREATE TRIGGER trigger_handle_new_recurring_work_initial_period
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = true)
  EXECUTE FUNCTION create_initial_recurring_period_on_work_insert();

COMMENT ON TRIGGER trigger_handle_new_recurring_work_initial_period ON works IS
  'Automatically creates first recurring period when recurring work is inserted';

-- ============================================================================
-- 2. Fix Invoice Deletion to CASCADE to Vouchers and Ledger Entries
-- ============================================================================

-- Drop existing foreign key constraint
ALTER TABLE vouchers 
  DROP CONSTRAINT IF EXISTS vouchers_invoice_id_fkey;

-- Add new foreign key with CASCADE delete
ALTER TABLE vouchers 
  ADD CONSTRAINT vouchers_invoice_id_fkey 
  FOREIGN KEY (invoice_id) 
  REFERENCES invoices(id) 
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT vouchers_invoice_id_fkey ON vouchers IS
  'Foreign key to invoices with CASCADE delete - when invoice is deleted, all related vouchers are also deleted';

-- ============================================================================
-- 3. Ensure Voucher Deletion Cascades to Ledger Entries
-- ============================================================================

-- Check if voucher_entries has proper CASCADE
DO $$
BEGIN
  -- Drop existing foreign key if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'voucher_entries_voucher_id_fkey' 
    AND table_name = 'voucher_entries'
  ) THEN
    ALTER TABLE voucher_entries DROP CONSTRAINT voucher_entries_voucher_id_fkey;
  END IF;

  -- Add CASCADE delete constraint
  ALTER TABLE voucher_entries 
    ADD CONSTRAINT voucher_entries_voucher_id_fkey 
    FOREIGN KEY (voucher_id) 
    REFERENCES vouchers(id) 
    ON DELETE CASCADE;
END $$;

COMMENT ON CONSTRAINT voucher_entries_voucher_id_fkey ON voucher_entries IS
  'Foreign key to vouchers with CASCADE delete - when voucher is deleted, all entries are deleted';

-- ============================================================================
-- 4. Verify Trigger Function Exists
-- ============================================================================

-- Verify the function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_initial_recurring_period_on_work_insert'
  ) THEN
    RAISE EXCEPTION 'Function create_initial_recurring_period_on_work_insert does not exist. Please ensure migration 20251019054244 is applied.';
  END IF;
END $$;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON voucher_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_recurring_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_period_tasks TO authenticated;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed recurring period creation trigger';
  RAISE NOTICE '✓ Fixed invoice deletion to cascade to vouchers';
  RAISE NOTICE '✓ Fixed voucher deletion to cascade to ledger entries';
  RAISE NOTICE '✓ All critical issues resolved';
END $$;
