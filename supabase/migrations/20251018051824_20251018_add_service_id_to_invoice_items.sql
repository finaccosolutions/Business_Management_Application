/*
  # Add service_id to invoice_items

  ## Overview
  Adds service_id reference to invoice_items table to enable proper service
  selection when editing invoices.

  ## Changes
  - Add service_id column to invoice_items table
  - Add foreign key constraint to services table
  - This allows us to know which service was used for each line item
  - Makes invoice editing preserve service selection

  ## Important Notes
  - Existing invoice items will have NULL service_id (manual items)
  - New invoice items created from services will store the service_id
  - This does not break existing functionality
*/

-- Add service_id column to invoice_items
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoice_items_service_id ON invoice_items(service_id);

-- Add comment
COMMENT ON COLUMN invoice_items.service_id IS 'Reference to the service used for this line item (NULL for manual items)';
