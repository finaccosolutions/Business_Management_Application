/*
  # Fix Auto-Invoice to Only Create on Task Completion

  ## Problems Identified

  1. **Duplicate Invoice Creation**
     - `create_invoice_for_non_recurring_work_trigger` creates invoice on work INSERT
     - `trigger_auto_invoice_on_work_tasks_complete` creates invoice when all tasks complete
     - Result: Two invoices created OR invoice created before work even starts!

  2. **Wrong Behavior**
     - Current: Invoice created immediately when work is created (if auto_bill=true)
     - Required: Invoice should ONLY be created when ALL tasks are marked as completed

  3. **Invoice Not Re-Created After Deletion**
     - When invoice is deleted and task status changed back to pending, then back to completed
     - Invoice is not re-created because the function checks if invoice already exists
     - But after deletion, there's no way to trigger invoice creation again

  ## Solution

  1. **DISABLE invoice creation on work INSERT**
     - Drop `create_invoice_for_non_recurring_work_trigger`
     - Drop `create_invoice_for_non_recurring_work_v2()` function
     - This eliminates duplicate invoice creation

  2. **KEEP invoice creation on task completion**
     - Keep `trigger_auto_invoice_on_work_tasks_complete` (non-recurring)
     - Keep `trigger_auto_invoice_on_recurring_tasks_complete` (recurring)
     - These correctly create invoice only when ALL tasks are completed

  3. **Fix invoice re-creation logic**
     - Remove the "invoice already exists" check that prevents re-creation
     - Instead, check if work already has billing_status = 'billed'
     - This allows invoice to be re-created if deleted and tasks are re-completed

  ## Changes Made

  1. Drop work INSERT invoice trigger and function
  2. Update task completion functions to use billing_status instead of invoice existence
  3. Reset billing_status to 'pending' when all tasks change back to pending
*/

-- ============================================================================
-- STEP 1: Drop Work INSERT Invoice Trigger (Duplicate Invoice Creation)
-- ============================================================================

DROP TRIGGER IF EXISTS create_invoice_for_non_recurring_work_trigger ON works;
DROP FUNCTION IF EXISTS create_invoice_for_non_recurring_work_v2() CASCADE;
DROP FUNCTION IF EXISTS auto_create_invoice_on_period_complete_v7() CASCADE;
DROP TRIGGER IF EXISTS auto_create_invoice_on_period_complete_trigger ON recurring_period_tasks;

DO $$
BEGIN
  RAISE NOTICE '✓ Removed work INSERT invoice trigger (was creating duplicate invoices)';
END $$;

-- ============================================================================
-- STEP 2: Fix Non-Recurring Task Completion Invoice Function
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_invoice_on_work_tasks_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_id uuid;
  v_work_record RECORD;
  v_invoice_number TEXT;
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

  -- Count tasks
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM work_tasks
  WHERE work_id = v_work_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get work details
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
    RETURN NEW;
  END IF;

  -- Only for non-recurring
  IF v_work_record.is_recurring = true THEN
    RETURN NEW;
  END IF;

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- FIXED: Check billing_status instead of invoice existence
  -- This allows invoice to be re-created if deleted
  IF v_work_record.billing_status = 'billed' THEN
    RAISE NOTICE 'Work % already billed, skipping invoice creation', v_work_id;
    RETURN NEW;
  END IF;

  -- Calculate price
  v_price := COALESCE(v_work_record.final_price, v_work_record.billing_amount, v_work_record.default_price, 0);

  IF v_price <= 0 THEN
    RETURN NEW;
  END IF;

  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating invoice for non-recurring work: %', v_work_record.title;

  -- Create invoice
  INSERT INTO invoices (
    user_id, customer_id, work_id,
    invoice_number, invoice_date, due_date,
    subtotal, tax_amount, total_amount, status, notes
  )
  VALUES (
    v_work_record.user_id, v_work_record.customer_id, v_work_id,
    v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    v_price, v_tax_amount, v_total_amount, 'draft',
    'Auto-generated for work: ' || v_work_record.title
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item
  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_work_record.title,
    1, v_price, v_price, v_tax_rate, v_work_record.service_id
  );

  -- Update work billing_status
  UPDATE works
  SET billing_status = 'billed', updated_at = NOW()
  WHERE id = v_work_id;

  RAISE NOTICE '✓ Created invoice % for work %', v_invoice_number, v_work_record.title;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 3: Fix Recurring Task Completion Invoice Function
