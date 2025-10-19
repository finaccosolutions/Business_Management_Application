/*
  # Fix Auto-Invoice System - Ledger Validation and Numbering

  ## Summary
  This migration fixes critical issues with auto-invoice creation:
  1. Validates ledger mapping before creating invoices
  2. Fixes invoice number generation to use ID config settings from company_settings
  3. Shows proper error messages when ledger mapping is missing
  4. Fixes both non-recurring and recurring work invoice generation

  ## Changes Made
  1. **Non-Recurring Work (auto_generate_work_invoice)**:
     - Add validation to check if income ledger is mapped before creating invoice
     - Show NOTICE message if ledger mapping is missing
     - Fix invoice number generation to use company ID config settings
     - Only trigger when all tasks completed OR work status is completed

  2. **Recurring Work (auto_create_invoice_on_period_completion)**:
     - Add validation to check if income ledger is mapped before creating invoice
     - Show NOTICE message if ledger mapping is missing
     - Fix invoice number generation to use company ID config settings
     - Only trigger when all period tasks completed

  ## Security
  - No RLS policy changes
  - Maintains existing security model
*/

-- ============================================================================
-- STEP 1: Fix Non-Recurring Work Auto-Invoice Function
-- ============================================================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;

-- Replace function with validation and proper numbering
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
      -- No income ledger mapped - STOP and show message
      RAISE NOTICE 'LEDGER_MAPPING_REQUIRED: Cannot create invoice for work "%" - Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).', NEW.title;
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

    -- Generate invoice number using company ID config settings
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
      IF v_suffix IS NOT NULL AND v_suffix != '' THEN
        v_invoice_number := v_prefix || '-' || v_number_part || v_suffix;
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
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_generate_work_invoice();

-- ============================================================================
-- STEP 2: Fix Recurring Period Auto-Invoice Function
-- ============================================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;
DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON work_recurring_instances;

-- Replace function with validation and proper numbering
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
  v_due_date date;
BEGIN
  -- Only proceed if status changed to 'completed' and no invoice exists
  IF NEW.status = 'completed' AND
     (OLD.status IS NULL OR OLD.status != 'completed') AND
     NEW.invoice_id IS NULL THEN

    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;

    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;

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
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Determine income ledger account (service mapping takes priority)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      -- No income ledger mapped - STOP and show message
      RAISE NOTICE 'LEDGER_MAPPING_REQUIRED: Cannot create invoice for recurring work "%" (Period: % to %) - Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).',
        v_work.title, NEW.period_start_date, NEW.period_end_date;
      RETURN NEW;
    END IF;

    -- Get customer ledger account
    v_customer_ledger_id := v_customer.account_id;

    -- Calculate amounts using actual service tax rate and default price
    v_subtotal := COALESCE(v_service.default_price, 0);

    IF v_subtotal <= 0 THEN
      RAISE WARNING 'Skipping invoice creation - no valid price for service %', v_service.id;
      RETURN NEW;
    END IF;

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

    -- Generate invoice number using company ID config settings
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
      IF v_suffix IS NOT NULL AND v_suffix != '' THEN
        v_invoice_number := v_prefix || '-' || v_number_part || v_suffix;
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

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create single trigger
CREATE TRIGGER auto_invoice_on_period_completion
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON FUNCTION auto_generate_work_invoice IS
  'Auto-creates invoices for non-recurring works when status changes to completed. Validates ledger mappings, uses company ID config settings for invoice numbering, and respects service-level tax rates and payment terms.';

COMMENT ON TRIGGER trigger_auto_generate_work_invoice ON works IS
  'Triggers auto-invoice creation when work status changes to completed. Only fires on UPDATE to prevent duplicate invoices. Shows error if income ledger is not mapped.';

COMMENT ON FUNCTION auto_create_invoice_on_period_completion IS
  'Auto-creates invoices for recurring work periods when status changes to completed. Validates ledger mappings, uses company ID config settings for invoice numbering, and respects service-level tax rates and payment terms.';

COMMENT ON TRIGGER auto_invoice_on_period_completion ON work_recurring_instances IS
  'Triggers auto-invoice creation when period status changes to completed. Only fires on UPDATE to prevent duplicate invoices. Shows error if income ledger is not mapped.';
