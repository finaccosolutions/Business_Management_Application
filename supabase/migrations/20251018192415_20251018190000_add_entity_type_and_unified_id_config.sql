/*
  # Add Entity Type and Unified ID Configuration System

  ## Summary
  This migration adds comprehensive entity/legal form tracking and a unified ID configuration
  system for auto-generating IDs across the application.

  ## Changes Made

  ### 1. Customer Entity Type / Legal Form
  - Added `entity_type` field to customers table for tracking business structure
  - Added `legal_form` field as alternative naming for entity type
  - Supports values like: Individual, Sole Proprietor, Partnership, LLP, Private Limited, Public Limited, etc.

  ### 2. Unified ID Configuration System
  - Extended company_settings table to store ID generation configurations
  - Added columns for Employee ID, Service Code, and Work ID configurations
  - Each ID type has: prefix, suffix, number_width, prefix_zero, starting_number
  - Replaces the old "Voucher Number" tab with a comprehensive "ID Configuration" system

  ### 3. Auto-Generated IDs
  - Staff: employee_id auto-generation
  - Services: service_code already exists, enhanced with settings
  - Works: work_number for tracking work instances

  ## Security
  - All new columns allow NULL for backward compatibility
  - RLS policies already cover these columns through existing table policies
  - No data loss or breaking changes
*/

-- ============================================================================
-- 1. Add Entity Type / Legal Form to Customers
-- ============================================================================

DO $$
BEGIN
  -- Add entity_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE customers ADD COLUMN entity_type text DEFAULT 'individual';
  END IF;

  -- Add legal_form column (alternative naming)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'legal_form'
  ) THEN
    ALTER TABLE customers ADD COLUMN legal_form text;
  END IF;
END $$;

-- ============================================================================
-- 2. Add Unified ID Configuration to Company Settings
-- ============================================================================

DO $$
BEGIN
  -- Employee ID Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'employee_id_prefix'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN employee_id_prefix text DEFAULT 'EMP';
    ALTER TABLE company_settings ADD COLUMN employee_id_suffix text DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN employee_id_number_width integer DEFAULT 4;
    ALTER TABLE company_settings ADD COLUMN employee_id_prefix_zero boolean DEFAULT true;
    ALTER TABLE company_settings ADD COLUMN employee_id_starting_number integer DEFAULT 1;
  END IF;

  -- Service Code Configuration (enhancing existing)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'service_code_prefix'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN service_code_prefix text DEFAULT 'SRV';
    ALTER TABLE company_settings ADD COLUMN service_code_suffix text DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN service_code_number_width integer DEFAULT 4;
    ALTER TABLE company_settings ADD COLUMN service_code_prefix_zero boolean DEFAULT true;
    ALTER TABLE company_settings ADD COLUMN service_code_starting_number integer DEFAULT 1;
  END IF;

  -- Work ID Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'work_id_prefix'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN work_id_prefix text DEFAULT 'WRK';
    ALTER TABLE company_settings ADD COLUMN work_id_suffix text DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN work_id_number_width integer DEFAULT 4;
    ALTER TABLE company_settings ADD COLUMN work_id_prefix_zero boolean DEFAULT true;
    ALTER TABLE company_settings ADD COLUMN work_id_starting_number integer DEFAULT 1;
  END IF;
END $$;

-- ============================================================================
-- 3. Add Work Number to Works Table
-- ============================================================================

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
-- 4. Add Employee ID to Staff Table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE staff ADD COLUMN employee_id text;
  END IF;
END $$;

-- ============================================================================
-- 5. Update Existing Company Settings with Default Values
-- ============================================================================

