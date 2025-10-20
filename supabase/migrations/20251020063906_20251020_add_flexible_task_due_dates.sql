/*
  # Add Flexible Task Due Date Configuration

  ## Overview
  This migration adds flexible due date configuration for service tasks to support:
  - Task-level recurrence frequency (must be ≤ service recurrence)
  - Offset from period end (days or months)
  - Specific date overrides for particular periods

  ## Changes to service_tasks table

  ### New Columns:
  - `task_recurrence_type`: How frequently this task is due (e.g., 'monthly' for a quarterly service)
    - Must be equal to or more frequent than service recurrence
    - Options: 'monthly', 'quarterly', 'half-yearly', 'yearly'
  - `due_offset_type`: Whether offset is in 'days' or 'months'
  - `due_offset_value`: Number of days/months to offset from period end
  - `specific_period_dates`: JSONB storing period-specific due date overrides
    - Format: {"2025-09": "2025-09-25", "2025-10": "2025-10-20"}
    - Keys are period identifiers (YYYY-MM for monthly, Q1-2025 for quarterly, etc.)
    - Values are the exact due dates for that period

  ## Example Use Cases:

  ### Case 1: GST Monthly Filing
  - Service: Monthly GST
  - Task 1: GSTR-1 (monthly, 10 days offset from period end, days)
  - Task 2: GSTR-3B (monthly, 20 days offset from period end, days)
  - Override: September 2025 extended to 25th: {"2025-09": "2025-09-25"}

  ### Case 2: GST Quarterly Filing
  - Service: Quarterly GST
  - Task 1: GSTR-1 (quarterly, 1 month + 10 days offset, mixed)
  - Task 2: GSTR-3B (quarterly, 1 month + 20 days offset, mixed)
  - Task 3: Monthly GSTR-3B (monthly, 20 days offset) - recurs more frequently

  ## Security
  All existing RLS policies apply to new columns

  ## Important Notes
  1. task_recurrence_type cannot be less frequent than service recurrence
  2. specific_period_dates override all calculated dates for that period only
  3. Offset values are from the END of the period by default
*/

-- Add task_recurrence_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'task_recurrence_type'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN task_recurrence_type text;
  END IF;
END $$;

-- Add due_offset_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'due_offset_type'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN due_offset_type text DEFAULT 'days';
  END IF;
END $$;

-- Add due_offset_value column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'due_offset_value'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN due_offset_value integer DEFAULT 10;
  END IF;
END $$;

-- Add specific_period_dates column for period-specific overrides
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'specific_period_dates'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN specific_period_dates jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add comments to explain the columns
COMMENT ON COLUMN service_tasks.task_recurrence_type IS 'How frequently this task is due (monthly, quarterly, etc.). Must be ≤ service recurrence frequency.';
COMMENT ON COLUMN service_tasks.due_offset_type IS 'Type of offset from period end: days or months';
COMMENT ON COLUMN service_tasks.due_offset_value IS 'Number of days/months offset from period end for calculating due date';
COMMENT ON COLUMN service_tasks.specific_period_dates IS 'JSONB object with period-specific due date overrides. Format: {"2025-09": "2025-09-25"}';

-- Create index for better performance on JSONB queries
CREATE INDEX IF NOT EXISTS idx_service_tasks_specific_period_dates
ON service_tasks USING gin(specific_period_dates);
