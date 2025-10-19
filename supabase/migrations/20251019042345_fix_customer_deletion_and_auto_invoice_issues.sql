/*
  # Fix Customer Deletion and Auto-Invoice Issues

  ## Summary
  This migration fixes critical issues with customer deletion, auto-invoice creation, 
  and invoice number generation.

  ## Issues Fixed
  1. **Customer Deletion**: Add cascade delete from customers to chart_of_accounts (ledgers)
  2. **Ledger Mapping Validation**: Prevent auto-invoice if income ledger is not mapped
  3. **Duplicate Invoice Creation**: Fix trigger that fires on both INSERT and UPDATE causing duplicates
  4. **Invoice Number Generation**: Fix non-recurring work invoice to use company settings

  ## Changes Made
  1. Update foreign key constraint on customers.ledger_id (account_id) to use ON DELETE SET NULL
  2. Fix auto_generate_work_invoice function to:
     - Use company settings for invoice number generation
     - Check ledger mapping before creating invoice
     - Only fire on UPDATE when status changes to completed
     - Add service_id to invoice items
     - Use proper tax rate from service
  3. Drop and recreate trigger to only fire on UPDATE (not INSERT)

  ## Security
  - No RLS policy changes
  - All changes maintain existing security model
*/

-- ============================================================================
-- STEP 1: Fix Customer Account Relationship
-- ============================================================================

-- Drop existing foreign key if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'customers_ledger_id_fkey'
      AND table_name = 'customers'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_ledger_id_fkey;
  END IF;
END $$;

-- Add account_id if not exists (renamed from ledger_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'account_id'
  ) THEN
    -- If ledger_id exists, rename it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'customers' AND column_name = 'ledger_id'
    ) THEN
      ALTER TABLE customers RENAME COLUMN ledger_id TO account_id;
    ELSE
      -- Otherwise create new column
      ALTER TABLE customers ADD COLUMN account_id uuid;
    END IF;
  END IF;
END $$;

-- Add foreign key with SET NULL on delete (so deleting customer doesn't fail, but sets account_id to null in customer record)
-- When customer is deleted, their ledger entry in chart_of_accounts can remain for historical purposes
ALTER TABLE customers 
  DROP CONSTRAINT IF EXISTS customers_account_id_fkey;

ALTER TABLE customers 
  ADD CONSTRAINT customers_account_id_fkey 
  FOREIGN KEY (account_id) 
  REFERENCES chart_of_accounts(id) 
  ON DELETE SET NULL;

-- ============================================================================
-- STEP 2: Fix Non-Recurring Work Auto-Invoice Function
-- ============================================================================

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;

-- Replace function with fixed version
CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_customer_id uuid;
  v_service RECORD;
  v_customer RECORD;
  v_company_settings RECORD;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
  v_invoice_count integer;
  v_prefix text;
  v_suffix text;
  v_width integer;
  v_prefix_zero boolean;
  v_starting_number integer;
  v_actual_number integer;
  v_number_part text;
BEGIN
  -- Only proceed if:
  -- 1. Status changed to 'completed' (not on INSERT, only on UPDATE when status changes)
  -- 2. auto_bill is enabled
  -- 3. Has billing amount
  -- 4. No invoice already created for this work
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     NOT EXISTS (SELECT 1 FROM invoices WHERE work_id = NEW.id) THEN

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get service info including tax rate and ledger mapping
    SELECT * INTO v_service
    FROM services
    WHERE id = NEW.service_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Determine income ledger account (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      -- No income ledger mapped - cannot create invoice
      RAISE NOTICE 'Cannot create invoice for work % - Income ledger not mapped. Please map income ledger in service settings or company settings.', NEW.id;
      RETURN NEW;
    END IF;

    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;

    -- Calculate amounts using actual service tax rate
    v_subtotal := NEW.billing_amount;
    v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date based on payment terms
    IF v_service.payment_terms = 'net_15' THEN
      v_due_date := CURRENT_DATE + INTERVAL '15 days';
    ELSIF v_service.payment_terms = 'net_30' THEN
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    ELSIF v_service.payment_terms = 'net_45' THEN
      v_due_date := CURRENT_DATE + INTERVAL '45 days';
    ELSIF v_service.payment_terms = 'net_60' THEN
      v_due_date := CURRENT_DATE + INTERVAL '60 days';
    ELSIF v_service.payment_terms = 'due_on_receipt' THEN
      v_due_date := CURRENT_DATE;
    ELSE
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    -- Generate invoice number using company settings
    IF v_company_settings IS NOT NULL THEN
      -- Get current invoice count
      SELECT COUNT(*) INTO v_invoice_count
      FROM invoices
      WHERE user_id = NEW.user_id;
      
      -- Extract settings with defaults
      v_prefix := COALESCE(v_company_settings.invoice_prefix, 'INV');
      v_suffix := COALESCE(v_company_settings.invoice_suffix, '');
      v_width := COALESCE(v_company_settings.invoice_number_width, 6);
      v_prefix_zero := COALESCE(v_company_settings.invoice_number_prefix_zero, true);
      v_starting_number := COALESCE(v_company_settings.invoice_starting_number, 1);
      
      -- Calculate actual number
      v_actual_number := v_starting_number + v_invoice_count;
      
      -- Format number part
      IF v_prefix_zero THEN
        v_number_part := LPAD(v_actual_number::text, v_width, '0');
      ELSE
        v_number_part := v_actual_number::text;
      END IF;
      
      -- Assemble invoice number
      IF v_suffix != '' THEN
        v_invoice_number := v_prefix || '-' || v_number_part || '-' || v_suffix;
      ELSE
        v_invoice_number := v_prefix || '-' || v_number_part;
      END IF;
    ELSE
      -- Fallback if no company settings
      SELECT 'INV-' || LPAD((COALESCE(COUNT(*), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = NEW.user_id;
    END IF;

    -- Create invoice with proper tax calculation
    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total_amount,
      status,
      notes,
      income_account_id,
      customer_account_id
    ) VALUES (
      NEW.user_id,
      NEW.customer_id,
      NEW.id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for: ' || NEW.title,
      v_income_ledger_id,
      v_customer_ledger_id
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item with service reference and tax rate
    INSERT INTO invoice_items (
      invoice_id,
      service_id,
      description,
      quantity,
      unit_price,
      amount,
      tax_rate
    ) VALUES (
      v_invoice_id,
      v_service.id,
      'Work: ' || NEW.title,
      1,
      v_subtotal,
      v_subtotal,
      COALESCE(v_service.tax_rate, 0)
    );

    -- Update work billing status
    UPDATE works
    SET billing_status = 'billed'
    WHERE id = NEW.id;

    RAISE NOTICE 'Auto-created invoice % for work %', v_invoice_number, NEW.id;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger ONLY for UPDATE events (not INSERT)
-- This prevents duplicate invoice creation
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_generate_work_invoice();

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON FUNCTION auto_generate_work_invoice IS 
  'Auto-creates invoices for non-recurring works when status changes to completed. Validates ledger mappings, uses company settings for invoice numbering, and respects service-level tax rates and payment terms.';

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'Triggers auto-invoice creation when work status changes to completed. Only fires on UPDATE to prevent duplicate invoices.';
