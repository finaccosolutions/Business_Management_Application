/*
  # Fix Auto-Invoice Issues and Prevent Duplicates

  ## Overview
  This migration fixes several critical issues with auto-invoice generation:
  1. Updates auto-invoice trigger to save service_id in invoice_items
  2. Prevents duplicate invoice creation on task completion
  3. Fixes income account auto-selection from service settings
  4. Ensures proper ledger mapping for invoices

  ## Issues Fixed
  1. Auto-invoice doesn't save service_id (makes editing impossible)
  2. Two invoices created on task completion instead of one
  3. Income account not auto-selected from service or settings
  4. Invoice numbers not using the new numbering configuration

  ## Changes
  - Update auto_create_invoice_for_completed_period to:
    - Save service_id in invoice_items
    - Use proper income account mapping
    - Generate invoice number using new format settings
    - Prevent duplicate creation with better checks
  
  ## Important Notes
  - This ensures invoices can be properly edited later
  - Service-level income accounts take precedence over defaults
  - Invoice numbers now respect user configuration
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS auto_invoice_on_period_complete ON work_recurring_instances;

-- Recreate the function with fixes
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
  v_existing_invoice_id uuid;
  v_invoice_count integer;
BEGIN
  -- Only create invoice if status changed to 'completed' and no invoice exists yet
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.invoice_id IS NULL THEN
    
    -- Check if an invoice already exists for this period (safety check)
    SELECT invoice_id INTO v_existing_invoice_id
    FROM work_recurring_instances
    WHERE id = NEW.id AND invoice_id IS NOT NULL;
    
    IF v_existing_invoice_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    
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
    SELECT c.*, c.account_id as customer_ledger_id
    INTO v_customer
    FROM customers c
    WHERE c.id = v_work.customer_id;
    
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
    
    -- Generate invoice number using new configuration
    IF v_company_settings IS NOT NULL THEN
      -- Count existing invoices for this user
      SELECT COUNT(*) INTO v_invoice_count
      FROM invoices
      WHERE user_id = NEW.user_id;
      
      -- Generate number with user settings
      DECLARE
        v_prefix text := COALESCE(v_company_settings.invoice_prefix, 'INV');
        v_suffix text := COALESCE(v_company_settings.invoice_suffix, '');
        v_width integer := COALESCE(v_company_settings.invoice_number_width, 6);
        v_prefix_zero boolean := COALESCE(v_company_settings.invoice_number_prefix_zero, true);
        v_starting_number integer := COALESCE(v_company_settings.invoice_starting_number, 1);
        v_actual_number integer := v_starting_number + v_invoice_count;
        v_number_part text;
      BEGIN
        IF v_prefix_zero THEN
          v_number_part := LPAD(v_actual_number::text, v_width, '0');
        ELSE
          v_number_part := v_actual_number::text;
        END IF;
        
        v_invoice_number := v_prefix || '-' || v_number_part || v_suffix;
      END;
    ELSE
      -- Fallback to simple numbering
      SELECT 'INV-' || LPAD((COALESCE(COUNT(*), 0) + 1)::text, 6, '0')
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
        income_account_id,
        customer_account_id,
        work_id
      ) VALUES (
        NEW.user_id,
        v_work.customer_id,
        v_invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        v_subtotal,
        v_tax_amount,
        v_total_amount,
        'draft',
        'Auto-generated for ' || v_service.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
        v_income_ledger_id,
        v_customer_ledger_id,
        NEW.work_id
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create invoice items WITH service_id for proper editing
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

-- Recreate the trigger
CREATE TRIGGER auto_invoice_on_period_complete
  BEFORE UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();

-- Add comment
COMMENT ON FUNCTION auto_create_invoice_for_completed_period IS 'Auto-creates invoices when recurring periods are marked as completed, with proper service_id tracking and income account mapping';
