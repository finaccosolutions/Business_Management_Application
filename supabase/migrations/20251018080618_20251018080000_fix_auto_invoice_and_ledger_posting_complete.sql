/*
  # Complete Fix for Auto-Invoice and Ledger Posting

  ## Summary
  This migration completely fixes both auto-invoice creation and ledger posting systems.

  ## Issues Fixed
  
  ### Auto-Invoice Creation Issues:
  1. Trigger was trying to access NEW.user_id but work_recurring_instances doesn't have user_id
  2. Fixed to get user_id from works table via JOIN
  
  ### Ledger Posting Issues:
  1. Functions were trying to use non-existent ledger_entries and ledger_entry_items tables
  2. Database actually uses ledger_transactions table directly
  3. Functions were checking for voucher_type column that doesn't exist
  4. Fixed to use voucher_type_id and JOIN with voucher_types table
  
  ## Changes Made
  1. Fix auto-invoice trigger to properly get user_id from works table
  2. Rewrite post_invoice_to_ledger to use ledger_transactions table
  3. Rewrite post_voucher_to_ledger to use ledger_transactions table and voucher_types
  4. Ensure all transactions properly reflect in trial balance and balance sheet reports
  
  ## Database Structure
  - ledger_transactions: Direct transaction records (debit/credit per account)
  - voucher_entries: Voucher line items (links voucher to accounts)
  - vouchers: Voucher header (links to voucher_types via voucher_type_id)
*/

-- ============================================================================
-- STEP 1: Fix Auto-Invoice Creation
-- ============================================================================

-- Drop old trigger
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;

-- Recreate function with proper user_id handling
CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_completion()
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
  v_invoice_count integer;
  v_prefix text;
  v_suffix text;
  v_width integer;
  v_prefix_zero boolean;
  v_starting_number integer;
  v_actual_number integer;
  v_number_part text;
  v_user_id uuid;
BEGIN
  -- Only proceed if status changed to 'completed' and no invoice exists
  IF NEW.status = 'completed' AND 
     (OLD.status IS NULL OR OLD.status != 'completed') AND 
     NEW.invoice_id IS NULL THEN
    
    -- Get work details (includes user_id)
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Store user_id for use throughout function
    v_user_id := v_work.user_id;
    
    -- Get service details with all mappings
    SELECT * INTO v_service
    FROM services
    WHERE id = v_work.service_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;
    
    -- Get customer details with account mapping
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_work.customer_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;
    
    -- Get company settings for invoice number generation and defaults
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = v_user_id
    LIMIT 1;
    
    -- Determine income ledger account (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      v_income_ledger_id := NULL;
    END IF;
    
    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;
    
    -- Generate invoice number using company settings
    IF v_company_settings IS NOT NULL THEN
      -- Get current invoice count for this user
      SELECT COUNT(*) INTO v_invoice_count
      FROM invoices
      WHERE user_id = v_user_id;
      
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
      WHERE user_id = v_user_id;
    END IF;
    
    -- Calculate amounts using actual service tax rate
    v_subtotal := COALESCE(v_service.default_price, 0);
    v_tax_amount := v_subtotal * COALESCE(v_service.tax_rate, 0) / 100;
    v_total_amount := v_subtotal + v_tax_amount;
    
    -- Create invoice if valid amount
    IF v_subtotal > 0 THEN
      -- Insert invoice
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
        v_user_id,
        v_work.customer_id,
        v_invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        'draft',
        'Auto-generated for ' || v_service.name || ' - Period: ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text,
        v_income_ledger_id,
        v_customer_ledger_id,
        NEW.work_id
      )
      RETURNING id INTO v_invoice_id;
      
      -- Insert invoice item with service reference and actual tax rate
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
        v_service.name || ' - ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text,
        1,
        v_subtotal,
        v_subtotal,
        COALESCE(v_service.tax_rate, 0)
      );
      
      -- Link invoice back to period
      NEW.invoice_id := v_invoice_id;
      
      RAISE NOTICE 'Auto-created invoice % for period %', v_invoice_number, NEW.id;
    ELSE
      RAISE WARNING 'Skipping invoice creation - no valid price for service %', v_service.id;
    END IF;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER auto_invoice_on_period_completion
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();