UPDATE company_settings
SET
  employee_id_prefix = COALESCE(employee_id_prefix, 'EMP'),
  employee_id_suffix = COALESCE(employee_id_suffix, ''),
  employee_id_number_width = COALESCE(employee_id_number_width, 4),
  employee_id_prefix_zero = COALESCE(employee_id_prefix_zero, true),
  employee_id_starting_number = COALESCE(employee_id_starting_number, 1),

  service_code_prefix = COALESCE(service_code_prefix, 'SRV'),
  service_code_suffix = COALESCE(service_code_suffix, ''),
  service_code_number_width = COALESCE(service_code_number_width, 4),
  service_code_prefix_zero = COALESCE(service_code_prefix_zero, true),
  service_code_starting_number = COALESCE(service_code_starting_number, 1),

  work_id_prefix = COALESCE(work_id_prefix, 'WRK'),
  work_id_suffix = COALESCE(work_id_suffix, ''),
  work_id_number_width = COALESCE(work_id_number_width, 4),
  work_id_prefix_zero = COALESCE(work_id_prefix_zero, true),
  work_id_starting_number = COALESCE(work_id_starting_number, 1)
WHERE TRUE;

-- ============================================================================
-- 6. Create Helper Function for Generating IDs
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_next_id(
  p_user_id uuid,
  p_id_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_suffix text;
  v_width integer;
  v_prefix_zero boolean;
  v_starting_number integer;
  v_current_max integer := 0;
  v_next_number integer;
  v_number_str text;
  v_result text;
BEGIN
  EXECUTE format('
    SELECT
      %I,
      %I,
      %I,
      %I,
      %I
    FROM company_settings
    WHERE user_id = $1
    LIMIT 1',
    p_id_type || '_prefix',
    p_id_type || '_suffix',
    p_id_type || '_number_width',
    p_id_type || '_prefix_zero',
    p_id_type || '_starting_number'
  ) INTO v_prefix, v_suffix, v_width, v_prefix_zero, v_starting_number
  USING p_user_id;

  IF v_prefix IS NULL THEN
    CASE p_id_type
      WHEN 'employee_id' THEN v_prefix := 'EMP';
      WHEN 'service_code' THEN v_prefix := 'SRV';
      WHEN 'work_id' THEN v_prefix := 'WRK';
    END CASE;
    v_suffix := '';
    v_width := 4;
    v_prefix_zero := true;
    v_starting_number := 1;
  END IF;

  CASE p_id_type
    WHEN 'employee_id' THEN
      SELECT COALESCE(MAX(
        NULLIF(regexp_replace(employee_id, '[^0-9]', '', 'g'), '')::integer
      ), 0) INTO v_current_max
      FROM staff
      WHERE user_id = p_user_id AND employee_id IS NOT NULL;

    WHEN 'service_code' THEN
      SELECT COALESCE(MAX(
        NULLIF(regexp_replace(service_code, '[^0-9]', '', 'g'), '')::integer
      ), 0) INTO v_current_max
      FROM services
      WHERE user_id = p_user_id AND service_code IS NOT NULL;

    WHEN 'work_id' THEN
      SELECT COALESCE(MAX(
        NULLIF(regexp_replace(work_number, '[^0-9]', '', 'g'), '')::integer
      ), 0) INTO v_current_max
      FROM works
      WHERE user_id = p_user_id AND work_number IS NOT NULL;
  END CASE;

  v_next_number := GREATEST(v_current_max + 1, v_starting_number);

  IF v_prefix_zero THEN
    v_number_str := lpad(v_next_number::text, v_width, '0');
  ELSE
    v_number_str := v_next_number::text;
  END IF;

  v_result := v_prefix || v_number_str || v_suffix;

  RETURN v_result;
END;
$$;

COMMENT ON COLUMN customers.entity_type IS 'Business structure type: Individual, Sole Proprietor, Partnership, LLP, Private Limited, Public Limited, etc.';
COMMENT ON COLUMN customers.legal_form IS 'Alternative name for entity_type - legal form of the business';

COMMENT ON COLUMN company_settings.employee_id_prefix IS 'Prefix for auto-generated employee IDs (default: EMP)';
COMMENT ON COLUMN company_settings.service_code_prefix IS 'Prefix for auto-generated service codes (default: SRV)';
COMMENT ON COLUMN company_settings.work_id_prefix IS 'Prefix for auto-generated work IDs (default: WRK)';

COMMENT ON COLUMN works.work_number IS 'Unique identifier for work instance (auto-generated)';
COMMENT ON COLUMN staff.employee_id IS 'Unique identifier for employee (auto-generated)';

COMMENT ON FUNCTION generate_next_id IS 'Helper function to generate the next ID for employee, service, or work based on company settings';
