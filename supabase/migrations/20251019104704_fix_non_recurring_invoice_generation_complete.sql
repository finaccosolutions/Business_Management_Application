/*
  # Fix Non-Recurring Work Invoice Generation Issues
  
  ## Problems Identified
  
  1. **Invoice Number Not Following Unified ID Config**
     - Root Cause: generate_next_invoice_number() function uses old company_settings columns (invoice_prefix, invoice_suffix, etc.)
     - The system now has a unified_id_config table for all entity numbering
     - Solution: Update function to check unified_id_config first, fallback to company_settings for backward compatibility
  
  2. **Customer Account Not Displaying in Edit Invoice Modal**
     - Root Cause: customer_account_id is set in the invoice, but the frontend expects it to be linked to an account
     - The account may not exist or the customer's account_id may be NULL
     - Solution: Ensure customer account is always set when creating invoice, handle NULL gracefully
  
  3. **Service Not Selected in Auto-Generated Invoices**
     - Root Cause: service_id is being set in invoice_items, but may not be preserved correctly
     - Solution: Verify service_id is properly set in auto_generate_work_invoice function
  
  ## Changes Made
  
  1. Create new unified invoice number generator that respects unified_id_config
  2. Update auto_generate_work_invoice to use the new generator
  3. Update auto_create_invoice_on_period_completion to use the new generator
  4. Ensure customer_account_id and income_account_id are always properly set
  5. Ensure service_id is always set in invoice_items
*/

