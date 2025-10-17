/*
  # Add tax_rate column to invoice_items table
  
  This migration adds the missing tax_rate column to the invoice_items table
  to support the auto-invoice generation feature.
  
  ## Changes
  1. Adds `tax_rate` column to invoice_items table (numeric, defaults to 0)
  2. This fixes the error when completing the last task in a recurring period
*/

-- Add tax_rate column to invoice_items if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN tax_rate numeric(5, 2) DEFAULT 0;
  END IF;
END $$;
