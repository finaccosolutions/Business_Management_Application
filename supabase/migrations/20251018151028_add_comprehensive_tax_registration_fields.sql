/*
  # Add Comprehensive Tax Registration Fields to Company Settings

  ## Purpose
  Add country-specific tax registration and statutory fields to support businesses from different countries.
  These fields will store additional tax identifiers, business registration numbers, and other statutory information.

  ## Changes
  1. Add fields for additional tax identifiers (PAN, TAN, EIN, SSN, etc.)
  2. Add fields for business registration numbers
  3. Add JSONB field for flexible country-specific data storage

  ## Fields Added
  - pan_number: PAN (India), SSN (US), etc.
  - tan_number: TAN number (India)
  - ein_number: EIN (US)
  - vat_number: VAT number (Europe, UAE, etc.)
  - business_registration_number: Company/Business registration number
  - trade_license_number: Trade license number
  - other_tax_details: JSONB for additional country-specific fields
*/

-- Add comprehensive tax registration fields
DO $$
BEGIN
  -- PAN Number (India) / SSN (US) / National Tax ID
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'pan_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN pan_number text DEFAULT '';
  END IF;

  -- TAN Number (India) 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'tan_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN tan_number text DEFAULT '';
  END IF;

  -- EIN - Employer Identification Number (US)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'ein_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN ein_number text DEFAULT '';
  END IF;

  -- VAT Number (Europe, UAE, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'vat_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN vat_number text DEFAULT '';
  END IF;

  -- ABN/ACN (Australia)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'abn_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN abn_number text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'acn_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN acn_number text DEFAULT '';
  END IF;

  -- Business Registration Number (Generic)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'business_registration_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN business_registration_number text DEFAULT '';
  END IF;

  -- Trade License Number (UAE, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'trade_license_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN trade_license_number text DEFAULT '';
  END IF;

  -- MSME/Udyam Number (India)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'msme_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN msme_number text DEFAULT '';
  END IF;

  -- UEN - Unique Entity Number (Singapore)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'uen_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN uen_number text DEFAULT '';
  END IF;

  -- SST Number (Malaysia)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'sst_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN sst_number text DEFAULT '';
  END IF;

  -- NZBN - New Zealand Business Number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'nzbn_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN nzbn_number text DEFAULT '';
  END IF;

  -- German Tax Number (Steuernummer)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'german_tax_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN german_tax_number text DEFAULT '';
  END IF;

  -- French SIRET Number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'siret_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN siret_number text DEFAULT '';
  END IF;

  -- Canadian Business Number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'canadian_business_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN canadian_business_number text DEFAULT '';
  END IF;

  -- UK Company Registration Number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'uk_company_number'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN uk_company_number text DEFAULT '';
  END IF;

  -- JSONB field for additional flexible country-specific data
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'other_tax_details'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN other_tax_details jsonb DEFAULT '{}'::jsonb;
  END IF;

END $$;
