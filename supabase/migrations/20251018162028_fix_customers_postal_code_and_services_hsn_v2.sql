/*
  # Fix Customers postal_code and Add Services HSN field

  1. Changes to customers table
    - Add `postal_code` column if it doesn't exist (to fix invoice query errors)
    
  2. Changes to services table
    - Add `hsn_code` column for HSN/SAC code (for invoice display)
    
  3. Changes to user signup triggers
    - Update trigger to create default accounting vouchers (excluding Invoice) at signup
    - Invoice voucher type already exists above Accounting Vouchers section
*/

-- Add postal_code column to customers table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'postal_code'
  ) THEN
    ALTER TABLE customers ADD COLUMN postal_code text;
  END IF;
END $$;

-- Add HSN code column to services table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'services' AND column_name = 'hsn_code'
  ) THEN
    ALTER TABLE services ADD COLUMN hsn_code text;
    COMMENT ON COLUMN services.hsn_code IS 'HSN/SAC code for tax purposes, displayed on invoices';
  END IF;
END $$;

-- Create function to setup default accounting vouchers for new users (excluding Invoice)
CREATE OR REPLACE FUNCTION create_default_accounting_vouchers()
RETURNS TRIGGER AS $$
BEGIN
  -- Payment Voucher
  INSERT INTO voucher_types (user_id, name, code, is_active, display_order)
  VALUES (NEW.id, 'Payment', 'ITMPMT', true, 10)
  ON CONFLICT (user_id, code) DO NOTHING;
  
  -- Receipt Voucher
  INSERT INTO voucher_types (user_id, name, code, is_active, display_order)
  VALUES (NEW.id, 'Receipt', 'ITMRCT', true, 20)
  ON CONFLICT (user_id, code) DO NOTHING;
  
  -- Journal Voucher
  INSERT INTO voucher_types (user_id, name, code, is_active, display_order)
  VALUES (NEW.id, 'Journal', 'ITMJNL', true, 30)
  ON CONFLICT (user_id, code) DO NOTHING;
  
  -- Contra Voucher
  INSERT INTO voucher_types (user_id, name, code, is_active, display_order)
  VALUES (NEW.id, 'Contra', 'ITMCNT', true, 40)
  ON CONFLICT (user_id, code) DO NOTHING;
  
  -- Note: Invoice voucher (ITMINV) is NOT created here as it exists in separate Invoice section
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS trigger_create_default_accounting_vouchers ON profiles;

CREATE TRIGGER trigger_create_default_accounting_vouchers
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_accounting_vouchers();
