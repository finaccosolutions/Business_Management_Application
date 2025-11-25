/*
  # Add Missing Invoice Status Change Trigger

  ## Problem
  The `handle_invoice_status_change()` function exists and is complete with logic to:
  - Post invoices to ledgers when status is 'sent' or 'paid'
  - Create receipt vouchers when status is 'paid'
  - Reverse all entries when status changes to 'draft' or 'cancelled'
  
  However, NO TRIGGER was calling this function on invoice status changes!
  
  ## Solution
  Create the BEFORE UPDATE trigger on invoices table that fires when status changes.
  This will automatically:
  1. Post to ledgers when invoice is marked as 'sent'
  2. Create receipt voucher when invoice is marked as 'paid'
  3. Clean up entries when invoice is reverted to 'draft'
  4. Clean up entries when invoice is marked as 'cancelled'
*/

-- Create the missing trigger for invoice status changes
DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;

CREATE TRIGGER trigger_handle_invoice_status_change
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION handle_invoice_status_change();