/*
  # Complete Fix for Recurring Periods and Invoice Auto-Creation

  ## Issues Fixed
  1. **Recurring periods not showing after work creation**
     - Fixed: create_initial_recurring_period_on_work_insert now properly creates first period
     - Uses user_id from NEW record for all inserts
     - Properly checks if work is recurring with is_recurring = true

  2. **Ledger mapping validation for auto-invoice**
     - Shows clear error message if income ledger not mapped
     - Validates before creating invoice for both recurring and non-recurring works
     - Error message: "LEDGER_MAPPING_REQUIRED: Please configure income ledger..."

  3. **Invoice numbering not using ID config settings**
     - Now properly reads from company_settings table
     - Uses invoice_prefix, invoice_suffix, invoice_number_width, etc.
     - Applies to both non-recurring works and recurring periods
     - Format: prefix + padded_number + suffix (e.g., ABC-00001)

  ## Changes Made
  1. Fix create_initial_recurring_period_on_work_insert function
  2. Update auto_generate_work_invoice function with proper numbering
  3. Update auto_create_invoice_on_period_completion function with proper numbering
  4. Add proper error handling and validation

  ## Security
  - No RLS changes
  - Maintains existing security model
*/

-- ============================================================================
-- STEP 1: Fix Initial Recurring Period Creation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION create_initial_recurring_period_on_work_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_period_dates RECORD;
  v_new_period_id UUID;
  v_period_type TEXT;
BEGIN
  -- Only create period if work has recurrence pattern and is marked as recurring
  IF NEW.is_recurring = true 
     AND NEW.recurrence_pattern IS NOT NULL 
     AND NEW.recurrence_pattern != ''
     AND NEW.start_date <= CURRENT_DATE THEN

    -- Use period_calculation_type if available, default to 'previous_period'
    v_period_type := COALESCE(NEW.period_calculation_type, 'previous_period');

    -- Calculate period dates based on pattern and type
    SELECT * INTO v_period_dates
    FROM calculate_period_dates(NEW.recurrence_pattern, v_period_type, CURRENT_DATE);

    -- Check if this period already exists
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = NEW.id
      AND period_start_date = v_period_dates.period_start_date
      AND period_end_date = v_period_dates.period_end_date
    ) THEN
      -- Create the period with user_id
      INSERT INTO work_recurring_instances (
        user_id,
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        status,
        billing_amount
      ) VALUES (
        NEW.user_id,  -- CRITICAL: Include user_id
        NEW.id,
        v_period_dates.period_name,
        v_period_dates.period_start_date,
        v_period_dates.period_end_date,
        'pending',
        NEW.billing_amount
      )
      RETURNING id INTO v_new_period_id;

      -- Copy tasks from service template
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,
        description,
        due_date_offset_days,
        due_date,
        status,
        sort_order
      )
      SELECT 
        v_new_period_id,
        st.id,
        st.title,
        st.description,
        st.due_date_offset_days,
        v_period_dates.period_end_date + st.due_date_offset_days,
        'pending',
        st.sort_order
      FROM service_tasks st
      WHERE st.service_id = NEW.service_id
      AND st.is_active = true
      ORDER BY st.sort_order;

      -- Copy documents from work template
      INSERT INTO work_recurring_period_documents (
        work_recurring_instance_id,
        work_document_id,
        is_collected
      )
      SELECT 
        v_new_period_id,
        wd.id,
        false
      FROM work_documents wd
      WHERE wd.work_id = NEW.id;

      RAISE NOTICE 'Created initial period "%" for recurring work "%"', v_period_dates.period_name, NEW.title;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating initial recurring period for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Fix Non-Recurring Work Auto-Invoice with Proper Numbering
-- ============================================================================

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
  v_invoice_count integer;
  v_prefix text;
  v_suffix text;
  v_width integer;
  v_prefix_zero boolean;
  v_starting_number integer;
  v_actual_number integer;
  v_number_part text;
