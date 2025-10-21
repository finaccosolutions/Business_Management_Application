/*
  # Fix create_invoice_on_period_task_completion Function

  ## Problem
  The function `create_invoice_on_period_task_completion()` is trying to check
  `v_work_record.auto_generate_invoice` which doesn't exist in the works table.
  
  This causes the error:
  Error: record "v_work_record" has no field "auto_generate_invoice"
  
  ## Root Cause
  The function references a non-existent column `auto_generate_invoice` on the
  works table. The correct column name is `auto_bill`.

  ## Solution
  Update the function to check `v_work_record.auto_bill` instead of 
  `v_work_record.auto_generate_invoice`.

  ## Changes
  - Replace auto_generate_invoice check with auto_bill check
  - Maintain all other functionality intact
*/

-- Drop and recreate the function with correct column reference
DROP FUNCTION IF EXISTS create_invoice_on_period_task_completion() CASCADE;

CREATE OR REPLACE FUNCTION public.create_invoice_on_period_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_instance_record RECORD;
  v_work_record RECORD;
  v_service_record RECORD;
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

    -- Check if auto_bill is enabled (FIXED: was auto_generate_invoice)
    IF COALESCE(v_work_record.auto_bill, false) = false THEN
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
$function$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_create_invoice_on_all_tasks_completed ON recurring_period_tasks;

CREATE TRIGGER trigger_create_invoice_on_all_tasks_completed
  AFTER UPDATE
  ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION create_invoice_on_period_task_completion();
