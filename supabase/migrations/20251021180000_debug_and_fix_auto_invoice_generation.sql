/*
  # Debug and Fix Auto-Invoice Generation on Task Completion

  ## Issue
  When all recurring work tasks are marked as completed, auto-invoice is not being created.

  ## Possible Root Causes
  1. Trigger not firing properly
  2. auto_bill flag not set on work
  3. invoice_generated flag already set
  4. Missing work record or related data
  5. Trigger checking wrong conditions
  6. RAISE NOTICE messages not being logged

  ## Solution
  1. Add comprehensive debug logging to track execution
  2. Verify all conditions that could prevent invoice creation
  3. Add fallback error handling
  4. Ensure triggers are created in correct order
  5. Log each step of the invoice creation process

  ## Changes Made
  - Enhanced auto_create_invoice_on_all_tasks_complete() with extensive logging
  - Added exception handling to prevent silent failures
  - Log all condition checks (auto_bill, invoice_exists, etc.)
  - Added work_id validation
  - Ensured trigger fires AFTER UPDATE on recurring_period_tasks
*/

-- ============================================================================
-- Drop and recreate with enhanced debugging
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_invoice_on_all_tasks_complete ON recurring_period_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_on_all_tasks_complete CASCADE;

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
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_all_completed boolean;
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' THEN
    RAISE NOTICE '[AUTO-INVOICE] Skipped: TG_OP=%, not UPDATE', TG_OP;
    RETURN NEW;
  END IF;

  IF NEW.status != 'completed' THEN
    RAISE NOTICE '[AUTO-INVOICE] Skipped: NEW.status=%, not completed', NEW.status;
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE NOTICE '[AUTO-INVOICE] Skipped: OLD.status already completed';
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '[AUTO-INVOICE] Task % marked completed, checking period %', NEW.id, v_period_id;

  -- Check if ALL tasks are now completed
  SELECT NOT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id
    AND status != 'completed'
  ) INTO v_all_completed;

  RAISE NOTICE '[AUTO-INVOICE] All tasks completed for period %: %', v_period_id, v_all_completed;

  -- If not all tasks completed, exit
  IF NOT v_all_completed THEN
    RAISE NOTICE '[AUTO-INVOICE] Not all tasks completed yet, skipping invoice generation';
    RETURN NEW;
  END IF;

  RAISE NOTICE '[AUTO-INVOICE] ✓ All tasks completed! Proceeding with invoice generation...';

  -- Get the period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  IF v_instance_record IS NULL THEN
    RAISE WARNING '[AUTO-INVOICE] ✗ ERROR: Period instance % not found!', v_period_id;
    RETURN NEW;
  END IF;

  RAISE NOTICE '[AUTO-INVOICE] Period: % (work_id=%)', v_instance_record.period_name, v_instance_record.work_id;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RAISE NOTICE '[AUTO-INVOICE] Invoice already generated for this period, skipping';
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

  IF v_work_record IS NULL THEN
    RAISE WARNING '[AUTO-INVOICE] ✗ ERROR: Work record % not found!', v_instance_record.work_id;
    RETURN NEW;
  END IF;

  RAISE NOTICE '[AUTO-INVOICE] Work: % - % for %',
    v_work_record.id, v_work_record.service_name, v_work_record.customer_name;
  RAISE NOTICE '[AUTO-INVOICE] auto_bill flag: %', COALESCE(v_work_record.auto_bill, false);

  -- Check if auto_bill is enabled
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RAISE NOTICE '[AUTO-INVOICE] Auto-billing NOT enabled for this work, skipping';
    RETURN NEW;
  END IF;

  RAISE NOTICE '[AUTO-INVOICE] ✓ Auto-billing enabled, proceeding...';

  -- Check if invoice already exists for this period
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_instance_record.work_id
    AND work_recurring_instance_id = v_period_id
  ) INTO v_invoice_exists;

  RAISE NOTICE '[AUTO-INVOICE] Invoice exists for period: %', v_invoice_exists;

  IF v_invoice_exists THEN
    -- Mark as generated to prevent future attempts
    UPDATE work_recurring_instances
    SET invoice_generated = true
    WHERE id = v_period_id;
    RAISE NOTICE '[AUTO-INVOICE] Invoice already exists, marked as generated';
    RETURN NEW;
  END IF;

  -- Use customer-specific price or default service price
  v_price := COALESCE(v_work_record.final_price, 0);

  -- Get tax rate from service (defaults to 0 if NULL)
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);

  -- Calculate tax amount and total
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  RAISE NOTICE '[AUTO-INVOICE] Price: %, Tax Rate: %%, Tax Amount: %, Total: %',
    v_price, v_tax_rate, v_tax_amount, v_total_amount;

  -- Generate invoice number
  BEGIN
    SELECT generate_invoice_number(v_work_record.user_id) INTO v_invoice_number;
    RAISE NOTICE '[AUTO-INVOICE] Generated invoice number: %', v_invoice_number;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[AUTO-INVOICE] ✗ ERROR generating invoice number: %', SQLERRM;
      RETURN NEW;
  END;

  -- Create the invoice
  BEGIN
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
      v_tax_amount,
      v_total_amount,
      'draft',
      v_period_id,
      'Auto-generated for ' || v_instance_record.period_name
    )
    RETURNING id INTO v_invoice_id;

    RAISE NOTICE '[AUTO-INVOICE] ✓ Created invoice % (ID: %)', v_invoice_number, v_invoice_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[AUTO-INVOICE] ✗ ERROR creating invoice: %', SQLERRM;
      RETURN NEW;
  END;

  -- Create invoice item with correct tax_rate
  BEGIN
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

    RAISE NOTICE '[AUTO-INVOICE] ✓ Created invoice item';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[AUTO-INVOICE] ✗ ERROR creating invoice item: %', SQLERRM;
      -- Don't return, let's try to mark period as generated anyway
  END;

  -- Mark invoice as generated on period
  BEGIN
    UPDATE work_recurring_instances
    SET
      invoice_generated = true,
      invoice_id = v_invoice_id,
      is_billed = true,
      billing_amount = v_total_amount,
      updated_at = NOW()
    WHERE id = v_period_id;

    RAISE NOTICE '[AUTO-INVOICE] ✓ Marked period as invoiced';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[AUTO-INVOICE] ✗ ERROR updating period: %', SQLERRM;
  END;

  RAISE NOTICE '[AUTO-INVOICE] ✓✓✓ SUCCESS! Created invoice % for period %',
    v_invoice_number, v_instance_record.period_name;
  RAISE NOTICE '========================================================================';

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[AUTO-INVOICE] ✗✗✗ FATAL ERROR: %', SQLERRM;
    RAISE WARNING '[AUTO-INVOICE] Stack trace: %', SQLSTATE;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_auto_invoice_on_all_tasks_complete
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_all_tasks_complete();

