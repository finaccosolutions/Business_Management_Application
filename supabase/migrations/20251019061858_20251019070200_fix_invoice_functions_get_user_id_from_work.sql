/*
  # Fix Invoice Auto-Generation Functions - Get user_id from works table

  ## Issue
  The auto_create_invoice_on_period_completion function references NEW.user_id,
  but work_recurring_instances table doesn't have a user_id column.
  Need to get user_id from the works table via work_id foreign key.

  ## Changes
  1. Update auto_create_invoice_on_period_completion to get user_id from works table
  2. Verify auto_generate_work_invoice is correct (it already has NEW.user_id from works table)

  ## Security
  - Maintains RLS through proper user_id retrieval
*/

-- ============================================================================
-- Fix auto_create_invoice_on_period_completion Function
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
  v_invoice_count integer;
  v_prefix text;
  v_suffix text;
  v_width integer;
  v_prefix_zero boolean;
  v_starting_number integer;
  v_actual_number integer;
  v_number_part text;
  v_due_date date;
  v_user_id uuid;
BEGIN
  -- Only proceed if status changed to 'completed' and no invoice exists
  IF NEW.status = 'completed' AND
     (OLD IS NULL OR OLD.status != 'completed') AND
     NEW.invoice_id IS NULL THEN

    -- Get work and extract user_id
    SELECT * INTO v_work FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;

    v_user_id := v_work.user_id;

    -- Only proceed if auto_bill is enabled
    IF v_work.auto_bill != true THEN
      RETURN NEW;
    END IF;

    -- Get service
    SELECT * INTO v_service FROM services WHERE id = v_work.service_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found';
      RETURN NEW;
    END IF;

    -- Get customer
    SELECT * INTO v_customer FROM customers WHERE id = v_work.customer_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found';
      RETURN NEW;
    END IF;

    -- Get company settings using v_user_id
    SELECT * INTO v_company_settings
    FROM company_settings WHERE user_id = v_user_id LIMIT 1;

    -- CRITICAL: Validate income ledger mapping
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      -- No mapping found - STOP with clear error
      RAISE NOTICE 'LEDGER_MAPPING_REQUIRED: Cannot auto-create invoice for recurring work "%s" (Period: %s to %s) - Income ledger not mapped. Please configure income ledger in: Settings > Accounting Masters > Default Ledgers OR Services > Edit Service "%s" > Accounting Tab.',
        v_work.title, NEW.period_start_date, NEW.period_end_date, v_service.name;
      RETURN NEW;
    END IF;

    v_customer_ledger_id := v_customer.account_id;

    -- Calculate amounts - use service default_price or period billing_amount
    v_subtotal := COALESCE(NEW.billing_amount, v_service.default_price, v_work.billing_amount, 0);
    IF v_subtotal <= 0 THEN
      RAISE WARNING 'No valid price for recurring period service';
      RETURN NEW;
    END IF;

    v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date
    CASE v_service.payment_terms
      WHEN 'net_15' THEN v_due_date := CURRENT_DATE + 15;
      WHEN 'net_30' THEN v_due_date := CURRENT_DATE + 30;
      WHEN 'net_45' THEN v_due_date := CURRENT_DATE + 45;
      WHEN 'net_60' THEN v_due_date := CURRENT_DATE + 60;
      WHEN 'due_on_receipt' THEN v_due_date := CURRENT_DATE;
      ELSE v_due_date := CURRENT_DATE + 30;
    END CASE;

    -- Generate invoice number using company ID configuration
    IF v_company_settings IS NOT NULL THEN
      v_prefix := COALESCE(v_company_settings.invoice_prefix, 'INV');
      v_suffix := COALESCE(v_company_settings.invoice_suffix, '');
      v_width := COALESCE(v_company_settings.invoice_number_width, 6);
      v_prefix_zero := COALESCE(v_company_settings.invoice_number_prefix_zero, true);
      v_starting_number := COALESCE(v_company_settings.invoice_starting_number, 1);

      -- Get count of existing invoices for this user
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE user_id = v_user_id;

      -- Calculate actual number: starting_number + count
      v_actual_number := v_starting_number + v_invoice_count;

      -- Format with leading zeros if enabled
      IF v_prefix_zero THEN
        v_number_part := LPAD(v_actual_number::text, v_width, '0');
      ELSE
        v_number_part := v_actual_number::text;
      END IF;

      -- Assemble: prefix + number + suffix
      IF v_suffix != '' AND v_suffix IS NOT NULL THEN
        v_invoice_number := v_prefix || '-' || v_number_part || v_suffix;
      ELSE
        v_invoice_number := v_prefix || '-' || v_number_part;
      END IF;
    ELSE
      -- Fallback if no company settings
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE user_id = v_user_id;
      v_invoice_number := 'INV-' || LPAD((v_invoice_count + 1)::text, 6, '0');
    END IF;

    -- Create invoice using v_user_id
    INSERT INTO invoices (
      user_id, customer_id, invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id, work_id
    ) VALUES (
      v_user_id, v_work.customer_id, v_invoice_number, CURRENT_DATE, v_due_date,
      v_subtotal, v_tax_amount, v_total_amount, 'draft',
      'Auto-generated: ' || v_service.name || ' - ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text,
      v_income_ledger_id, v_customer_ledger_id, NEW.work_id
    ) RETURNING id INTO v_invoice_id;

    -- Create line item
    INSERT INTO invoice_items (
      invoice_id, service_id, description, quantity, unit_price, amount, tax_rate
    ) VALUES (
      v_invoice_id, v_service.id,
      v_service.name || ' - ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text,
      1, v_subtotal, v_subtotal, COALESCE(v_service.tax_rate, 0)
    );

    -- Link invoice to period
    NEW.invoice_id := v_invoice_id;
    NEW.is_billed := true;

    RAISE NOTICE 'Auto-created invoice %s for period %s (%s to %s)', v_invoice_number, NEW.period_name, NEW.period_start_date, NEW.period_end_date;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION auto_create_invoice_on_period_completion TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION auto_create_invoice_on_period_completion IS
  'Auto-creates invoices for recurring periods when all tasks completed.
   - Gets user_id from works table via work_id foreign key
   - Uses company_settings for invoice number format: PREFIX-PADDEDNUMBER-SUFFIX
   - Example: XYZ-00001 or ABC-00001-FY25
   - Respects invoice_prefix, invoice_suffix, invoice_number_width from settings';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed auto_create_invoice_on_period_completion - now gets user_id from works table';
  RAISE NOTICE '✓ Invoice numbering will use company_settings configuration';
END $$;
