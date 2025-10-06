-- ============================================================
-- COPY THIS ENTIRE FILE AND RUN IN SUPABASE SQL EDITOR
-- ============================================================
-- This will add all missing columns to your services table
-- Safe to run multiple times (uses IF NOT EXISTS checks)
-- ============================================================

ALTER TABLE services ADD COLUMN IF NOT EXISTS service_code text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS estimated_duration_hours integer DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS estimated_duration_minutes integer DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE services ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurrence_day integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurrence_days integer[];
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurrence_month integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurrence_start_date date;
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurrence_end_date date;
ALTER TABLE services ADD COLUMN IF NOT EXISTS advance_notice_days integer DEFAULT 3;
ALTER TABLE services ADD COLUMN IF NOT EXISTS auto_generate_work boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);

-- ============================================================
-- DONE! Your services table is now updated.
-- You can now create services without errors.
-- ============================================================
