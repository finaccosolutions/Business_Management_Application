/*
  # Allow Invoice Creation Without Ledger Mapping
  
  ## Change in Behavior:
  - Previously: Invoice creation was blocked if no income ledger was mapped
  - Now: Invoice will be created with NULL account IDs
  - User can then edit invoice and select accounts manually
  - Ledger posting only happens when both accounts are filled and status != draft
  
  ## This Fixes:
  1. Recurring period completion NOW creates invoice even without mapping
  2. Non-recurring work completion NOW creates invoice even without mapping
  3. Income Account and Customer Account fields will be empty (NULL)
  4. User must fill them before changing status from draft
  5. Invoice number uses proper settings (XYZ-00001 format)
*/

CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
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

    -- Get work details FIRST to get user_id
    SELECT * INTO v_work FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;

    v_user_id := v_work.user_id;

    -- Check if invoice already exists for this period
    SELECT id INTO v_existing_invoice_id
    FROM invoices
    WHERE work_id = NEW.work_id
      AND notes LIKE '%Period: ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text || '%'
    LIMIT 1;

    IF v_existing_invoice_id IS NOT NULL THEN
      NEW.invoice_id := v_existing_invoice_id;
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
    WHERE user_id = v_user_id 
    LIMIT 1;

    -- Determine income ledger (service mapping takes priority) - NOW ALLOWS NULL
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings IS NOT NULL AND v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      v_income_ledger_id := NULL;  -- ALLOW NULL - user will fill later
    END IF;

    -- Get customer ledger account - ALLOW NULL
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

    -- Create invoice (ALLOW NULL FOR ACCOUNT IDS)
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
      'Auto-generated for ' || v_service.name || ' - Period: ' || NEW.period_start_date::text || ' to ' || NEW.period_end_date::text,
      v_income_ledger_id,  -- Can be NULL
      v_customer_ledger_id,  -- Can be NULL
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

    RAISE NOTICE 'Created invoice % for period % to % (Accounts: income=%, customer=%)', 
      v_invoice_number, NEW.period_start_date, NEW.period_end_date, 
      COALESCE(v_income_ledger_id::text, 'NOT MAPPED'), 
      COALESCE(v_customer_ledger_id::text, 'NOT MAPPED');

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;
CREATE TRIGGER auto_invoice_on_period_completion
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();

-- =====================================================
-- Also update non-recurring work invoice function
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

    -- Determine income ledger (service mapping takes priority) - ALLOW NULL
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings IS NOT NULL AND v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    ELSE
      v_income_ledger_id := NULL;  -- ALLOW NULL - user will fill later
    END IF;

    -- Get customer ledger account - ALLOW NULL
    v_customer_ledger_id := v_customer.account_id;

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

    -- Create invoice with ledger mappings (CAN BE NULL)
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
      v_income_ledger_id,  -- Can be NULL
      v_customer_ledger_id  -- Can be NULL
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

    RAISE NOTICE 'Created invoice % for work % (Accounts: income=%, customer=%)', 
      v_invoice_number, NEW.title,
      COALESCE(v_income_ledger_id::text, 'NOT MAPPED'),
      COALESCE(v_customer_ledger_id::text, 'NOT MAPPED');

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for work %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER UPDATE ON works
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_generate_work_invoice();

COMMENT ON FUNCTION auto_create_invoice_on_period_completion() IS 
  'Auto-creates invoice when recurring period completes. Allows NULL for account IDs if not mapped. User must fill before posting.';

COMMENT ON FUNCTION auto_generate_work_invoice() IS 
  'Auto-creates invoice when non-recurring work completes. Allows NULL for account IDs if not mapped. User must fill before posting.';
