/*
  # Fix auto-invoice trigger functions with correct column references

  1. Problem
    - Trigger functions reference non-existent columns:
      - `s.auto_bill_enabled` (services table) - doesn't exist, should use `w.auto_bill` from works
      - `v_work_record.agreed_fees` - doesn't exist, should use price from customer_services
      - `v_work_record.service_name` - doesn't exist
      - `v_work_record.customer_name` - doesn't exist

  2. Changes
    - Fix `auto_create_invoice_on_period_complete_v7()` to use correct columns
    - Fix `create_invoice_for_non_recurring_work_v2()` to use correct columns
    - Use `w.auto_bill` instead of `s.auto_bill_enabled`
    - Get price from `customer_services` table
    - Get service and customer names via proper joins

  3. Security
    - No RLS changes
    - Functions remain SECURITY DEFINER
*/

-- Fix the auto_create_invoice_on_period_complete function
CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_complete_v7()
RETURNS TRIGGER AS $$
DECLARE
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
  v_price numeric;
BEGIN
  -- Only proceed if all tasks are completed
  IF NOT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = NEW.work_recurring_instance_id
    AND status != 'completed'
  ) THEN
    
    -- Get the work details with customer and service info
    SELECT 
      w.*,
      s.name as service_name,
      s.default_price,
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
    
    -- Generate invoice number
    SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;
    
    -- Create the invoice
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
      v_price * 0.18,
      v_price * 1.18,
      'draft',
      NEW.work_recurring_instance_id
    )
    RETURNING id INTO v_invoice_id;
    
    -- Create invoice item
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
      18.00,
      v_work_record.service_id
    );
    
    -- Mark invoice as generated
    UPDATE work_recurring_instances 
    SET invoice_generated = true 
    WHERE id = NEW.work_recurring_instance_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Fix the create_invoice_for_non_recurring_work function
CREATE OR REPLACE FUNCTION create_invoice_for_non_recurring_work_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
  v_price numeric;
BEGIN
  -- Get the work details with customer and service info
  SELECT 
    w.*,
    s.name as service_name,
    s.default_price,
    c.name as customer_name,
    cs.price as customer_service_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = NEW.id;
  
  -- Only proceed if auto_bill is enabled for this work
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;
  
  -- Only for non-recurring works
  IF COALESCE(v_work_record.is_recurring, false) THEN
    RETURN NEW;
  END IF;
  
  -- Check if invoice already exists for this work
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = NEW.id
  ) INTO v_invoice_exists;
  
  IF v_invoice_exists THEN
    RETURN NEW;
  END IF;
  
  -- Determine the price to use (customer-specific price or default service price)
  v_price := COALESCE(v_work_record.customer_service_price, v_work_record.default_price, 0);
  
  -- Generate invoice number
  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;
  
  -- Create the invoice
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
    status
  )
  VALUES (
    v_work_record.user_id,
    v_work_record.customer_id,
    NEW.id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_price,
    v_price * 0.18,
    v_price * 1.18,
    'draft'
  )
  RETURNING id INTO v_invoice_id;
  
  -- Create invoice item
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
    v_work_record.service_name || ' - ' || v_work_record.customer_name,
    1,
    v_price,
    v_price,
    18.00,
    v_work_record.service_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure triggers are properly configured
DROP TRIGGER IF EXISTS auto_create_invoice_on_period_complete_trigger ON recurring_period_tasks;
CREATE TRIGGER auto_create_invoice_on_period_complete_trigger
  AFTER UPDATE OF status ON recurring_period_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION auto_create_invoice_on_period_complete_v7();

DROP TRIGGER IF EXISTS create_invoice_for_non_recurring_work_trigger ON works;
CREATE TRIGGER create_invoice_for_non_recurring_work_trigger
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION create_invoice_for_non_recurring_work_v2();
