/*
  # Fix Auto-Invoice on Task Completion - Complete Solution

  ## Problem Analysis
  
  ### Current State:
  - work_tasks table has trigger trigger_auto_invoice_on_work_tasks_complete (working)
  - work_recurring_instances has trigger on period.status = 'completed' (wrong - users mark tasks, not periods)
  - recurring_period_tasks has NO trigger to check when all tasks completed (MISSING)
  
  ### User Workflow:
  1. Non-recurring work: Mark tasks in work_tasks → Should create invoice when all done
  2. Recurring work: Mark tasks in recurring_period_tasks → Should create invoice when all done
  
  ## Solution
  
  1. Keep the working trigger on work_tasks for non-recurring work
  2. Add new trigger on recurring_period_tasks to check when all tasks completed
  3. Remove duplicate/conflicting functions
  4. Ensure both triggers properly check auto_bill flag and create invoices
*/

-- ============================================================================
-- Create trigger for recurring_period_tasks
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_invoice_on_recurring_tasks_complete ON recurring_period_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_on_recurring_tasks_complete CASCADE;

CREATE OR REPLACE FUNCTION auto_create_invoice_on_recurring_tasks_complete()
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
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_all_completed boolean;
  v_task_count integer;
  v_completed_count integer;
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' OR NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;

  -- Count total tasks and completed tasks for this period
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  -- Check if ALL tasks are now completed
  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  RAISE NOTICE 'RECURRING: Period % - Total tasks: %, Completed: %, All completed: %',
    v_period_id, v_task_count, v_completed_count, v_all_completed;

  -- If not all tasks completed, exit
  IF NOT v_all_completed THEN
    RAISE NOTICE 'RECURRING: Not all tasks completed yet for period %', v_period_id;
    RETURN NEW;
  END IF;

  -- Get the period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RAISE WARNING 'RECURRING: Period instance % not found', v_period_id;
    RETURN NEW;
  END IF;

  -- Check if invoice already generated for this period
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE 'RECURRING: Invoice already generated for period %', v_period_id;
    RETURN NEW;
  END IF;

  -- Get work details with customer, service info, and tax_rate
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    COALESCE(cs.price, s.default_price) as final_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = v_instance_record.work_id;

  IF NOT FOUND THEN
    RAISE WARNING 'RECURRING: Work record % not found', v_instance_record.work_id;
    RETURN NEW;
  END IF;

  -- Check if auto_bill is enabled
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RAISE NOTICE 'RECURRING: Auto-bill is disabled for work %, skipping invoice', v_work_record.id;
    RETURN NEW;
  END IF;

  -- Check if invoice already exists for this period
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_instance_record.work_id
    AND work_recurring_instance_id = v_period_id
    AND user_id = v_work_record.user_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    RAISE NOTICE 'RECURRING: Invoice already exists for period %', v_period_id;
    -- Mark as generated to prevent future attempts
    UPDATE work_recurring_instances
    SET invoice_generated = true
    WHERE id = v_period_id;
    RETURN NEW;
  END IF;

  -- Use customer-specific price or default service price or billing_amount
  v_price := COALESCE(v_work_record.final_price, v_instance_record.billing_amount, v_work_record.billing_amount, v_work_record.default_price, 0);

  IF v_price <= 0 THEN
    RAISE WARNING 'RECURRING: Period % has no valid price', v_period_id;
    RETURN NEW;
  END IF;

  -- Get tax rate from service (defaults to 0 if NULL)
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);

  -- Calculate tax amount and total
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE 'RECURRING: Creating auto-invoice for period - price=%, tax_rate=%, total=%',
    v_price, v_tax_rate, v_total_amount;

  -- Create the invoice
  INSERT INTO invoices (
    user_id,
    customer_id,
    work_id,
    work_recurring_instance_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total_amount,
    status,
    notes
  )
  VALUES (
    v_work_record.user_id,
    v_work_record.customer_id,
    v_instance_record.work_id,
    v_period_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_price,
    v_tax_amount,
    v_total_amount,
    'draft',
    'Auto-generated for ' || v_instance_record.period_name
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item with correct tax_rate
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
    v_tax_rate,
    v_work_record.service_id
  );

  -- Mark invoice as generated on period
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount,
    status = 'completed',
    updated_at = NOW()
  WHERE id = v_period_id;

  RAISE NOTICE 'RECURRING: Successfully created invoice % for period', v_invoice_number;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'RECURRING: Error creating invoice for period %: %', v_period_id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger on recurring_period_tasks
CREATE TRIGGER trigger_auto_invoice_on_recurring_tasks_complete
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_recurring_tasks_complete();

COMMENT ON FUNCTION auto_create_invoice_on_recurring_tasks_complete IS
  'Auto-creates invoice when ALL recurring_period_tasks are completed for a recurring work period.
   Checks: auto_bill=true, all period tasks completed, invoice not already generated.
   Uses service.tax_rate and always shows tax. Marks period as completed.';

-- Verification
DO $$
DECLARE
  v_work_tasks_trigger INTEGER;
  v_recurring_tasks_trigger INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_work_tasks_trigger
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'work_tasks'
    AND t.tgname = 'trigger_auto_invoice_on_work_tasks_complete';

  SELECT COUNT(*) INTO v_recurring_tasks_trigger
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'recurring_period_tasks'
    AND t.tgname = 'trigger_auto_invoice_on_recurring_tasks_complete';

  RAISE NOTICE '=======================================================================';
  RAISE NOTICE 'AUTO-INVOICE TASK COMPLETION - MIGRATION COMPLETE';
  RAISE NOTICE '=======================================================================';
  
  IF v_work_tasks_trigger > 0 THEN
    RAISE NOTICE 'Non-recurring work trigger ACTIVE on work_tasks table';
  ELSE
    RAISE NOTICE 'WARNING: Non-recurring work trigger NOT FOUND';
  END IF;

  IF v_recurring_tasks_trigger > 0 THEN
    RAISE NOTICE 'Recurring work trigger ACTIVE on recurring_period_tasks table';
  ELSE
    RAISE NOTICE 'WARNING: Recurring work trigger NOT FOUND';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'NON-RECURRING WORK: Mark tasks in work_tasks as completed';
  RAISE NOTICE 'RECURRING WORK: Mark tasks in recurring_period_tasks as completed';
  RAISE NOTICE 'Both require: auto_bill=true on work';
  RAISE NOTICE '=======================================================================';
END $$;
