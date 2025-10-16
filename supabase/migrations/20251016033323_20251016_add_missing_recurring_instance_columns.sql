/*
  # Add Missing Columns to work_recurring_instances

  ## Overview
  Adds missing tracking columns to work_recurring_instances table that are referenced
  by existing triggers but were never created in the schema.

  ## New Columns
  1. `completed_at` - Timestamp when period was marked as completed
  2. `completed_by` - Staff member who completed the period
  3. `updated_at` - Timestamp of last update (for audit trail)

  ## Purpose
  These columns are needed for:
  - Tracking when periods are completed
  - Audit trail of who completed work
  - General record keeping and timestamps

  ## Security
  No RLS changes needed - columns inherit existing RLS policies
*/

-- Add completed_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- Add completed_by column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN completed_by uuid REFERENCES staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add updated_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add index for completed_at
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_completed_at ON work_recurring_instances(completed_at);

-- Add comments
COMMENT ON COLUMN work_recurring_instances.completed_at IS 'Timestamp when this period was marked as completed';
COMMENT ON COLUMN work_recurring_instances.completed_by IS 'Staff member who completed this period';
COMMENT ON COLUMN work_recurring_instances.updated_at IS 'Timestamp of last update to this record';
