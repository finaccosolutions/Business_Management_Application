/*
  # Fix Auto-Invoice for BOTH Recurring and Non-Recurring Work

  ## Correct Requirements (clarified)

  ### Recurring Work:
  - When all tasks in recurring_period_tasks are completed → DO NOT create invoice
  - Invoices for recurring periods should be created manually

  ### Non-Recurring Work:
  - When all tasks in work_tasks are completed → CREATE invoice automatically
  - Show tax in invoice even if service has 0% tax

  ## Changes Made

  1. **Recurring Work**: Keep auto-invoice DISABLED (already done)
  2. **Non-Recurring Work**: Fix the existing trigger to work properly
*/

-- ============================================================================
-- Fix Non-Recurring Work Auto-Invoice
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_on_work_tasks_complete CASCADE;

-- Recreate the function with proper logic
CREATE OR REPLACE FUNCTION auto_create_invoice_on_work_tasks_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_id uuid;
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

  v_work_id := NEW.work_id;

  -- Count total tasks and completed tasks for this work
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM work_tasks
  WHERE work_id = v_work_id;

  -- Check if ALL tasks are now completed
  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  RAISE NOTICE 'Work % - Total tasks: %, Completed: %, All completed: %', 
    v_work_id, v_task_count, v_completed_count, v_all_completed;

  -- If not all tasks completed, exit
  IF NOT v_all_completed THEN
    RAISE NOTICE 'Not all tasks completed yet for work %', v_work_id;
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
  WHERE w.id = v_work_id;

  IF NOT FOUND THEN
    RAISE WARNING 'Work % not found', v_work_id;
    RETURN NEW;
  END IF;

  -- Only proceed for non-recurring work
  IF v_work_record.is_recurring = true THEN
    RAISE NOTICE 'Work % is recurring, skipping auto-invoice', v_work_id;
    RETURN NEW;
  END IF;

  -- Check if auto_bill is enabled
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RAISE NOTICE 'Auto-bill is disabled for work %', v_work_id;
    RETURN NEW;
  END IF;

  -- Check if invoice already exists for this work
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_work_id
    AND user_id = v_work_record.user_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    RAISE NOTICE 'Invoice already exists for work %', v_work_record.title;
    RETURN NEW;
  END IF;

  -- Use customer-specific price or default service price or billing_amount
  v_price := COALESCE(v_work_record.final_price, v_work_record.billing_amount, v_work_record.default_price, 0);

  IF v_price <= 0 THEN
    RAISE WARNING 'Work % has no valid price (price=%)', v_work_id, v_price;
    RETURN NEW;
  END IF;

  -- Get tax rate from service (defaults to 0 if NULL)
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);

  -- Calculate tax amount and total
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating auto-invoice for non-recurring work "%": price=%, tax_rate=%, tax_amount=%, total=%',
    v_work_record.title, v_price, v_tax_rate, v_tax_amount, v_total_amount;

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
    notes
  )
  VALUES (
    v_work_record.user_id,
    v_work_record.customer_id,
    v_work_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_price,
    v_tax_amount,
    v_total_amount,
    'draft',
    'Auto-generated for work: ' || v_work_record.title
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item with correct tax_rate (even if 0%)
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
    v_work_record.service_name || ' - ' || v_work_record.title,
    1,
    v_price,
    v_price,
    v_tax_rate,
    v_work_record.service_id
  );

  -- Update work billing status
  UPDATE works
  SET
    billing_status = 'billed',
    updated_at = NOW()
  WHERE id = v_work_id;

  RAISE NOTICE '✓ Successfully created invoice % (ID: %) for non-recurring work "%"', 
    v_invoice_number, v_invoice_id, v_work_record.title;
  RAISE NOTICE '  Invoice details: tax_rate=%, subtotal=%, tax=%, total=%',
    v_tax_rate, v_price, v_tax_amount, v_total_amount;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error creating invoice for work %: %', v_work_id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trigger_auto_invoice_on_work_tasks_complete
  AFTER UPDATE ON work_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_work_tasks_complete();

COMMENT ON FUNCTION auto_create_invoice_on_work_tasks_complete IS
  'Auto-creates invoice when ALL work_tasks are completed for NON-RECURRING work only.
   - Checks: is_recurring=false, auto_bill=true, all tasks completed
   - Uses service.tax_rate (defaults to 0%) and ALWAYS shows tax
   - Calculates: tax_amount = price * (tax_rate / 100), total = price + tax_amount
   - Skips if invoice already exists for this work';

-- ============================================================================
-- Verify Trigger Status
-- ============================================================================

DO $$
DECLARE
  v_trigger_count INTEGER;
BEGIN
  -- Check if trigger exists on work_tasks
  SELECT COUNT(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'work_tasks'
    AND t.tgname = 'trigger_auto_invoice_on_work_tasks_complete';

  IF v_trigger_count > 0 THEN
    RAISE NOTICE '✓ Trigger "trigger_auto_invoice_on_work_tasks_complete" is active on work_tasks';
  ELSE
    RAISE WARNING '✗ Trigger NOT found on work_tasks!';
  END IF;

  -- Check if trigger exists on recurring_period_tasks
  SELECT COUNT(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'recurring_period_tasks'
    AND t.tgname = 'trigger_auto_invoice_on_all_tasks_complete';

  IF v_trigger_count = 0 THEN
    RAISE NOTICE '✓ Auto-invoice trigger is DISABLED for recurring_period_tasks (as required)';
  ELSE
    RAISE WARNING '✗ Auto-invoice trigger still exists on recurring_period_tasks!';
  END IF;

  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ MIGRATION COMPLETE ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Auto-Invoice Status:';
  RAISE NOTICE '- Recurring work (recurring_period_tasks): DISABLED ✓';
  RAISE NOTICE '- Non-recurring work (work_tasks): ENABLED ✓';
  RAISE NOTICE '';
  RAISE NOTICE 'When you mark all tasks as completed:';
  RAISE NOTICE '- Recurring work → NO invoice created';
  RAISE NOTICE '- Non-recurring work (with auto_bill=true) → Invoice created with tax';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
END $$;
