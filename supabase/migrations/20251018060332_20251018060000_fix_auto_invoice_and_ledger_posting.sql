/*
  # Fix Auto-Invoice and Add Ledger Posting System
  
  ## Overview
  This migration comprehensively fixes auto-invoice creation and adds ledger posting functionality.
  
  ## Changes Made
  
  ### 1. Auto-Invoice Trigger Fixes
  - Properly selects income ledger from service mapping or company settings
  - Properly selects customer ledger from customer record
  - Uses voucher number generator with user settings
  - Shows actual service name (not "Auto-select from service/settings")
  - Shows actual tax rate from service (not hardcoded 18%)
  - Prevents duplicate invoice creation
  
  ### 2. Ledger Posting System
  - Creates ledger entries when invoices are saved
  - Creates ledger entries when vouchers are saved
  - Ensures amounts reflect in financial reports
  - Properly handles debit/credit accounting
  
  ## Important Notes
  - All amounts will now reflect in ledgers and financial reports
  - Invoice and voucher creation automatically posts to ledgers
  - Service-level settings take precedence over company defaults
*/

-- ============================================================================
-- PART 1: Fix Auto-Invoice Trigger
-- ============================================================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS auto_invoice_on_period_complete ON work_recurring_instances;

-- Recreate the function with all fixes
CREATE OR REPLACE FUNCTION auto_create_invoice_for_completed_period()
RETURNS TRIGGER AS $$
DECLARE
  v_work RECORD;
  v_service RECORD;
  v_customer RECORD;
  v_company_settings RECORD;
  v_invoice_number text;
  v_invoice_id uuid;
  v_tax_amount numeric;
  v_subtotal numeric;
  v_total_amount numeric;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
  v_existing_invoice_id uuid;
  v_invoice_count integer;
