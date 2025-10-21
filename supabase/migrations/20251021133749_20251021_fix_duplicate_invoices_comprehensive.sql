/*
  # Fix Duplicate Invoice Generation

  1. Issue
    - Multiple triggers creating duplicate invoices when tasks are completed
    - Two triggers found creating invoices simultaneously
    
  2. Solution
    - Drop all duplicate triggers
    - Create ONE trigger with proper duplicate prevention
    - Add tracking flag to prevent re-generation
    - Use work_recurring_instance_id to link tasks to instances
*/

-- Drop existing duplicate triggers
DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON recurring_period_tasks CASCADE;
DROP TRIGGER IF EXISTS auto_invoice_on_period_completion ON work_recurring_instances CASCADE;
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works CASCADE;

-- Drop related functions
DROP FUNCTION IF EXISTS auto_create_invoice_for_completed_period CASCADE;
DROP FUNCTION IF EXISTS auto_generate_work_invoice CASCADE;

-- Add invoice_generated flag to work_recurring_instances if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'work_recurring_instances' AND column_name = 'invoice_generated'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN invoice_generated boolean DEFAULT false;
  END IF;
END $$;

-- Create the SINGLE invoice generation function with comprehensive duplicate prevention
CREATE OR REPLACE FUNCTION create_invoice_on_period_task_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_instance_record record;
  v_work_record record;
  v_service_record record;
  v_invoice_id uuid;
  v_all_tasks_completed boolean;
  v_invoice_number text;
  v_invoice_exists boolean;
BEGIN
  -- Only proceed on UPDATE when status changes to 'completed'
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    
    -- Get the recurring instance record using work_recurring_instance_id
    SELECT * INTO v_instance_record
    FROM work_recurring_instances
    WHERE id = NEW.work_recurring_instance_id;
    
    -- Safety check: if no instance found, exit
    IF v_instance_record.id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Check if invoice already generated for this instance
    IF v_instance_record.invoice_generated = true THEN
      RETURN NEW;
    END IF;
    
    -- Check if invoice_id is already set on the instance
    IF v_instance_record.invoice_id IS NOT NULL THEN
      UPDATE work_recurring_instances 
      SET invoice_generated = true 
      WHERE id = NEW.work_recurring_instance_id;
      RETURN NEW;
    END IF;
    
    -- Check if all tasks for this instance are completed
    SELECT NOT EXISTS (
      SELECT 1 FROM recurring_period_tasks
      WHERE work_recurring_instance_id = NEW.work_recurring_instance_id
      AND status != 'completed'
    ) INTO v_all_tasks_completed;
    
    -- If not all tasks completed, exit
    IF NOT v_all_tasks_completed THEN
      RETURN NEW;
    END IF;
    
    -- Get work record
    SELECT * INTO v_work_record
    FROM works
    WHERE id = v_instance_record.work_id;
    
    -- Check if auto-generate is enabled
    IF v_work_record.auto_generate_invoice = false THEN
      RETURN NEW;
    END IF;
    
    -- Get service record
    SELECT * INTO v_service_record
    FROM services
    WHERE id = v_work_record.service_id;
    
    -- Final check: does an invoice already exist for this work/period?
    SELECT EXISTS (
      SELECT 1 FROM invoices
      WHERE work_id = v_work_record.id
      AND (
        notes LIKE '%' || TO_CHAR(v_instance_record.period_start_date, 'Mon YYYY') || '%'
        OR (invoice_date BETWEEN v_instance_record.period_start_date AND v_instance_record.period_end_date)
      )
    ) INTO v_invoice_exists;
    
    IF v_invoice_exists THEN
      -- Mark as generated to prevent future attempts
      UPDATE work_recurring_instances 
      SET invoice_generated = true 
      WHERE id = NEW.work_recurring_instance_id;
      RETURN NEW;
    END IF;
    
    -- All checks passed - generate invoice number
    SELECT generate_invoice_number(v_work_record.user_id) INTO v_invoice_number;
    
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
      discount_amount,
      total_amount,
      status,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_work_record.user_id,
      v_work_record.customer_id,
      v_work_record.id,
      v_invoice_number,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '30 days',
      COALESCE(v_service_record.price, 0),
      COALESCE(v_service_record.price, 0) * COALESCE(v_service_record.tax_rate, 0) / 100,
      0,
      COALESCE(v_service_record.price, 0) * (1 + COALESCE(v_service_record.tax_rate, 0) / 100),
      'draft',
      'Auto-generated invoice for ' || COALESCE(v_service_record.name, 'Service') || ' - Period ' || TO_CHAR(v_instance_record.period_start_date, 'Mon YYYY'),
      NOW(),
      NOW()
    ) RETURNING id INTO v_invoice_id;
    
    -- Create invoice item
    INSERT INTO invoice_items (
      invoice_id,
      service_id,
      description,
      quantity,
      unit_price,
      tax_rate,
      amount,
      created_at
    ) VALUES (
      v_invoice_id,
      v_service_record.id,
      COALESCE(v_service_record.name, 'Service') || ' - Period ' || TO_CHAR(v_instance_record.period_start_date, 'Mon YYYY'),
      1,
      COALESCE(v_service_record.price, 0),
      COALESCE(v_service_record.tax_rate, 0),
      COALESCE(v_service_record.price, 0),
      NOW()
    );
    
    -- Update instance with invoice_id and mark as generated
    UPDATE work_recurring_instances 
    SET invoice_id = v_invoice_id,
        invoice_generated = true,
        is_billed = true,
        billing_amount = COALESCE(v_service_record.price, 0)
    WHERE id = NEW.work_recurring_instance_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the SINGLE trigger on recurring_period_tasks
CREATE TRIGGER trigger_create_invoice_on_all_tasks_completed
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION create_invoice_on_period_task_completion();
