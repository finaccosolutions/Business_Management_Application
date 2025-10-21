/*
  # Fix Invoice Number Function Name
  
  The trigger was calling `generate_invoice_number(user_id)` but the actual function
  is `generate_invoice_number_from_config(user_id)`.
*/

-- Update the auto-invoice function to use correct function name
CREATE OR REPLACE FUNCTION auto_create_invoice_on_all_tasks_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_id uuid;
  v_instance_record RECORD;
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
  v_price numeric;
  v_all_completed boolean;
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' OR NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;

  -- Check if ALL tasks are now completed
  SELECT NOT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id
    AND status != 'completed'
  ) INTO v_all_completed;

  -- If not all tasks completed, exit
  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get the period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RETURN NEW;
  END IF;

  -- Get work details with customer and service info
  SELECT 
    w.*,
    s.name as service_name,
    s.default_price,
    c.name as customer_name,
    COALESCE(cs.price, s.default_price) as final_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = v_instance_record.work_id;

  -- Check if auto_bill is enabled
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- Check if invoice already exists for this period
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_instance_record.work_id
    AND work_recurring_instance_id = v_period_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    -- Mark as generated to prevent future attempts
    UPDATE work_recurring_instances 
    SET invoice_generated = true 
    WHERE id = v_period_id;
    RETURN NEW;
  END IF;

  -- Use customer-specific price or default service price
  v_price := COALESCE(v_work_record.final_price, 0);

  -- Generate invoice number using correct function name
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
    work_recurring_instance_id,
    notes
  )
  VALUES (
    v_work_record.user_id,
    v_work_record.customer_id,
    v_instance_record.work_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_price,
    v_price * 0.18,
    v_price * 1.18,
    'draft',
    v_period_id,
    'Auto-generated for ' || v_instance_record.period_name
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
    v_work_record.service_name || ' - ' || v_instance_record.period_name,
    1,
    v_price,
    v_price,
    18.00,
    v_work_record.service_id
  );

  -- Mark invoice as generated on period
  UPDATE work_recurring_instances 
  SET 
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_price * 1.18
  WHERE id = v_period_id;

  RETURN NEW;
END;
$$;
