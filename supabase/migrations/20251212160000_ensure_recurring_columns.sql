/*
  # Ensure Recurring Work Columns Exist
  
  This migration ensures that the start day columns for various recurrence types
  exist in the `works` table. This acts as a fix for environments where
  previous migrations might not have applied these columns correctly.

  Columns checked/added:
  - weekly_start_day (text)
  - monthly_start_day (integer)
  - quarterly_start_day (integer)
  - half_yearly_start_day (integer)
  - yearly_start_day (integer)
*/

DO $$
BEGIN
  -- Weekly Start Day
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'weekly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN weekly_start_day text DEFAULT 'monday';
  END IF;

  -- Monthly Start Day
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'monthly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN monthly_start_day integer DEFAULT 1;
  END IF;

  -- Quarterly Start Day
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'quarterly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN quarterly_start_day integer DEFAULT 1;
  END IF;

  -- Half-Yearly Start Day
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'half_yearly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN half_yearly_start_day integer DEFAULT 1;
  END IF;

  -- Yearly Start Day
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'yearly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN yearly_start_day integer DEFAULT 1;
  END IF;
END $$;
