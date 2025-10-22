/*
  # Auto-Update Work Completion Date

  ## Changes

  1. Create trigger function to auto-update completion_date when work status changes to 'completed'
  2. Clear completion_date when status changes from 'completed' to something else
  3. This ensures completion_date always reflects when the work was actually completed

  ## Behavior

  - When work status → 'completed': Set completion_date = NOW()
  - When work status changes from 'completed' → anything else: Clear completion_date
  - completion_date is automatically managed, no manual updates needed
*/

-- ============================================================================
-- Create Function to Auto-Update Work Completion Date
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_update_work_completion_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If status is changing TO completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completion_date := NOW();
    RAISE NOTICE '✓ Work completion date set to %', NEW.completion_date;

  -- If status is changing FROM completed to something else
  ELSIF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    NEW.completion_date := NULL;
    RAISE NOTICE '✓ Work completion date cleared (status changed from completed)';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Create Trigger
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_update_work_completion_date ON works;

CREATE TRIGGER trigger_auto_update_work_completion_date
  BEFORE UPDATE ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_work_completion_date();

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ WORK COMPLETION DATE AUTO-UPDATE ENABLED ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Behavior:';
  RAISE NOTICE '  • When work status changes to "completed" → completion_date = NOW()';
  RAISE NOTICE '  • When work status changes from "completed" → completion_date = NULL';
  RAISE NOTICE '  • Automatic tracking, no manual updates required';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
END $$;
