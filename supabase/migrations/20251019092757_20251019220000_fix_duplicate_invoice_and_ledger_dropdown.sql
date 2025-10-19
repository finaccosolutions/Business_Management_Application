/*
  # Fix Duplicate Invoice Creation and Ledger Dropdown Issues
  
  ## Problems Fixed:
  
  1. **Duplicate Invoice Creation for Non-Recurring Works**
     - Old trigger `set_invoice_number_trigger` was using deprecated `generate_invoice_number()` function
     - This was creating a second invoice with "INV-0001" format
     - Solution: Drop the old trigger completely as invoice number is now handled in auto_generate_work_invoice()
  
  2. **No Ledger Accounts Showing in Dropdown**
     - Frontend filter was too strict (only showing accounts starting with '4' or containing 'income')
     - Solution: Show ALL active accounts in dropdown but keep helper text
  
  3. **Customer Account Should Auto-Fill Based on Selected Customer**
     - Currently showing as dropdown in InvoiceFormModal
     - Should auto-populate from customer's account_id when customer is selected
  
  ## Changes:
  - Drop old `set_invoice_number_trigger` on invoices table
  - Drop deprecated `generate_invoice_number()` function
  - Invoice numbering now only uses `generate_next_invoice_number()` in trigger functions
*/

-- =====================================================
-- Step 1: Remove Old Invoice Numbering Trigger
-- =====================================================

DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;

-- Drop the deprecated function that was causing INV-0001 format
DROP FUNCTION IF EXISTS set_invoice_number(uuid);
DROP FUNCTION IF EXISTS generate_invoice_number(uuid);

-- =====================================================
-- Step 2: Ensure Only One Trigger Creates Invoices for Works
-- =====================================================

-- Verify only trigger_auto_generate_work_invoice exists (already done in previous migration)
-- This is the ONLY trigger that should create invoices from works table

-- =====================================================
-- Step 3: Comments and Documentation
-- =====================================================

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'ONLY trigger to auto-generate invoice when non-recurring work is completed. Uses generate_next_invoice_number() for proper numbering.';

COMMENT ON FUNCTION generate_next_invoice_number(uuid) IS
  'Generates invoice number based on company_settings configuration. Used by all invoice creation triggers.';

-- Verification Query (for manual checking):
-- SELECT tgname, proname FROM pg_trigger t 
-- JOIN pg_proc p ON t.tgfoid = p.oid 
-- WHERE tgrelid = 'works'::regclass AND tgname LIKE '%invoice%';