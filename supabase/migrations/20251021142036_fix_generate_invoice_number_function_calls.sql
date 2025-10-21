/*
  # Fix incorrect function calls to generate_invoice_number

  1. Problem
    - Two trigger functions are calling `generate_invoice_number(uuid)` which doesn't exist
    - The correct function is `generate_invoice_number_from_config(uuid)`
    - This causes errors when marking all tasks as completed (triggers auto-invoice)

  2. Changes
    - Update `auto_create_invoice_on_period_complete_v7()` function
    - Update `create_invoice_for_non_recurring_work_v2()` function
    - Replace `generate_invoice_number()` with `generate_invoice_number_from_config()`

  3. Security
    - No RLS changes
    - No data changes
    - Only fixes function calls
*/

-- Fix the auto_create_invoice_on_period_complete_v7 function
CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_complete_v7()
RETURNS TRIGGER AS $$
DECLARE
  v_work_record RECORD;
  v_service_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
BEGIN
  -- Only proceed if all tasks are completed
  IF NOT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = NEW.work_recurring_instance_id
    AND status != 'completed'
  ) THEN
    
    -- Get the work and service details
    SELECT w.*, s.auto_bill_enabled
    INTO v_work_record
    FROM works w
    JOIN services s ON w.service_id = s.id
    WHERE w.id = NEW.work_id;
    
    -- Only proceed if auto_bill is enabled
    IF NOT v_work_record.auto_bill_enabled THEN
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
    
    -- All checks passed - generate invoice number using the correct function
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
      COALESCE(v_work_record.agreed_fees, 0),
      COALESCE(v_work_record.agreed_fees, 0) * 0.18,
      COALESCE(v_work_record.agreed_fees, 0) * 1.18,
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
      'Service for period ' || NEW.period_name,
      1,
      COALESCE(v_work_record.agreed_fees, 0),
      COALESCE(v_work_record.agreed_fees, 0),
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


-- Fix the create_invoice_for_non_recurring_work_v2 function
CREATE OR REPLACE FUNCTION create_invoice_for_non_recurring_work_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
BEGIN
  -- Get the work and service details
  SELECT w.*, s.auto_bill_enabled
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  WHERE w.id = NEW.work_id;
  
  -- Only proceed if auto_bill is enabled for the service
  IF NOT v_work_record.auto_bill_enabled THEN
    RETURN NEW;
  END IF;
  
  -- Only for non-recurring works
  IF v_work_record.is_recurring THEN
    RETURN NEW;
  END IF;
  
  -- Check if invoice already exists for this work
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = NEW.work_id
  ) INTO v_invoice_exists;
  
  IF v_invoice_exists THEN
    RETURN NEW;
  END IF;
  
  -- All checks passed - generate invoice number using the correct function
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
    NEW.work_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    COALESCE(v_work_record.agreed_fees, 0),
    COALESCE(v_work_record.agreed_fees, 0) * 0.18,
    COALESCE(v_work_record.agreed_fees, 0) * 1.18,
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
    COALESCE(v_work_record.agreed_fees, 0),
    COALESCE(v_work_record.agreed_fees, 0),
    18.00,
    v_work_record.service_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure triggers are in place (recreate if needed)
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
