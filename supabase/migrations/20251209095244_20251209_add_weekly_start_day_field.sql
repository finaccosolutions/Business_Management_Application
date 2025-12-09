/*
  # Add Weekly Start Day Support for Recurring Works

  1. New Field
    - `weekly_start_day` (text) - Day of week for weekly recurring work (monday, tuesday, wednesday, thursday, friday, saturday, sunday)
    - `monthly_start_day` (integer) - Day of month for monthly recurring work (1-31)
    - `quarterly_start_day` (integer) - Day of quarter start (1-31)
    - `half_yearly_start_day` (integer) - Day of half-year start (1-31)
    - `yearly_start_day` (integer) - Day of year start (1-31)

  2. Purpose
    - Store specific start days for different recurrence patterns
    - Enables more granular control over period generation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'weekly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN weekly_start_day text DEFAULT 'monday'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'monthly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN monthly_start_day integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'quarterly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN quarterly_start_day integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'half_yearly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN half_yearly_start_day integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'yearly_start_day'
  ) THEN
    ALTER TABLE works ADD COLUMN yearly_start_day integer DEFAULT 1;
  END IF;
END $$;
