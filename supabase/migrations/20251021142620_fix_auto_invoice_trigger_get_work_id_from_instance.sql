/*
  # Fix auto-invoice trigger to get work_id from work_recurring_instance

  1. Problem
    - Trigger on `recurring_period_tasks` tries to access `NEW.work_id` which doesn't exist
    - The table only has `work_recurring_instance_id`
    - Need to join to `work_recurring_instances` to get `work_id`

  2. Changes
    - Update `auto_create_invoice_on_period_complete_v7()` to get work_id from work_recurring_instances
    - First get the instance record, then use its work_id

  3. Security
    - No RLS changes
    - Function remains SECURITY DEFINER
*/

CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_complete_v7()
RETURNS TRIGGER AS $$
DECLARE
  v_instance_record RECORD;
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
    
    -- First get the work_recurring_instance to get work_id
    SELECT *
    INTO v_instance_record
    FROM work_recurring_instances
    WHERE id = NEW.work_recurring_instance_id;
    
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
    WHERE w.id = v_instance_record.work_id;
    
    -- Only proceed if auto_bill is enabled for this work
    IF NOT COALESCE(v_work_record.auto_bill, false) THEN
      RETURN NEW;
    END IF;
    
    -- Check if invoice already exists for this period
    SELECT EXISTS (
      SELECT 1 FROM invoices
      WHERE work_id = v_instance_record.work_id
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
      v_instance_record.work_id,
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
      v_work_record.service_name || ' - ' || v_instance_record.period_name,
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

-- Recreate the trigger to ensure it's using the updated function
DROP TRIGGER IF EXISTS auto_create_invoice_on_period_complete_trigger ON recurring_period_tasks;
CREATE TRIGGER auto_create_invoice_on_period_complete_trigger
  AFTER UPDATE OF status ON recurring_period_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION auto_create_invoice_on_period_complete_v7();
