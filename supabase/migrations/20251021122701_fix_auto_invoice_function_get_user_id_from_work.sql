/*
  # Fix Auto-Invoice Function to Get user_id from Works Table
  
  ## Problem
  The `auto_create_invoice_on_period_completion` function references NEW.user_id,
  but the work_recurring_instances table doesn't have a user_id column.
  This causes the function to fail silently when trying to create invoices.
  
  ## Solution
  Modify the function to:
  1. Get user_id from the works table via the work_id foreign key
  2. Store it in a variable early in the function
  3. Use this variable throughout the function
  
  ## Changes
  - Updates `auto_create_invoice_on_period_completion()` function
  - Adds v_user_id variable to store the user_id
  - Gets user_id from works table instead of NEW record
*/

CREATE OR REPLACE FUNCTION public.auto_create_invoice_on_period_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  v_invoice_status text;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Get work details FIRST to get user_id
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Work not found for period %', NEW.id;
      RETURN NEW;
    END IF;
    
    -- Store user_id from work
    v_user_id := v_work.user_id;
    
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
    
    -- Check if auto_bill is enabled
    IF v_work.auto_bill != true THEN
      RAISE NOTICE 'Auto-billing not enabled for work %, skipping invoice', v_work.id;
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
    
    -- Get company settings using user_id from work
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = v_user_id
    LIMIT 1;
    
    -- Calculate amounts - MUST have a price to create invoice
    v_subtotal := COALESCE(v_service.default_price, 0);
    
    IF v_subtotal <= 0 THEN
      RAISE WARNING 'Skipping invoice - no valid price for service % (%)', v_service.id, v_service.name;
      RETURN NEW;
    END IF;
    
    v_tax_amount := ROUND(v_subtotal * (COALESCE(v_service.tax_rate, 0) / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;
    
    -- Determine income ledger (optional for draft invoices)
    v_income_ledger_id := NULL;
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
      RAISE NOTICE 'Using service income account: %', v_income_ledger_id;
    ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
      RAISE NOTICE 'Using default income account from company settings: %', v_income_ledger_id;
    ELSE
      RAISE NOTICE 'No income ledger mapped for service "%" - invoice will be created as draft', v_service.name;
    END IF;
    
    -- Get customer ledger account (optional)
    v_customer_ledger_id := v_customer.account_id;
    
    -- Determine invoice status - always draft
    v_invoice_status := 'draft';
    
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
    
    -- Generate invoice number using user_id from work
    v_invoice_number := generate_invoice_number_from_config(v_user_id);
    
    -- Create invoice (ledger accounts can be NULL)
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
      v_invoice_status,
      'Auto-generated invoice for recurring work: ' || v_work.title || ' | Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      v_income_ledger_id,  -- Can be NULL
      v_customer_ledger_id, -- Can be NULL
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
    NEW.is_billed := true;
    
    IF v_income_ledger_id IS NULL OR v_customer_ledger_id IS NULL THEN
      RAISE NOTICE 'Created invoice % (ID: %) as DRAFT - Ledger mapping required before posting. Please map income ledger in Service Settings or Accounting Masters.',
        v_invoice_number, v_invoice_id;
    ELSE
      RAISE NOTICE 'Created invoice % (ID: %) for recurring period with ledger accounts mapped',
        v_invoice_number, v_invoice_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$function$;
