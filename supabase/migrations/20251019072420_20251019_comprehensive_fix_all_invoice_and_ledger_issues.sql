/*
  # Comprehensive Fix for All Invoice and Ledger Issues

  ## Problems Identified and Fixed:
  
  1. **Recurring Period Invoice Generation**
     - Multiple conflicting triggers causing confusion
     - Remove old `auto_create_invoice_for_completed_period` function
     - Keep only `auto_create_invoice_on_period_completion` with proper logic
  
  2. **Invoice Numbering**
     - All auto-invoice functions now use `generate_next_invoice_number()`
     - Consistent with ID config settings from company_settings
  
  3. **Ledger Account Selection**
     - Fixed to show mapped ledger names, not just IDs
     - Income account prioritizes service mapping, then company default
     - Customer account comes from customer.account_id
  
  4. **Ledger Posting**
     - Ensured triggers fire properly on INSERT and UPDATE
     - Fixed duplicate detection logic
     - Proper posting to ledger_transactions table
  
  5. **Invoice Display**
     - Invoice numbers display correctly using configured format
*/

-- =====================================================
-- STEP 1: Drop old conflicting auto-invoice function
-- =====================================================

DROP FUNCTION IF EXISTS auto_create_invoice_for_completed_period() CASCADE;

-- =====================================================
-- STEP 2: Fix the main recurring period invoice function
-- =====================================================

CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  v_due_date date;
  v_existing_invoice_id uuid;
BEGIN
  -- Only proceed if status changed to 'completed' and no invoice linked yet
  IF NEW.status = 'completed' AND 
     (OLD.status IS NULL OR OLD.status != 'completed') AND 
     NEW.invoice_id IS NULL THEN

    -- Check if invoice already exists for this period
    SELECT id INTO v_existing_invoice_id
    FROM invoices
    WHERE work_id = NEW.work_id
      AND notes LIKE '%Period: ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text || '%'
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
      RAISE NOTICE 'Invoice already exists for this period, linking it';
      NEW.invoice_id := v_existing_invoice_id;
      RETURN NEW;
    END IF;

    -- Get work details
    SELECT * INTO v_work FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get service details
    SELECT * INTO v_service FROM services WHERE id = v_work.service_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;

    -- Get customer details
    SELECT * INTO v_customer FROM customers WHERE id = v_work.customer_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings 
    FROM company_settings 
    WHERE user_id = NEW.user_id 
    LIMIT 1;

    -- Determine income ledger (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for recurring work "%": Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).', 
        v_work.title;
      RETURN NEW;
    END IF;

    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;

    -- Calculate amounts
    v_subtotal := COALESCE(v_service.default_price, 0);
    
    IF v_subtotal <= 0 THEN
      RAISE WARNING 'Skipping invoice - no valid price for service %', v_service.id;
      RETURN NEW;
    END IF;

    v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date
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
    v_invoice_number := generate_next_invoice_number(NEW.user_id);

    -- Create invoice
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
      v_due_date,
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

    -- Create invoice item
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

    -- Link invoice to period
    NEW.invoice_id := v_invoice_id;

    RAISE NOTICE 'Created invoice % for period % to %', v_invoice_number, NEW.period_start_date, NEW.period_end_date;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;
CREATE TRIGGER auto_invoice_on_period_completion
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();

-- =====================================================
-- STEP 3: Fix non-recurring work invoice generation
-- =====================================================

CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_service RECORD;
  v_customer RECORD;
  v_company_settings RECORD;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Only proceed if status changed to 'completed', auto_bill enabled, and no existing invoice
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     NOT EXISTS (SELECT 1 FROM invoices WHERE work_id = NEW.id) THEN

    -- Get service details
    SELECT * INTO v_service FROM services WHERE id = NEW.service_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get customer details with account mapping
    SELECT * INTO v_customer FROM customers WHERE id = NEW.customer_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings 
    FROM company_settings 
    WHERE user_id = NEW.user_id 
    LIMIT 1;

    -- Determine income ledger (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for work "%": Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).', NEW.title;
      RETURN NEW;
    END IF;

    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;

    IF v_customer_ledger_id IS NULL THEN
      RAISE WARNING 'Customer % has no linked account - invoice will be created without customer account mapping', v_customer.name;
    END IF;

    -- Calculate amounts
    v_subtotal := NEW.billing_amount;
    v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date
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
    v_invoice_number := generate_next_invoice_number(NEW.user_id);

    -- Create invoice with ledger mappings
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

    -- Create invoice line item
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

    RAISE NOTICE 'Created invoice % for work %', v_invoice_number, NEW.title;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_generate_work_invoice();

-- =====================================================
-- STEP 4: Ensure ledger posting works correctly
-- =====================================================

CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_count integer;
BEGIN
  -- Only post if status is not draft and accounts are mapped
  IF NEW.status != 'draft' AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL THEN

    -- Check if already posted (avoid duplicates) - check by invoice_id
    SELECT COUNT(*) INTO v_existing_count
    FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';

    IF v_existing_count >= 2 THEN
      -- Already posted (we need 2 entries: debit and credit)
      RETURN NEW;
    END IF;

    -- Delete any partial postings
    IF v_existing_count > 0 THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';
    END IF;

    -- Debit: Customer Account (Receivable)
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

    -- Credit: Income Account (Revenue)
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

    RAISE NOTICE 'Posted invoice % to ledger', NEW.invoice_number;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate triggers for ledger posting
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- =====================================================
-- STEP 5: Clean up any duplicate functions or triggers
-- =====================================================

-- Remove any other conflicting auto-invoice triggers
DROP TRIGGER IF EXISTS auto_create_invoice_for_period ON work_recurring_instances;
DROP TRIGGER IF EXISTS trigger_auto_create_invoice ON work_recurring_instances;

-- =====================================================
-- STEP 6: Add helper comment
-- =====================================================

COMMENT ON FUNCTION auto_create_invoice_on_period_completion() IS 
  'Auto-creates invoice when recurring period status changes to completed. Uses generate_next_invoice_number() for proper numbering.';

COMMENT ON FUNCTION auto_generate_work_invoice() IS 
  'Auto-creates invoice when non-recurring work status changes to completed. Uses generate_next_invoice_number() for proper numbering.';

COMMENT ON FUNCTION post_invoice_to_ledger_transactions() IS 
  'Posts invoice to ledger transactions when status is not draft and accounts are mapped.';