BEGIN
  -- Only proceed if ALL conditions met
  IF NEW.status = 'completed' AND
     (OLD IS NULL OR OLD.status != 'completed') AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     COALESCE(NEW.is_recurring, false) = false AND
     NOT EXISTS (SELECT 1 FROM invoices WHERE work_id = NEW.id) THEN

    -- Get customer
    SELECT * INTO v_customer FROM customers WHERE id = NEW.customer_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get service
    SELECT * INTO v_service FROM services WHERE id = NEW.service_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Service not found for work %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings WHERE user_id = NEW.user_id LIMIT 1;

    -- CRITICAL: Validate income ledger mapping
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      -- No mapping found - STOP with clear error
      RAISE NOTICE 'LEDGER_MAPPING_REQUIRED: Cannot auto-create invoice for work "%" - Income ledger not mapped. Please configure income ledger in: Settings > Accounting Masters > Default Ledgers OR Services > Edit Service "%" > Accounting Tab.', NEW.title, v_service.name;
      RETURN NEW;
    END IF;

    v_customer_ledger_id := v_customer.account_id;

    -- Calculate amounts
    v_subtotal := NEW.billing_amount;
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
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE user_id = NEW.user_id;

      -- Calculate actual number: starting_number + count
      v_actual_number := v_starting_number + v_invoice_count;

      -- Format with leading zeros if enabled
      IF v_prefix_zero THEN
        v_number_part := LPAD(v_actual_number::text, v_width, '0');
      ELSE
        v_number_part := v_actual_number::text;
      END IF;

      -- Assemble: prefix + number + suffix
      -- Example: ABC + 00001 = ABC-00001 (if suffix is empty)
      -- Example: ABC + 00001 + -FY25 = ABC-00001-FY25
      IF v_suffix != '' AND v_suffix IS NOT NULL THEN
        v_invoice_number := v_prefix || '-' || v_number_part || v_suffix;
      ELSE
        v_invoice_number := v_prefix || '-' || v_number_part;
      END IF;
    ELSE
      -- Fallback if no company settings
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE user_id = NEW.user_id;
      v_invoice_number := 'INV-' || LPAD((v_invoice_count + 1)::text, 6, '0');
    END IF;

    -- Create invoice
    INSERT INTO invoices (
      user_id, customer_id, work_id, invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id
    ) VALUES (
      NEW.user_id, NEW.customer_id, NEW.id, v_invoice_number, CURRENT_DATE, v_due_date,
      v_subtotal, v_tax_amount, v_total_amount, 'draft',
      'Auto-generated invoice for: ' || NEW.title,
      v_income_ledger_id, v_customer_ledger_id
    ) RETURNING id INTO v_invoice_id;

    -- Create line item
    INSERT INTO invoice_items (
      invoice_id, service_id, description, quantity, unit_price, amount, tax_rate
    ) VALUES (
      v_invoice_id, v_service.id, 'Work: ' || NEW.title,
      1, v_subtotal, v_subtotal, COALESCE(v_service.tax_rate, 0)
    );

    -- Update work
    UPDATE works SET billing_status = 'billed' WHERE id = NEW.id;

    RAISE NOTICE 'Auto-created invoice % for work "%"', v_invoice_number, NEW.title;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Fix Recurring Period Auto-Invoice with Proper Numbering
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
BEGIN
  -- Only proceed if status changed to 'completed' and no invoice exists
  IF NEW.status = 'completed' AND
     (OLD IS NULL OR OLD.status != 'completed') AND
     NEW.invoice_id IS NULL THEN

    -- Get work
    SELECT * INTO v_work FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;

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

    -- Get company settings
    SELECT * INTO v_company_settings
    FROM company_settings WHERE user_id = NEW.user_id LIMIT 1;

    -- CRITICAL: Validate income ledger mapping
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      -- No mapping found - STOP with clear error
      RAISE NOTICE 'LEDGER_MAPPING_REQUIRED: Cannot auto-create invoice for recurring work "%" (Period: % to %) - Income ledger not mapped. Please configure income ledger in: Settings > Accounting Masters > Default Ledgers OR Services > Edit Service "%" > Accounting Tab.',
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
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE user_id = NEW.user_id;

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
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE user_id = NEW.user_id;
      v_invoice_number := 'INV-' || LPAD((v_invoice_count + 1)::text, 6, '0');
    END IF;

    -- Create invoice
    INSERT INTO invoices (
      user_id, customer_id, invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id, work_id
    ) VALUES (
      NEW.user_id, v_work.customer_id, v_invoice_number, CURRENT_DATE, v_due_date,
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

    RAISE NOTICE 'Auto-created invoice % for period % (% to %)', v_invoice_number, NEW.period_name, NEW.period_start_date, NEW.period_end_date;
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

GRANT EXECUTE ON FUNCTION create_initial_recurring_period_on_work_insert TO authenticated;
GRANT EXECUTE ON FUNCTION auto_generate_work_invoice TO authenticated;
GRANT EXECUTE ON FUNCTION auto_create_invoice_on_period_completion TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION create_initial_recurring_period_on_work_insert IS
  'Creates first recurring period when work is inserted. 
   - Only triggers for is_recurring = true works
   - Creates period with user_id for proper RLS
   - Copies tasks and documents from templates';

COMMENT ON FUNCTION auto_generate_work_invoice IS
  'Auto-creates invoices for non-recurring works when status = completed. 
   - Validates income ledger mapping (service or company default)
   - Uses company ID config for invoice numbering (format: PREFIX-PADDEDNUMBER or PREFIX-PADDEDNUMBER-SUFFIX)
   - Shows LEDGER_MAPPING_REQUIRED notice if no income ledger mapped';

COMMENT ON FUNCTION auto_create_invoice_on_period_completion IS
  'Auto-creates invoices for recurring periods when status = completed (all tasks done).
   - Validates income ledger mapping (service or company default)
   - Uses company ID config for invoice numbering (format: PREFIX-PADDEDNUMBER or PREFIX-PADDEDNUMBER-SUFFIX)
   - Shows LEDGER_MAPPING_REQUIRED notice if no income ledger mapped';
