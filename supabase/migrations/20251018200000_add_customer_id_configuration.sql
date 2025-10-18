/*
  # Add Customer ID Configuration and Field

  ## Summary
  This migration adds customer_id configuration to the unified ID system and adds
  the customer_id field to the customers table for auto-generated customer IDs.

  ## Changes Made

  ### 1. Customer ID Configuration
  - Added customer_id_prefix, customer_id_suffix, customer_id_number_width,
    customer_id_prefix_zero, and customer_id_starting_number to company_settings
  - Default prefix: 'CUST'
  - Default width: 4 digits
  - Default starting number: 1

  ### 2. Customers Table
  - Added customer_id text column to customers table
  - This will store auto-generated customer IDs like CUST0001, CUST0002, etc.

  ### 3. Update ID Generation Function
  - Updated generate_next_id function to support 'customer_id' as a valid ID type
  - Function now extracts the highest numeric value from existing customer_ids
  - Generates the next sequential ID based on company settings

  ## Security
  - All new columns allow NULL for backward compatibility
  - RLS policies already cover these columns through existing table policies
  - No data loss or breaking changes

  ## Usage
  - Frontend can call: generate_next_id(user_id, 'customer_id')
  - Returns formatted ID like: CUST0001
*/

-- ============================================================================
-- 1. Add Customer ID Configuration to Company Settings
-- ============================================================================

DO $$
BEGIN
  -- Customer ID Configuration
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

-- ============================================================================
-- 2. Add customer_id Field to Customers Table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN customer_id text;
  END IF;
END $$;

-- ============================================================================
-- 3. Update Existing Company Settings with Default Values
-- ============================================================================

UPDATE company_settings
SET
  customer_id_prefix = COALESCE(customer_id_prefix, 'CUST'),
  customer_id_suffix = COALESCE(customer_id_suffix, ''),
  customer_id_number_width = COALESCE(customer_id_number_width, 4),
  customer_id_prefix_zero = COALESCE(customer_id_prefix_zero, true),
  customer_id_starting_number = COALESCE(customer_id_starting_number, 1)
WHERE TRUE;

-- ============================================================================
-- 4. Update Helper Function for Generating IDs (Add Customer ID Support)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_next_id(
  p_user_id uuid,
  p_id_type text -- 'employee_id', 'service_code', 'work_id', or 'customer_id'
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
  -- Get configuration from company_settings
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

  -- If no settings found, use defaults
  IF v_prefix IS NULL THEN
    CASE p_id_type
      WHEN 'employee_id' THEN v_prefix := 'EMP';
      WHEN 'service_code' THEN v_prefix := 'SRV';
      WHEN 'work_id' THEN v_prefix := 'WRK';
      WHEN 'customer_id' THEN v_prefix := 'CUST';
    END CASE;
    v_suffix := '';
    v_width := 4;
    v_prefix_zero := true;
    v_starting_number := 1;
  END IF;

  -- Get current maximum number
  CASE p_id_type
    WHEN 'employee_id' THEN
      SELECT COALESCE(MAX(
        NULLIF(regexp_replace(employee_id, '[^0-9]', '', 'g'), '')::integer
      ), 0) INTO v_current_max
      FROM staff_members
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

    WHEN 'customer_id' THEN
      SELECT COALESCE(MAX(
        NULLIF(regexp_replace(customer_id, '[^0-9]', '', 'g'), '')::integer
      ), 0) INTO v_current_max
      FROM customers
      WHERE user_id = p_user_id AND customer_id IS NOT NULL;
  END CASE;

  -- Calculate next number
  v_next_number := GREATEST(v_current_max + 1, v_starting_number);

  -- Format number with leading zeros if enabled
  IF v_prefix_zero THEN
    v_number_str := lpad(v_next_number::text, v_width, '0');
  ELSE
    v_number_str := v_next_number::text;
  END IF;

  -- Build final ID
  v_result := v_prefix || v_number_str || v_suffix;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 5. Comments and Documentation
-- ============================================================================

COMMENT ON COLUMN customers.customer_id IS 'Unique auto-generated customer identifier (e.g., CUST0001)';
COMMENT ON COLUMN company_settings.customer_id_prefix IS 'Prefix for auto-generated customer IDs (default: CUST)';

COMMENT ON FUNCTION generate_next_id IS 'Helper function to generate the next ID for employee, service, work, or customer based on company settings';
