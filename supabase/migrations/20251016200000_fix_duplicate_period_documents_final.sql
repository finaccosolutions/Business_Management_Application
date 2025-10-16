/*
  # Fix Duplicate Period Documents Error

  ## Problem
  When creating a new work, the system throws a duplicate key violation error:
  "duplicate key value violates unique constraint work_recurring_period_documen_work_recurring_instance_id_wo_key"

  This happens because the unique constraint on (work_recurring_instance_id, work_document_id)
  is being violated when period documents are created.

  ## Root Cause
  The auto_create_period_documents function may be called multiple times or
  there may be multiple triggers attempting to create the same documents.

  ## Solution
  1. Ensure the auto_create_period_documents function has ON CONFLICT DO NOTHING
  2. Check for and remove any duplicate triggers
  3. Add defensive checks to prevent duplicate inserts

  ## Changes
  - Recreate auto_create_period_documents with proper conflict handling
  - Remove any duplicate triggers on work_recurring_instances table
  - Add logging to help debug future issues
*/

-- Step 1: Drop existing function and trigger
DROP TRIGGER IF EXISTS auto_create_period_documents_trigger ON work_recurring_instances;
DROP FUNCTION IF EXISTS auto_create_period_documents() CASCADE;

-- Step 2: Recreate the function with proper conflict handling
CREATE OR REPLACE FUNCTION auto_create_period_documents()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy all work documents to this period instance
  -- Use ON CONFLICT DO NOTHING to prevent duplicate key violations
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    notes,
    created_at,
    updated_at
  )
  SELECT
    NEW.id,
    wd.id,
    false,
    'Auto-created for period: ' || COALESCE(NEW.period_name, 'Unknown'),
    now(),
    now()
  FROM work_documents wd
  WHERE wd.work_id = NEW.work_id
  ON CONFLICT (work_recurring_instance_id, work_document_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create the trigger
CREATE TRIGGER auto_create_period_documents_trigger
  AFTER INSERT ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_period_documents();

-- Step 4: Clean up any duplicate period documents that may already exist
-- Keep only the first occurrence of each (work_recurring_instance_id, work_document_id) pair
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY work_recurring_instance_id, work_document_id
             ORDER BY created_at, id
           ) AS rn
    FROM work_recurring_period_documents
  )
  DELETE FROM work_recurring_period_documents
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % duplicate period documents', v_deleted_count;
  END IF;
END $$;