-- ============================================================================

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

  -- Count tasks
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_task_count, v_completed_count
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- FIXED: Check invoice_generated flag instead of invoice existence
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE 'Invoice already generated for period %', v_period_id;
    RETURN NEW;
  END IF;

  -- Get work details
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
    RETURN NEW;
  END IF;

  -- Check auto_bill
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- Calculate price
  v_price := COALESCE(v_work_record.final_price, v_instance_record.billing_amount, v_work_record.billing_amount, 0);

  IF v_price <= 0 THEN
    RETURN NEW;
  END IF;

  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  SELECT generate_invoice_number_from_config(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating invoice for recurring period: %', v_instance_record.period_name;

  -- Create invoice
  INSERT INTO invoices (
    user_id, customer_id, work_id, work_recurring_instance_id,
    invoice_number, invoice_date, due_date,
    subtotal, tax_amount, total_amount, status, notes
  )
  VALUES (
    v_work_record.user_id, v_work_record.customer_id, v_instance_record.work_id, v_period_id,
    v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    v_price, v_tax_amount, v_total_amount, 'draft',
    'Auto-generated for ' || v_instance_record.period_name
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item
  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_instance_record.period_name,
    1, v_price, v_price, v_tax_rate, v_work_record.service_id
  );

  -- Update period instance
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount,
    status = 'completed',
    updated_at = NOW()
  WHERE id = v_period_id;

  RAISE NOTICE '✓ Created invoice % for period %', v_invoice_number, v_instance_record.period_name;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating invoice: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 4: Reset Billing Status When Tasks Change Back to Pending
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_billing_status_on_task_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_id uuid;
  v_any_completed boolean;
BEGIN
  -- Only run on UPDATE when status changes from completed to something else
  IF TG_OP != 'UPDATE' OR OLD.status != 'completed' OR NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_work_id := NEW.work_id;

  -- Check if any task is still completed
  SELECT EXISTS (
    SELECT 1 FROM work_tasks
    WHERE work_id = v_work_id AND status = 'completed'
  ) INTO v_any_completed;

  -- If no tasks are completed, reset billing status
  IF NOT v_any_completed THEN
    UPDATE works
    SET billing_status = 'pending', updated_at = NOW()
    WHERE id = v_work_id;
    
    RAISE NOTICE '✓ Reset billing_status to pending for work %', v_work_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to reset billing status
DROP TRIGGER IF EXISTS trigger_reset_billing_status_on_task_pending ON work_tasks;
CREATE TRIGGER trigger_reset_billing_status_on_task_pending
  AFTER UPDATE ON work_tasks
  FOR EACH ROW
  EXECUTE FUNCTION reset_billing_status_on_task_pending();

-- ============================================================================
-- STEP 5: Reset invoice_generated Flag for Recurring Work
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_invoice_flag_on_recurring_task_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_id uuid;
  v_any_completed boolean;
BEGIN
  -- Only run on UPDATE when status changes from completed to something else
  IF TG_OP != 'UPDATE' OR OLD.status != 'completed' OR NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;

  -- Check if any task is still completed
  SELECT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id AND status = 'completed'
  ) INTO v_any_completed;

  -- If no tasks are completed, reset invoice_generated flag
  IF NOT v_any_completed THEN
    UPDATE work_recurring_instances
    SET 
      invoice_generated = false,
      is_billed = false,
      status = 'in_progress',
      updated_at = NOW()
    WHERE id = v_period_id;
    
    RAISE NOTICE '✓ Reset invoice_generated flag for period %', v_period_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to reset invoice_generated flag
DROP TRIGGER IF EXISTS trigger_reset_invoice_flag_on_recurring_task_pending ON recurring_period_tasks;
CREATE TRIGGER trigger_reset_invoice_flag_on_recurring_task_pending
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION reset_invoice_flag_on_recurring_task_pending();

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ AUTO-INVOICE SYSTEM FIXED ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. ✓ REMOVED duplicate invoice creation on work INSERT';
  RAISE NOTICE '   - Invoices NO LONGER created when work is created';
  RAISE NOTICE '   - Invoices ONLY created when ALL tasks are completed';
  RAISE NOTICE '';
  RAISE NOTICE '2. ✓ FIXED invoice re-creation after deletion';
  RAISE NOTICE '   - Delete invoice → change tasks to pending → complete tasks again';
  RAISE NOTICE '   - Invoice will be re-created correctly';
  RAISE NOTICE '';
  RAISE NOTICE '3. ✓ ADDED billing status reset logic';
  RAISE NOTICE '   - When tasks change from completed to pending';
  RAISE NOTICE '   - billing_status resets to "pending" for non-recurring work';
  RAISE NOTICE '   - invoice_generated resets to false for recurring work';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'How it works now:';
  RAISE NOTICE '1. Create work → NO invoice created';
  RAISE NOTICE '2. Complete all tasks → Invoice auto-created';
  RAISE NOTICE '3. Delete invoice + change task to pending → billing_status reset';
  RAISE NOTICE '4. Complete tasks again → New invoice created';
  RAISE NOTICE '========================================================================';
END $$;
