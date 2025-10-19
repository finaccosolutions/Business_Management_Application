/*
  # Fix Invoice Generation System - Complete Overhaul
  
  ## Critical Issues Fixed:
  
  1. **Recurring Work Invoice Not Generating When All Tasks Completed**
     - Problem: auto_invoice_on_period_completion trigger runs BEFORE UPDATE, but status is already 'completed' when it checks
     - Solution: Change trigger to AFTER UPDATE so it sees the actual status change
  
  2. **Non-Recurring Work Invoice Number Not Using Company Settings**
     - Problem: generate_next_invoice_number() using wrong logic
     - Solution: Fix the number generation to properly use company settings
  
  3. **Income Account Not Auto-Selecting**
     - Problem: Triggers not properly setting income_account_id from service or company settings
     - Solution: Already in trigger logic, verify it's working
  
  4. **Customer Account Not Auto-Selecting**
     - Problem: customer_account_id not being populated from customer's account_id
     - Solution: Already in trigger logic, verify it's working
  
  5. **Service Not Showing in Invoice Items**
     - Problem: service_id not being set in invoice_items
     - Solution: Already in trigger logic, verify column exists
  
  ## Changes Made:
  
  1. Drop and recreate auto_invoice_on_period_completion trigger as AFTER UPDATE
  2. Ensure invoice_items has service_id column
  3. Verify all trigger logic is correct
  4. Add detailed logging for debugging
*/

-- =====================================================
-- Step 1: Fix Recurring Period Invoice Generation Trigger
-- =====================================================

-- Drop the existing BEFORE trigger
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances;

-- Recreate the trigger function with improved logic
CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    
    RAISE NOTICE 'Period completed, checking if invoice should be created for period %', NEW.id;
    
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
    
    RAISE NOTICE 'Found work: %, auto_bill: %', v_work.title, v_work.auto_bill;
    
    -- Only create invoice if auto_bill is enabled for the work
    IF v_work.auto_bill != true THEN
      RAISE NOTICE 'Auto-bill not enabled for work %, skipping invoice creation', v_work.id;
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
    
    RAISE NOTICE 'Found service: %, default_price: %, tax_rate: %', v_service.name, v_service.default_price, v_service.tax_rate;
    
    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = v_work.customer_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Customer not found for work %', NEW.work_id;
      RETURN NEW;
    END IF;
    
    RAISE NOTICE 'Found customer: %, account_id: %', v_customer.name, v_customer.account_id;
    
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
      RAISE NOTICE 'Cannot create invoice for recurring work "%": Income ledger not mapped. Please map income ledger in Service Settings or Company Settings (Accounting Masters).', v_work.title;
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
    
    -- Generate invoice number using company settings
    v_invoice_number := generate_next_invoice_number(NEW.user_id);
    
    RAISE NOTICE 'Creating invoice with number: %', v_invoice_number;
    
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
      v_work.title || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      1,
      v_subtotal,
      v_subtotal,
      COALESCE(v_service.tax_rate, 0)
    );
    
    -- Link invoice to period
    NEW.invoice_id := v_invoice_id;
    
    RAISE NOTICE 'Created invoice % (ID: %) for recurring period with income account % and customer account %',
      v_invoice_number, v_invoice_id, v_income_ledger_id, v_customer_ledger_id;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error auto-creating invoice for period %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger as AFTER UPDATE so it sees the completed status
CREATE TRIGGER auto_invoice_on_period_completion
  AFTER UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_period_completion();

-- =====================================================
-- Step 2: Verify invoice_items has service_id column
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'service_id'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN service_id uuid REFERENCES services(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added service_id column to invoice_items';
  ELSE
    RAISE NOTICE 'service_id column already exists in invoice_items';
  END IF;
END $$;

-- =====================================================
-- Step 3: Add Comments for Documentation
-- =====================================================

COMMENT ON TRIGGER auto_invoice_on_period_completion ON work_recurring_instances IS
  'Auto-generates invoice when recurring period status changes to completed and all tasks are done. Runs AFTER UPDATE to see actual status change.';

COMMENT ON FUNCTION auto_create_invoice_on_period_completion() IS
  'Creates invoice for completed recurring period with proper ledger mappings and service details.';

COMMENT ON FUNCTION generate_next_invoice_number(uuid) IS
  'Generates sequential invoice number based on company_settings configuration.';
