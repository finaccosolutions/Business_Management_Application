/*
  # Fix Auto-Invoice Trigger - Remove auto_create_invoice Check

  ## Issue
  The trigger function checks for `auto_create_invoice` column in services table, 
  but this column doesn't exist. This prevents invoices from being auto-generated
  when periods are completed.

  ## Solution
  Update the trigger function to remove the check for `auto_create_invoice` flag
  and always create invoices when periods are completed with valid amounts.

  ## Changes
  - Remove the check for `v_service.auto_create_invoice`
  - Simplify the trigger logic to always create invoices for completed periods
*/

-- Update the auto-invoice trigger function without the flag check
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
BEGIN
  -- Only create invoice if status changed to 'completed' and no invoice exists yet
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.invoice_id IS NULL THEN
    
    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    -- Return if work not found
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get service details
    SELECT s.*
    INTO v_service
    FROM services s
    WHERE s.id = v_work.service_id;
    
    -- Return if service not found
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get customer details with ledger mapping
    SELECT c.*, c.ledger_id as customer_ledger_id
    INTO v_customer
    FROM customers c
    WHERE c.id = v_service.customer_id;
    
    -- Return if customer not found
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get company settings for defaults
    SELECT *
    INTO v_company_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;
    
    -- Determine income ledger (service level first, then company default)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_ledger_id := v_service.income_account_id;
    ELSIF v_company_settings IS NOT NULL AND v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_ledger_id := v_company_settings.default_income_ledger_id;
    END IF;
    
    -- Get customer ledger
    IF v_customer.customer_ledger_id IS NOT NULL THEN
      v_customer_ledger_id := v_customer.customer_ledger_id;
    END IF;
    
    -- Generate invoice number
    IF v_company_settings IS NOT NULL THEN
      SELECT COALESCE(v_company_settings.invoice_prefix, 'INV') || '-' || 
             LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = NEW.user_id;
    ELSE
      SELECT 'INV-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = NEW.user_id;
    END IF;
    
    -- Calculate amounts
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
        income_ledger_id,
        customer_ledger_id,
        work_id
      ) VALUES (
        NEW.user_id,
        v_service.customer_id,
        v_invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        'pending',
        'Auto-generated for ' || v_service.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
        v_income_ledger_id,
        v_customer_ledger_id,
        NEW.work_id
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create invoice items
      INSERT INTO invoice_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        amount,
        tax_rate
      ) VALUES (
        v_invoice_id,
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
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to auto-create invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
