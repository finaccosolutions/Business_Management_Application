/*
  # Fix Auto-Invoice Trigger and Duplicate Invoice Numbers

  ## Issues Fixed
  1. Auto-invoice trigger references wrong customer field (v_service.customer_id should be v_work.customer_id)
  2. Auto-invoice trigger references non-existent column (c.ledger_id should be c.account_id)
  3. Duplicate invoice number constraint when manually creating invoices after auto-generation
  
  ## Changes
  1. Fix auto-invoice trigger function to use correct column references
  2. Make invoice_number constraint deferrable or handle duplicate prevention better
  3. Ensure ledger accounts (income_account_id and customer_account_id) are properly set

  ## Notes
  - Auto-generated invoices will now properly populate income_account_id and customer_account_id
  - Invoice number generation will work for both auto and manual invoice creation
*/

-- Drop the existing unique constraint on invoice_number
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

-- Add a unique constraint per user (invoice numbers should be unique per user, not globally)
ALTER TABLE invoices ADD CONSTRAINT invoices_user_invoice_number_key UNIQUE (user_id, invoice_number);

-- Fix the auto-invoice trigger function with correct column references
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
  v_income_account_id uuid;
  v_customer_account_id uuid;
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
    
    -- Get customer details with account mapping (fixed: use account_id not ledger_id)
    SELECT c.*, c.account_id as customer_account_id
    INTO v_customer
    FROM customers c
    WHERE c.id = v_work.customer_id;  -- Fixed: use v_work.customer_id not v_service.customer_id
    
    -- Return if customer not found
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    
    -- Get company settings for defaults
    SELECT *
    INTO v_company_settings
    FROM company_settings
    WHERE user_id = v_work.user_id  -- Use v_work.user_id for consistency
    LIMIT 1;
    
    -- Determine income account (service level first, then company default)
    IF v_service.income_account_id IS NOT NULL THEN
      v_income_account_id := v_service.income_account_id;
    ELSIF v_company_settings IS NOT NULL AND v_company_settings.default_income_ledger_id IS NOT NULL THEN
      v_income_account_id := v_company_settings.default_income_ledger_id;
    END IF;
    
    -- Get customer account
    IF v_customer.customer_account_id IS NOT NULL THEN
      v_customer_account_id := v_customer.customer_account_id;
    END IF;
    
    -- Generate unique invoice number per user
    IF v_company_settings IS NOT NULL AND v_company_settings.invoice_prefix IS NOT NULL THEN
      SELECT COALESCE(v_company_settings.invoice_prefix, 'INV') || '-' || 
             LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = v_work.user_id;
    ELSE
      SELECT 'INV-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = v_work.user_id;
    END IF;
    
    -- Calculate amounts (use billing_amount from work if available, otherwise service default)
    v_subtotal := COALESCE(v_work.billing_amount, v_service.default_price, 0);
    v_tax_amount := v_subtotal * COALESCE(v_service.tax_rate, 0) / 100;
    v_total_amount := v_subtotal + v_tax_amount;
    
    -- Only create invoice if there's a valid amount
    IF v_subtotal > 0 THEN
      -- Create the invoice with ledger accounts
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
        v_work.user_id,
        v_work.customer_id,  -- Fixed: use v_work.customer_id
        v_invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        'pending',
        'Auto-generated for ' || v_service.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
        v_income_account_id,
        v_customer_account_id,
        NEW.work_id
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create invoice items with tax_rate
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

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON work_recurring_instances;

CREATE TRIGGER trigger_auto_create_invoice_for_completed_period
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();