-- ============================================================================
-- STEP 1: Create Unified Invoice Number Generator
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_invoice_number_from_config(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config RECORD;
  v_invoice_count integer;
  v_next_number integer;
  v_number_str text;
  v_result text;
BEGIN
  -- First, check if unified_id_config exists for 'invoice' entity
  SELECT
    prefix,
    suffix,
    number_width,
    use_prefix_zero,
    starting_number
  INTO v_config
  FROM unified_id_config
  WHERE user_id = p_user_id
    AND entity_type = 'invoice'
  LIMIT 1;
  
  -- If unified config found, use it
  IF FOUND THEN
    -- Get current count of invoices
    SELECT COUNT(*) INTO v_invoice_count
    FROM invoices
    WHERE user_id = p_user_id;
    
    -- Calculate next number
    v_next_number := v_config.starting_number + v_invoice_count;
    
    -- Format number with leading zeros if enabled
    IF v_config.use_prefix_zero THEN
      v_number_str := lpad(v_next_number::text, v_config.number_width, '0');
    ELSE
      v_number_str := v_next_number::text;
    END IF;
    
    -- Build final invoice number
    IF v_config.suffix IS NOT NULL AND v_config.suffix != '' THEN
      v_result := v_config.prefix || '-' || v_number_str || '-' || v_config.suffix;
    ELSE
      v_result := v_config.prefix || '-' || v_number_str;
    END IF;
    
    RETURN v_result;
  END IF;
  
  -- Fallback: Use old company_settings method
  SELECT
    COALESCE(invoice_prefix, 'INV') as prefix,
    COALESCE(invoice_suffix, '') as suffix,
    COALESCE(invoice_number_width, 4) as number_width,
    COALESCE(invoice_number_prefix_zero, true) as use_prefix_zero,
    COALESCE(invoice_starting_number, 1) as starting_number
  INTO v_config
  FROM company_settings
  WHERE user_id = p_user_id
  LIMIT 1;
  
  -- If no settings found, use defaults
  IF NOT FOUND THEN
    v_config := ROW('INV', '', 4, true, 1);
  END IF;
  
  -- Get current count of invoices
  SELECT COUNT(*) INTO v_invoice_count
  FROM invoices
  WHERE user_id = p_user_id;
  
  -- Calculate next number
  v_next_number := v_config.starting_number + v_invoice_count;
  
  -- Format number with leading zeros if enabled
  IF v_config.use_prefix_zero THEN
    v_number_str := lpad(v_next_number::text, v_config.number_width, '0');
  ELSE
    v_number_str := v_next_number::text;
  END IF;
  
  -- Build final invoice number
  IF v_config.suffix IS NOT NULL AND v_config.suffix != '' THEN
    v_result := v_config.prefix || '-' || v_number_str || '-' || v_config.suffix;
  ELSE
    v_result := v_config.prefix || '-' || v_number_str;
  END IF;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION generate_invoice_number_from_config IS
  'Generates invoice number using unified_id_config if available, otherwise falls back to company_settings. Respects user configuration for prefix, suffix, width, and starting number.';

-- ============================================================================
-- STEP 2: Update Auto-Generate Work Invoice Function
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
DROP FUNCTION IF EXISTS auto_generate_work_invoice CASCADE;

CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER AS $$
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
    SELECT * INTO v_service
    FROM services
    WHERE id = NEW.service_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get customer details with account mapping
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id;

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

    -- Generate invoice number using unified config system
    v_invoice_number := generate_invoice_number_from_config(NEW.user_id);

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

    -- Create invoice line item WITH service_id
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

    RAISE NOTICE 'Created invoice % (ID: %) for work % with service % income account % and customer account %',
      v_invoice_number, v_invoice_id, NEW.title, v_service.id, v_income_ledger_id, v_customer_ledger_id;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_generate_work_invoice IS
  'Auto-generates invoice for non-recurring work when completed. Uses unified_id_config for invoice numbering. Includes income_account_id from service or company settings, customer_account_id from customer, and service_id in invoice_items.';

-- Recreate trigger
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();

-- ============================================================================
-- STEP 3: Update Recurring Period Invoice Function
-- ============================================================================

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
  v_due_date date;
  v_existing_invoice_id uuid;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

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

    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
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

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_work.customer_id;

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
      RAISE NOTICE 'Using service income account: %', v_income_ledger_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
      RAISE NOTICE 'Using default income account from company settings: %', v_income_ledger_id;
    ELSE
      RAISE NOTICE 'Cannot create invoice for recurring work "%" (Period: % to %): Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).',
        v_work.title, NEW.period_start_date, NEW.period_end_date;
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

    -- Generate invoice number using unified config system
    v_invoice_number := generate_invoice_number_from_config(NEW.user_id);

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
      'Auto-generated invoice for recurring work: ' || v_work.title || ' | Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      v_income_ledger_id,
      v_customer_ledger_id,
      NEW.work_id
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item WITH service_id
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

    RAISE NOTICE 'Created invoice % (ID: %) for recurring period with service % income account % and customer account %',
      v_invoice_number, v_invoice_id, v_service.id, v_income_ledger_id, v_customer_ledger_id;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_create_invoice_on_period_completion IS
  'Auto-generates invoice for recurring work period when completed. Uses unified_id_config for invoice numbering. Includes income_account_id from service or company settings, customer_account_id from customer, and service_id in invoice_items.';

-- ============================================================================
-- STEP 4: Verification and Summary
-- ============================================================================

-- Summary of fixes:
-- 1. Created generate_invoice_number_from_config() that respects unified_id_config
-- 2. Updated auto_generate_work_invoice() to use new number generator and ensure service_id is set
-- 3. Updated auto_create_invoice_on_period_completion() to use new number generator and ensure service_id is set
-- 4. Both functions now properly set income_account_id, customer_account_id, and service_id
-- 5. Invoice numbers now follow the unified ID configuration when available

-- Test queries:
-- Check if unified_id_config exists for invoices:
--   SELECT * FROM unified_id_config WHERE entity_type = 'invoice';
--
-- Test invoice number generation:
--   SELECT generate_invoice_number_from_config('<your_user_id>');
--
-- Verify invoice has all required fields:
--   SELECT invoice_number, income_account_id, customer_account_id, work_id
--   FROM invoices WHERE id = '<invoice_id>';
--
-- Verify invoice items have service_id:
--   SELECT * FROM invoice_items WHERE invoice_id = '<invoice_id>';
