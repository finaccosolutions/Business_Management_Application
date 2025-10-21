/*
  # Fix Recurring Invoice Hardcoded Tax Rate Issue

  ## Problem
  The `auto_create_invoice_on_period_complete_v7()` function is creating invoices 
  with a hardcoded 18% tax rate for recurring work.

  Lines causing the issue:
  - Line 102: `tax_amount = v_price * 0.18` (hardcoded 18%)
  - Line 103: `total_amount = v_price * 1.18` (hardcoded 18%)
  - Line 125: `tax_rate = 18.00` (hardcoded 18%)

  ## Solution
  Update the function to:
  1. Get the actual tax_rate from the service
  2. Use COALESCE(s.tax_rate, 0) to default to 0 if NULL
  3. Calculate tax_amount = v_price * (v_tax_rate / 100)
  4. Calculate total_amount = v_price + tax_amount
  5. Store the actual tax_rate in invoice_items

  ## Impact
  - Recurring invoices will now correctly reflect the service's tax_rate setting
  - Same behavior as non-recurring invoices
*/

-- Fix the auto_create_invoice_on_period_complete function with correct tax calculation
CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_complete_v7()
RETURNS TRIGGER AS $$
DECLARE
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
BEGIN
  -- Only proceed if all tasks are completed
  IF NOT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = NEW.work_recurring_instance_id
    AND status != 'completed'
  ) THEN
    
    -- Get the work details with customer and service info, including tax_rate
    SELECT 
      w.*,
      s.name as service_name,
      s.default_price,
      COALESCE(s.tax_rate, 0) as service_tax_rate,
      c.name as customer_name,
      cs.price as customer_service_price
    INTO v_work_record
    FROM works w
    JOIN services s ON w.service_id = s.id
    JOIN customers c ON w.customer_id = c.id
    LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
    WHERE w.id = NEW.work_id;
    
    -- Only proceed if auto_bill is enabled for this work
    IF NOT COALESCE(v_work_record.auto_bill, false) THEN
      RETURN NEW;
    END IF;
    
    -- Check if invoice already exists for this period
    SELECT EXISTS (
      SELECT 1 FROM invoices
      WHERE work_id = NEW.work_id
      AND recurring_period_id = NEW.work_recurring_instance_id
    ) INTO v_invoice_exists;
    
    IF v_invoice_exists THEN
      -- Mark as generated to prevent future attempts
      UPDATE work_recurring_instances 
      SET invoice_generated = true 
      WHERE id = NEW.work_recurring_instance_id;
      RETURN NEW;
    END IF;
    
    -- Determine the price to use (customer-specific price or default service price)
    v_price := COALESCE(v_work_record.customer_service_price, v_work_record.default_price, 0);
    
    -- Get tax rate from service (defaults to 0 if NULL)
    v_tax_rate := v_work_record.service_tax_rate;
    
    -- Calculate tax amount and total
    v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
    v_total_amount := v_price + v_tax_amount;
    
    -- Generate invoice number
    SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;
    
    RAISE NOTICE '→ Creating recurring invoice: price=%, tax_rate=%, tax_amount=%, total=%',
      v_price, v_tax_rate, v_tax_amount, v_total_amount;
    
    -- Create the invoice with correctly calculated amounts
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
      recurring_period_id
    )
    VALUES (
      v_work_record.user_id,
      v_work_record.customer_id,
      NEW.work_id,
      v_invoice_number,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '30 days',
      v_price,
      v_tax_amount,
      v_total_amount,
      'draft',
      NEW.work_recurring_instance_id
    )
    RETURNING id INTO v_invoice_id;
    
    -- Create invoice item with correct tax_rate from service
    INSERT INTO invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      amount,
      tax_rate,
      service_id
    )
    VALUES (
      v_invoice_id,
      v_work_record.service_name || ' - ' || NEW.period_name,
      1,
      v_price,
      v_price,
      v_tax_rate,
      v_work_record.service_id
    );
    
    -- Mark invoice as generated
    UPDATE work_recurring_instances 
    SET invoice_generated = true 
    WHERE id = NEW.work_recurring_instance_id;
    
    RAISE NOTICE '✓ Created recurring invoice % with correct tax_rate=% (from service)', 
      v_invoice_number, v_tax_rate;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_create_invoice_on_period_complete_v7 IS
  'Auto-creates invoice when all recurring period tasks are completed (if auto_bill=true).
   Uses service.tax_rate (defaults to 0%) for calculations.
   Calculates: tax_amount = price * (tax_rate / 100), total = price + tax_amount';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ FIXED RECURRING INVOICE TAX CALCULATION ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed hardcoded 18%% tax rate in auto_create_invoice_on_period_complete_v7()';
  RAISE NOTICE '';
  RAISE NOTICE 'Both non-recurring and recurring invoices now use service.tax_rate';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
END $$;
