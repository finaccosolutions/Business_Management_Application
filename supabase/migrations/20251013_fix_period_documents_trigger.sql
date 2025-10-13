/*
  # Fix Period Documents Trigger to Prevent Duplicate Key Violations

  ## Problem
  When creating recurring works with multiple periods, the auto_create_period_documents
  trigger was causing duplicate key violations due to the UNIQUE constraint on
  (work_recurring_instance_id, work_document_id).

  ## Solution
  Add ON CONFLICT DO NOTHING to the INSERT statement in the trigger function.
  This allows the trigger to safely handle:
  - Multiple period insertions in a batch
  - Cases where documents don't exist yet for a new work
  - Duplicate attempts to create the same period-document relationship

  ## Changes
  1. Drop and recreate the auto_create_period_documents function with ON CONFLICT handling
  2. Recreate the trigger to use the updated function

  ## Security
  - No RLS changes, existing policies remain in place
*/

-- Drop existing trigger first
DROP TRIGGER IF EXISTS auto_create_period_documents_trigger ON work_recurring_instances;

-- Recreate the function with ON CONFLICT handling
CREATE OR REPLACE FUNCTION auto_create_period_documents()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy all work documents to this period (if any exist)
  -- Use ON CONFLICT DO NOTHING to prevent duplicate key violations
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    notes
  )
  SELECT
    NEW.id,
    wd.id,
    false,
    'Auto-created for period: ' || NEW.period_name
  FROM work_documents wd
  WHERE wd.work_id = NEW.work_id
  ON CONFLICT (work_recurring_instance_id, work_document_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER auto_create_period_documents_trigger
  AFTER INSERT ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_period_documents();