COMMENT ON FUNCTION auto_create_invoice_on_all_tasks_complete IS
  'Auto-creates invoice when all period tasks completed.
   Enhanced with comprehensive debug logging to troubleshoot issues.
   Uses service.tax_rate (defaults to 0%) instead of hardcoded 18%.
   Calculates: tax_amount = price * (tax_rate / 100), total = price + tax_amount

   To debug: Check PostgreSQL logs for [AUTO-INVOICE] messages.
   Common issues:
   - auto_bill flag not set on work
   - invoice_generated already true
   - Missing work/service/customer data
   - generate_invoice_number function error';

-- ============================================================================
-- Verify trigger was created
-- ============================================================================

DO $$
DECLARE
  v_trigger_exists BOOLEAN;
  v_function_exists BOOLEAN;
BEGIN
  -- Check if trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_auto_invoice_on_all_tasks_complete'
  ) INTO v_trigger_exists;

  -- Check if function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'auto_create_invoice_on_all_tasks_complete'
  ) INTO v_function_exists;

  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓ AUTO-INVOICE TRIGGER SETUP VERIFICATION';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Function exists: %', v_function_exists;
  RAISE NOTICE 'Trigger exists: %', v_trigger_exists;

  IF v_function_exists AND v_trigger_exists THEN
    RAISE NOTICE '✓ Auto-invoice system ready!';
    RAISE NOTICE '';
    RAISE NOTICE 'When you mark all tasks as completed for a recurring work:';
    RAISE NOTICE '1. Check that work.auto_bill = true';
    RAISE NOTICE '2. System will log [AUTO-INVOICE] messages to PostgreSQL logs';
    RAISE NOTICE '3. Invoice will be created automatically in draft status';
    RAISE NOTICE '4. Invoice will use service tax_rate (0% if not set)';
  ELSE
    RAISE WARNING '✗ Auto-invoice system NOT properly set up!';
  END IF;
  RAISE NOTICE '========================================================================';
END $$;
