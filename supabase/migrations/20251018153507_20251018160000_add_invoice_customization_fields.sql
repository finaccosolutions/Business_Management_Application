/*
  # Add Invoice Template Customization Fields

  1. New Columns Added to company_settings
    - `invoice_logo_position` - Position of logo (left, center, right)
    - `invoice_show_supplier_section` - Show supplier details section
    - `invoice_show_buyer_section` - Show buyer details section
    - `invoice_supplier_position` - Position of supplier details
    - `invoice_buyer_position` - Position of buyer details
    - `invoice_number_position` - Position of invoice number
    - `invoice_split_gst` - Split GST into CGST/SGST/IGST

  2. Changes
    - Add customization fields for invoice template
    - Enable flexible positioning of invoice elements
    - Support for CGST/SGST/IGST breakdown
*/

-- Add invoice customization fields to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_logo_position'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_logo_position text DEFAULT 'left';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_show_supplier_section'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_supplier_section boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_show_buyer_section'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_buyer_section boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_supplier_position'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_supplier_position text DEFAULT 'left';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_buyer_position'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_buyer_position text DEFAULT 'left';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_number_position'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_number_position text DEFAULT 'right';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_split_gst'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN invoice_split_gst boolean DEFAULT true;
  END IF;
END $$;