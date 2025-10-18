/*
  # Add State Code Fields for GST Tax Calculation

  1. Purpose
    - Add state_code field to customers table for GST calculations
    - Add state_code field to company_settings table
    - Enable proper CGST/SGST/IGST split based on state comparison

  2. Changes
    - Add state_code to customers table
    - Add state_code to company_settings table
    - These codes are used to determine if transaction is intra-state or inter-state
*/

-- Add state_code to customers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE customers ADD COLUMN state_code text;
  END IF;
END $$;

-- Add state_code to company_settings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN state_code text;
  END IF;
END $$;
