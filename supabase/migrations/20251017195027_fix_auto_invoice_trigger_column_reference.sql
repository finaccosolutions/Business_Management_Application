/*
  # Fix Auto-Invoice Trigger Column Reference

  ## Issue
  The auto-invoice trigger function references `s.income_ledger_id` but the actual column 
  in the services table is named `income_account_id`. This causes an error when updating 
  task status because the trigger chain fails.

  ## Changes
  - Update the `auto_create_invoice_for_completed_period()` function to use the correct 
    column name `income_account_id` instead of `income_ledger_id`
  - Fix all references to use consistent naming
  - Use correct table name `work_recurring_instances`

  ## Error Fixed
  - PostgreSQL error 42703: "column s.income_ledger_id does not exist"
*/

-- Update the auto-invoice trigger function with correct column name
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
  -- Only create invoice if status changed to 'completed' AND auto_create_invoice is true
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    -- Return if work not found
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get service details with income ledger mapping (using correct column name)
    SELECT s.*
    INTO v_service
    FROM services s
    WHERE s.id = v_work.service_id;
    
    -- Return if service not found
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Check if auto_create_invoice is enabled
    IF v_service.auto_create_invoice THEN
      
      -- Get customer details with ledger mapping
      SELECT c.*, c.ledger_id as customer_ledger_id
      INTO v_customer
      FROM customers c
      WHERE c.id = v_service.customer_id;
      
      -- Get company settings for defaults
      SELECT *
      INTO v_company_settings
      FROM company_settings
      WHERE user_id = NEW.user_id
      LIMIT 1;
      
      -- Determine income ledger (service level first, then company default)
      -- Use income_account_id which is the actual column name
      IF v_service.income_account_id IS NOT NULL THEN
        v_income_ledger_id := v_service.income_account_id;
      ELSIF v_company_settings.default_income_ledger_id IS NOT NULL THEN
        v_income_ledger_id := v_company_settings.default_income_ledger_id;
      END IF;
      
      -- Get customer ledger
      IF v_customer.customer_ledger_id IS NOT NULL THEN
        v_customer_ledger_id := v_customer.customer_ledger_id;
      END IF;
      
      -- Generate invoice number
      SELECT COALESCE(v_company_settings.invoice_prefix, 'INV') || '-' || 
             LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = NEW.user_id;
      
      -- Calculate amounts
      v_subtotal := COALESCE(v_service.default_price, 0);
      v_tax_amount := v_subtotal * COALESCE(v_service.tax_rate, 0) / 100;
      v_total_amount := v_subtotal + v_tax_amount;
      
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
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger is properly set up on the correct table
DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON work_recurring_instances;

CREATE TRIGGER trigger_auto_create_invoice_for_completed_period
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();
