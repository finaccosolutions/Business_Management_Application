/*
  # Add GSTIN field to customers table

  1. Changes
    - Add `gstin` column to `customers` table for storing GST Identification Number
    - This is useful for India-based businesses that need to track customer GST details

  2. Notes
    - GSTIN is optional as not all customers may have it
    - Used for generating tax-compliant invoices in India
*/

-- Add GSTIN column to customers table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'gstin'
  ) THEN
    ALTER TABLE customers ADD COLUMN gstin text DEFAULT '';
  END IF;
END $$;
