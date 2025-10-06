-- ==============================================================
-- SERVICES TABLE COLUMN ADDITIONS
-- ==============================================================
-- This SQL script adds all missing columns to the services table
-- Run this in your Supabase SQL Editor
-- ==============================================================

-- Add service_code column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'service_code'
  ) THEN
    ALTER TABLE services ADD COLUMN service_code text;
  END IF;
END $$;

-- Add category column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'category'
  ) THEN
    ALTER TABLE services ADD COLUMN category text;
  END IF;
END $$;

-- Add image_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE services ADD COLUMN image_url text;
  END IF;
END $$;

-- Add estimated_duration_hours column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'estimated_duration_hours'
  ) THEN
    ALTER TABLE services ADD COLUMN estimated_duration_hours integer DEFAULT 0;
  END IF;
END $$;

-- Add estimated_duration_minutes column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'estimated_duration_minutes'
  ) THEN
    ALTER TABLE services ADD COLUMN estimated_duration_minutes integer DEFAULT 0;
  END IF;
END $$;

-- Add tax_rate column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE services ADD COLUMN tax_rate numeric(5, 2) DEFAULT 0;
  END IF;
END $$;

-- Add status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'status'
  ) THEN
    ALTER TABLE services ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- Add custom_fields column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'custom_fields'
  ) THEN
    ALTER TABLE services ADD COLUMN custom_fields jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add recurrence_day column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_day'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_day integer;
  END IF;
END $$;

-- Add recurrence_days column (array for weekly recurrence)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_days'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_days integer[];
  END IF;
END $$;

-- Add recurrence_month column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_month'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_month integer;
  END IF;
END $$;

-- Add recurrence_start_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_start_date'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_start_date date;
  END IF;
END $$;

-- Add recurrence_end_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_end_date'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_end_date date;
  END IF;
END $$;

-- Add advance_notice_days column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'advance_notice_days'
  ) THEN
    ALTER TABLE services ADD COLUMN advance_notice_days integer DEFAULT 3;
  END IF;
END $$;

-- Add auto_generate_work column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'auto_generate_work'
  ) THEN
    ALTER TABLE services ADD COLUMN auto_generate_work boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);

-- ==============================================================
-- VERIFICATION QUERY
-- ==============================================================
-- Run this to verify all columns were added successfully:
--
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'services'
-- ORDER BY ordinal_position;
-- ==============================================================
