/*
  # Company Settings Table

  1. New Tables
    - `company_settings`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid, foreign key) - Reference to auth.users
      - `company_name` (text) - Name of the company
      - `company_logo_url` (text) - URL to company logo
      - `address_line1` (text) - Address line 1
      - `address_line2` (text) - Address line 2
      - `city` (text) - City
      - `state` (text) - State/Province
      - `postal_code` (text) - Postal/ZIP code
      - `country` (text) - Country
      - `phone` (text) - Company phone number
      - `email` (text) - Company email
      - `website` (text) - Company website
      - `tax_registration_number` (text) - Tax registration number (e.g., GSTIN, VAT, etc.)
      - `tax_label` (text) - Label for tax (e.g., "GST", "VAT", "Tax")
      - `bank_name` (text) - Bank name
      - `bank_account_number` (text) - Bank account number
      - `bank_ifsc_code` (text) - Bank IFSC/routing code
      - `bank_swift_code` (text) - Bank SWIFT/BIC code
      - `bank_branch` (text) - Bank branch
      - `invoice_prefix` (text) - Prefix for invoice numbers
      - `invoice_terms` (text) - Default invoice terms and conditions
      - `invoice_notes` (text) - Default invoice notes
      - `currency` (text) - Currency code (default: INR)
      - `currency_symbol` (text) - Currency symbol (default: ₹)
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Security
    - Enable RLS on `company_settings` table
    - Add policy for users to read their own settings
    - Add policy for users to insert their own settings
    - Add policy for users to update their own settings
    - Only one settings record per user

  3. Important Notes
    - Each user can have only one company settings record
    - The table stores all company information needed for invoices and documents
    - Logo URL should point to a public storage location
    - Tax registration details are flexible to accommodate different countries
*/

-- Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name text DEFAULT '',
  company_logo_url text,
  address_line1 text DEFAULT '',
  address_line2 text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  postal_code text DEFAULT '',
  country text DEFAULT 'India',
  phone text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',
  tax_registration_number text DEFAULT '',
  tax_label text DEFAULT 'GST',
  bank_name text DEFAULT '',
  bank_account_number text DEFAULT '',
  bank_ifsc_code text DEFAULT '',
  bank_swift_code text DEFAULT '',
  bank_branch text DEFAULT '',
  invoice_prefix text DEFAULT 'INV',
  invoice_terms text DEFAULT '',
  invoice_notes text DEFAULT 'Thank you for your business!',
  currency text DEFAULT 'INR',
  currency_symbol text DEFAULT '₹',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own settings
CREATE POLICY "Users can read own company settings"
  ON company_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own settings
CREATE POLICY "Users can insert own company settings"
  ON company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own settings
CREATE POLICY "Users can update own company settings"
  ON company_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_settings_user_id ON company_settings(user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_company_settings_timestamp ON company_settings;
CREATE TRIGGER update_company_settings_timestamp
  BEFORE UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_company_settings_updated_at();