BEGIN
  -- Only create invoice if status changed to 'completed' and no invoice exists yet
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.invoice_id IS NULL THEN
    
    -- Check if an invoice already exists for this period (safety check)
    SELECT invoice_id INTO v_existing_invoice_id
    FROM work_recurring_instances
    WHERE id = NEW.id AND invoice_id IS NOT NULL;
    
    IF v_existing_invoice_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    
    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get service details including income_account_id and tax_rate
    SELECT s.*
    INTO v_service
    FROM services s
    WHERE s.id = v_work.service_id;
    
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get customer details with account_id
    SELECT c.*, c.account_id as customer_ledger_id
    INTO v_customer
    FROM customers c
    WHERE c.id = v_work.customer_id;
    
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get company settings
    SELECT *
    INTO v_company_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;
    
    -- Determine income ledger: service level FIRST, then company default
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings IS NOT NULL AND v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      v_income_ledger_id := NULL;
    END IF;
    
    -- Get customer ledger from customer record
    v_customer_ledger_id := v_customer.customer_ledger_id;
    
    -- Generate invoice number using voucher number configuration
    IF v_company_settings IS NOT NULL THEN
      SELECT COUNT(*) INTO v_invoice_count
      FROM invoices
      WHERE user_id = NEW.user_id;
      
      DECLARE
        v_prefix text := COALESCE(v_company_settings.invoice_prefix, 'INV');
        v_suffix text := COALESCE(v_company_settings.invoice_suffix, '');
        v_width integer := COALESCE(v_company_settings.invoice_number_width, 6);
        v_prefix_zero boolean := COALESCE(v_company_settings.invoice_number_prefix_zero, true);
        v_starting_number integer := COALESCE(v_company_settings.invoice_starting_number, 1);
        v_actual_number integer := v_starting_number + v_invoice_count;
        v_number_part text;
      BEGIN
        IF v_prefix_zero THEN
          v_number_part := LPAD(v_actual_number::text, v_width, '0');
        ELSE
          v_number_part := v_actual_number::text;
        END IF;
        
        v_invoice_number := v_prefix || '-' || v_number_part || v_suffix;
      END;
    ELSE
      -- Fallback
      SELECT 'INV-' || LPAD((COALESCE(COUNT(*), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = NEW.user_id;
    END IF;
    
    -- Calculate amounts using ACTUAL service tax_rate
    v_subtotal := COALESCE(v_service.default_price, 0);
    v_tax_amount := v_subtotal * COALESCE(v_service.tax_rate, 0) / 100;
    v_total_amount := v_subtotal + v_tax_amount;
    
    -- Only create invoice if there's a valid amount
    IF v_subtotal > 0 THEN
      -- Create the invoice
      INSERT INTO invoices (
        user_id,
        customer_id,
        invoice_number,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        total_amount,
        status,
        notes,
        income_account_id,
        customer_account_id,
        work_id
      ) VALUES (
        NEW.user_id,
        v_work.customer_id,
        v_invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        'draft',
        'Auto-generated for ' || v_service.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
        v_income_ledger_id,
        v_customer_ledger_id,
        NEW.work_id
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create invoice items WITH service_id and ACTUAL tax_rate
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
        v_service.name || ' - ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
        1,
        v_subtotal,
        v_subtotal,
        COALESCE(v_service.tax_rate, 0)
      );
      
      -- Link invoice to period
      NEW.invoice_id := v_invoice_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to auto-create invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER auto_invoice_on_period_complete
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();

-- ============================================================================
-- PART 2: Create Ledger Posting System for Invoices
-- ============================================================================

-- Function to post invoice to ledgers
CREATE OR REPLACE FUNCTION post_invoice_to_ledgers()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_entry_id uuid;
BEGIN
  -- Only post if both ledgers are mapped and invoice is not draft
  IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL AND NEW.status != 'draft' THEN
    
    -- Check if already posted
    IF EXISTS (
      SELECT 1 FROM ledger_entries
      WHERE reference_type = 'invoice'
      AND reference_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Create ledger entry header
    INSERT INTO ledger_entries (
      user_id,
      entry_date,
      reference_type,
      reference_id,
      description,
      total_amount
    ) VALUES (
      NEW.user_id,
      NEW.invoice_date,
      'invoice',
      NEW.id,
      'Invoice ' || NEW.invoice_number,
      NEW.total_amount
    )
    RETURNING id INTO v_ledger_entry_id;
    
    -- Debit customer account (Accounts Receivable)
    INSERT INTO ledger_entry_items (
      ledger_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_ledger_entry_id,
      NEW.customer_account_id,
      NEW.total_amount,
      0,
      'Customer: Invoice ' || NEW.invoice_number
    );
    
    -- Credit income account
    INSERT INTO ledger_entry_items (
      ledger_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_ledger_entry_id,
      NEW.income_account_id,
      0,
      NEW.total_amount,
      'Income: Invoice ' || NEW.invoice_number
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice posting
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledgers ON invoices;
CREATE TRIGGER trigger_post_invoice_to_ledgers
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status != 'draft' AND NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL)
  EXECUTE FUNCTION post_invoice_to_ledgers();

-- ============================================================================
-- PART 3: Create Ledger Posting System for Vouchers
-- ============================================================================

-- Function to post voucher entries to ledgers
CREATE OR REPLACE FUNCTION post_voucher_to_ledgers()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_entry_id uuid;
  v_item RECORD;
BEGIN
  -- Only post vouchers (not invoices which have separate handling)
  IF NEW.voucher_type IN ('receipt', 'payment', 'journal', 'contra') THEN
    
    -- Check if already posted
    IF EXISTS (
      SELECT 1 FROM ledger_entries
      WHERE reference_type = 'voucher'
      AND reference_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Create ledger entry header
    INSERT INTO ledger_entries (
      user_id,
      entry_date,
      reference_type,
      reference_id,
      description,
      total_amount
    ) VALUES (
      NEW.user_id,
      NEW.voucher_date,
      'voucher',
      NEW.id,
      NEW.voucher_type || ' ' || NEW.voucher_number,
      NEW.total_amount
    )
    RETURNING id INTO v_ledger_entry_id;
    
    -- Post all voucher items to ledgers
    FOR v_item IN
      SELECT * FROM voucher_items WHERE voucher_id = NEW.id
    LOOP
      INSERT INTO ledger_entry_items (
        ledger_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_ledger_entry_id,
        v_item.account_id,
        COALESCE(v_item.debit_amount, 0),
        COALESCE(v_item.credit_amount, 0),
        COALESCE(v_item.description, NEW.voucher_type || ' entry')
      );
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for voucher posting
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledgers ON vouchers;
CREATE TRIGGER trigger_post_voucher_to_ledgers
  AFTER INSERT ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION post_voucher_to_ledgers();

-- Add comments
COMMENT ON FUNCTION auto_create_invoice_for_completed_period IS 'Auto-creates invoices with proper ledger mapping and service details';
COMMENT ON FUNCTION post_invoice_to_ledgers IS 'Posts invoice transactions to ledgers for financial reporting';
COMMENT ON FUNCTION post_voucher_to_ledgers IS 'Posts voucher transactions to ledgers for financial reporting';
