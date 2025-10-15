/*
  # Add Due Date Configuration to Work Tasks

  ## Overview
  This migration adds due date fields to the work_tasks table, enabling:
  - Individual due dates for each task
  - Due date offset configuration (similar to service tasks)
  - Flexible due date management per task

  ## Modified Tables

  ### work_tasks
  Added columns:
  - `due_date`: Specific due date for the task
  - `due_date_offset_days`: Default offset from period/work start
  - `due_date_offset_type`: Offset from 'period_start', 'period_end', 'month_start', or 'work_start'

  ## Features
  1. **Individual Task Due Dates**
     - Each task can have its own specific due date
     - Due dates can be set independently of work due date

  2. **Offset Configuration**
     - Tasks can use offset rules similar to service tasks
     - Useful for recurring works with multiple deadlines

  3. **Flexible Management**
     - Due dates can be manually set or calculated from offsets
     - Supports both one-time and recurring work patterns

  ## Important Notes
  1. Due dates are optional and can be set per task
  2. For recurring works, period tasks use recurring_period_tasks table
  3. For one-time works, work_tasks table is used
*/

-- Add columns to work_tasks for due date configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_tasks' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE work_tasks ADD COLUMN due_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_tasks' AND column_name = 'due_date_offset_days'
  ) THEN
    ALTER TABLE work_tasks ADD COLUMN due_date_offset_days integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_tasks' AND column_name = 'due_date_offset_type'
  ) THEN
    ALTER TABLE work_tasks ADD COLUMN due_date_offset_type text DEFAULT 'work_start';
  END IF;
END $$;

COMMENT ON COLUMN work_tasks.due_date IS 'Specific due date for this task';
COMMENT ON COLUMN work_tasks.due_date_offset_days IS 'Number of days offset for due date calculation';
COMMENT ON COLUMN work_tasks.due_date_offset_type IS 'Type of offset: work_start (days from work start), period_start, period_end, month_start';

-- Create index for efficient due date queries
CREATE INDEX IF NOT EXISTS idx_work_tasks_due_date ON work_tasks(due_date);
