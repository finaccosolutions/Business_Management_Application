/*
  # Fix Entity ID Columns for Customers, Staff, Services, and Works

  1. Changes
    - Add customer_id column to customers table if not exists
    - Add employee_id column to staff_members table if not exists
    - Add service_code column to services table if not exists
    - Add work_number column to works table if not exists
    - Ensure all columns are properly configured

  2. Security
    - No RLS changes needed (existing policies apply)
*/

-- ============================================================================
-- Add Missing ID Columns
-- ============================================================================

-- Add customer_id to customers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN customer_id text;
  END IF;
END $$;

-- Add employee_id to staff_members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_members' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE staff_members ADD COLUMN employee_id text;
  END IF;
END $$;

-- Add service_code to services table (should already exist but check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'service_code'
  ) THEN
    ALTER TABLE services ADD COLUMN service_code text;
  END IF;
END $$;

-- Add work_number to works table (should already exist but check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'work_number'
  ) THEN
    ALTER TABLE works ADD COLUMN work_number text;
  END IF;
END $$;

-- ============================================================================
-- Ensure company_settings has all ID configuration columns
-- ============================================================================

DO $$
BEGIN
  -- Customer ID columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'customer_id_prefix'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN customer_id_prefix text DEFAULT 'CUST';
    ALTER TABLE company_settings ADD COLUMN customer_id_suffix text DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN customer_id_number_width integer DEFAULT 4;
    ALTER TABLE company_settings ADD COLUMN customer_id_prefix_zero boolean DEFAULT true;
    ALTER TABLE company_settings ADD COLUMN customer_id_starting_number integer DEFAULT 1;
  END IF;
END $$;

-- Update existing company_settings with default values if needed
UPDATE company_settings
SET
  customer_id_prefix = COALESCE(customer_id_prefix, 'CUST'),
  customer_id_suffix = COALESCE(customer_id_suffix, ''),
  customer_id_number_width = COALESCE(customer_id_number_width, 4),
  customer_id_prefix_zero = COALESCE(customer_id_prefix_zero, true),
  customer_id_starting_number = COALESCE(customer_id_starting_number, 1)
WHERE customer_id_prefix IS NULL OR customer_id_prefix = '';
