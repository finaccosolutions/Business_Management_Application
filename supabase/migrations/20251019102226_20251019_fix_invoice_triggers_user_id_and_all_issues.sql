/*
  # Fix Invoice Generation - User ID and All Critical Issues
  
  ## Critical Problems Identified:
  
  1. **work_recurring_instances table missing user_id column**
     - Trigger function auto_create_invoice_on_period_completion references NEW.user_id
     - But work_recurring_instances table doesn't have user_id column
     - Solution: Get user_id from works table instead
  
  2. **Service has no income_account_id mapped**
     - Service "GST Filing - Monthly" has income_account_id = NULL
     - Company settings has default_income_ledger_id configured
     - Trigger should fall back to company settings (already does, but needs to work)
  
  3. **Invoice numbering uses company settings**
     - User has: prefix='XYZ', starting_number=1, width=5, prefix_zero=true
     - Should generate: XYZ-00001
  
  ## Changes Made:
  
  1. Fix auto_create_invoice_on_period_completion to get user_id from works table
  2. Fix auto_generate_work_invoice to ensure it works correctly
  3. Ensure both triggers properly use company settings and service mappings
*/

-- =====================================================
-- Step 1: Fix Recurring Period Invoice Trigger
-- =====================================================

DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;

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
  v_user_id uuid;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    RAISE NOTICE 'Period completed, checking if invoice should be created for period %', NEW.id;
    
    -- Get work details (including user_id)
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Store user_id for later use
    v_user_id := v_work.user_id;
    
    RAISE NOTICE 'Found work: %, auto_bill: %, user_id: %', v_work.title, v_work.auto_bill, v_user_id;
    
    -- Only create invoice if auto_bill is enabled for the work
    IF v_work.auto_bill != true THEN
      RAISE NOTICE 'Auto-bill not enabled for work %, skipping invoice creation', v_work.id;
      RETURN NEW;
    END IF;
    
    -- Check if invoice already exists for this period
    SELECT id INTO v_existing_invoice_id
    FROM invoices
    WHERE work_id = NEW.work_id
      AND notes LIKE '%Period: ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text || '%'
    LIMIT 1;
    
    IF v_existing_invoice_id IS NOT NULL THEN
      RAISE NOTICE 'Invoice already exists for this period, skipping';
      NEW.invoice_id := v_existing_invoice_id;
      RETURN NEW;
    END IF;
    
    -- Get service details
    SELECT * INTO v_service
    FROM services
    WHERE id = v_work.service_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;
    
    RAISE NOTICE 'Found service: %, default_price: %, tax_rate: %, income_account_id: %', 
      v_service.name, v_service.default_price, v_service.tax_rate, v_service.income_account_id;
    
    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_work.customer_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;
    
    RAISE NOTICE 'Found customer: %, account_id: %', v_customer.name, v_customer.account_id;
    
    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = v_user_id
    LIMIT 1;
    
    RAISE NOTICE 'Company settings - default_income_ledger_id: %', v_company_settings.default_income_ledger_id;
    
    -- Determine income ledger (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
      RAISE NOTICE 'Using service income account: %', v_income_ledger_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
      RAISE NOTICE 'Using default income account from company settings: %', v_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for recurring work "%": Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).', v_work.title;
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
    v_invoice_number := generate_next_invoice_number(v_user_id);
    
    RAISE NOTICE 'Creating invoice with number: %, income_account: %, customer_account: %', 
      v_invoice_number, v_income_ledger_id, v_customer_ledger_id;
    
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
      v_user_id,
      v_work.customer_id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft',
      'Auto-generated invoice for recurring work: ' || v_work.title || ' | Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      v_income_ledger_id,
      v_customer_ledger_id,
      NEW.work_id
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
      v_work.title || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      1,
      v_subtotal,
      v_subtotal,
      COALESCE(v_service.tax_rate, 0)
    );
    
    -- Link invoice to period
    NEW.invoice_id := v_invoice_id;
    
    RAISE NOTICE 'Successfully created invoice % (ID: %) for recurring period', v_invoice_number, v_invoice_id;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER auto_invoice_on_period_completion
  AFTER UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();

-- =====================================================
-- Step 2: Verify and Update Non-Recurring Work Trigger
-- =====================================================

-- This trigger already exists but let's ensure it's correct
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
     NEW.billing_amount > 0 THEN
    
    RAISE NOTICE 'Work completed, creating invoice for work: %', NEW.title;
    
    -- Double-check no invoice exists
    IF EXISTS (SELECT 1 FROM invoices WHERE work_id = NEW.id) THEN
      RAISE NOTICE 'Invoice already exists for work %, skipping', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Get service details
    SELECT * INTO v_service
    FROM services
    WHERE id = NEW.service_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;
    
    RAISE NOTICE 'Found service: %, income_account_id: %', v_service.name, v_service.income_account_id;
    
    -- Get customer details with account mapping
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;
    
    RAISE NOTICE 'Found customer: %, account_id: %', v_customer.name, v_customer.account_id;
    
    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;
    
    RAISE NOTICE 'Company settings - default_income_ledger_id: %', v_company_settings.default_income_ledger_id;
    
    -- Determine income ledger (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
      RAISE NOTICE 'Using service income account: %', v_income_ledger_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
      RAISE NOTICE 'Using default income account from company settings: %', v_income_ledger_id;
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
    
    RAISE NOTICE 'Creating invoice with number: %, income_account: %, customer_account: %', 
      v_invoice_number, v_income_ledger_id, v_customer_ledger_id;
    
    -- Create invoice with ledger mappings (unique constraint prevents duplicates)
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
    )
    ON CONFLICT (work_id) DO NOTHING
    RETURNING id INTO v_invoice_id;
    
    -- If conflict occurred, v_invoice_id will be NULL
    IF v_invoice_id IS NULL THEN
      RAISE NOTICE 'Invoice already exists for work % (caught by unique constraint)', NEW.id;
      RETURN NEW;
    END IF;
    
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
    
    RAISE NOTICE 'Successfully created invoice % (ID: %) for work %', v_invoice_number, v_invoice_id, NEW.title;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Trigger already exists, no need to recreate

-- =====================================================
-- Step 3: Add Comments
-- =====================================================

COMMENT ON FUNCTION auto_create_invoice_on_period_completion() IS
  'Creates invoice for completed recurring period. Gets user_id from works table. Uses service income_account_id or falls back to company default_income_ledger_id.';

COMMENT ON FUNCTION auto_generate_work_invoice() IS
  'Creates invoice for completed non-recurring work. Uses service income_account_id or falls back to company default_income_ledger_id.';