-- ============================================================================
-- STEP 2: Fix Invoice Ledger Posting
-- ============================================================================

-- Drop old trigger
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger ON invoices;

-- Create function to post directly to ledger_transactions
CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_count integer;
BEGIN
  -- Only post if status is not draft and both accounts are mapped
  IF NEW.status != 'draft' AND 
     NEW.income_account_id IS NOT NULL AND 
     NEW.customer_account_id IS NOT NULL THEN
    
    -- Check if already posted
    SELECT COUNT(*) INTO v_existing_count
    FROM ledger_transactions
    WHERE voucher_id IS NULL
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%'
      AND account_id IN (NEW.customer_account_id, NEW.income_account_id);
    
    IF v_existing_count > 0 THEN
      -- Already posted, skip
      RETURN NEW;
    END IF;
    
    -- Debit: Customer Account (Accounts Receivable - they owe us)
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      NEW.user_id,
      NEW.customer_account_id,
      NULL,
      NEW.invoice_date,
      NEW.total_amount,
      0,
      'Invoice ' || NEW.invoice_number || ' - Customer receivable'
    );
    
    -- Credit: Income Account (Revenue earned)
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      NEW.user_id,
      NEW.income_account_id,
      NULL,
      NEW.invoice_date,
      0,
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number || ' - Service income'
    );
    
    RAISE NOTICE 'Posted invoice % to ledger_transactions', NEW.invoice_number;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice posting
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  WHEN (NEW.status != 'draft' AND NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL)
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- ============================================================================
-- STEP 3: Fix Voucher Ledger Posting
-- ============================================================================

-- Drop old trigger
DROP TRIGGER IF EXISTS trigger_post_voucher_to_ledger ON vouchers;

-- Create function to post vouchers to ledger_transactions
CREATE OR REPLACE FUNCTION post_voucher_to_ledger_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_existing_count integer;
  v_voucher_type_code text;
BEGIN
  -- Get voucher type code
  SELECT code INTO v_voucher_type_code
  FROM voucher_types
  WHERE id = NEW.voucher_type_id;
  
  -- Only post for actual vouchers (exclude Sales Voucher which is handled via invoices)
  IF v_voucher_type_code IN ('PV', 'RV', 'JV', 'CV') THEN
    
    -- Check if already posted
    SELECT COUNT(*) INTO v_existing_count
    FROM ledger_transactions
    WHERE voucher_id = NEW.id;
    
    IF v_existing_count > 0 THEN
      -- Already posted, skip
      RETURN NEW;
    END IF;
    
    -- Post all voucher entries to ledger_transactions
    FOR v_item IN
      SELECT * FROM voucher_entries WHERE voucher_id = NEW.id
    LOOP
      INSERT INTO ledger_transactions (
        user_id,
        account_id,
        voucher_id,
        transaction_date,
        debit,
        credit,
        narration
      ) VALUES (
        NEW.user_id,
        v_item.account_id,
        NEW.id,
        NEW.voucher_date,
        COALESCE(v_item.debit_amount, 0),
        COALESCE(v_item.credit_amount, 0),
        COALESCE(v_item.narration, NEW.voucher_number)
      );
    END LOOP;
    
    RAISE NOTICE 'Posted voucher % to ledger_transactions', NEW.voucher_number;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting voucher % to ledger: %', NEW.voucher_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for voucher posting
CREATE TRIGGER trigger_post_voucher_to_ledger_transactions
  AFTER INSERT ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION post_voucher_to_ledger_transactions();

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON FUNCTION auto_create_invoice_on_period_completion IS 
  'Auto-creates invoices when recurring period is completed. Gets user_id from works table, uses company settings for invoice numbering, service mappings for accounts, and actual service tax rates.';

COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS 
  'Posts invoice transactions directly to ledger_transactions table. Creates debit (customer) and credit (income) entries for proper double-entry bookkeeping.';

COMMENT ON FUNCTION post_voucher_to_ledger_transactions IS 
  'Posts voucher entries directly to ledger_transactions table. Ensures all amounts reflect in trial balance, balance sheet, and other financial reports.';
