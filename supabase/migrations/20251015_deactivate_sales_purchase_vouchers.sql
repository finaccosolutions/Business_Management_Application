/*
  # Deactivate Sales and Purchase Voucher Types

  1. Changes
    - Set is_active = false for SALES and PURCHASE voucher types
    - These are not needed for service businesses

  2. Notes
    - This will hide SALES and PURCHASE vouchers from the vouchers page
    - Existing vouchers of these types will remain in the database but hidden
*/

-- Deactivate SALES and PURCHASE voucher types for all users
UPDATE voucher_types
SET is_active = false
WHERE code IN ('SALES', 'PURCHASE');
