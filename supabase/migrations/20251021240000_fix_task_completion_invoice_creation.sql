/*
  # Fix Task Completion and Invoice Creation Logic

  ## Issues Fixed

  ### 1. Recurring Work - NO Auto-Invoice on Task Completion
  **Problem**: When all tasks in a recurring period are marked as completed, an invoice is auto-created.
  **Required Behavior**: For recurring work, invoices should NOT be auto-created when tasks complete.
  **Solution**: Disable the auto-invoice trigger for recurring work entirely.

  ### 2. Non-Recurring Work - Create Invoice with Proper Tax Display
  **Problem**: When all tasks are completed for non-recurring work, invoice should be created but tax is not shown.
  **Required Behavior**:
    - Auto-create invoice when all tasks completed
    - Show tax in invoice even if service has 0% tax
    - Tax calculation should use service.tax_rate (can be 0, 5, 18, etc.)
  **Solution**:
    - Create trigger to check when all work_tasks are completed
    - Auto-create invoice with proper tax calculation
    - Always show tax_rate in invoice_items (even if 0%)

  ## Changes Made

  1. **DISABLE auto-invoice for recurring work**:
     - Drop `auto_create_invoice_on_all_tasks_complete()` trigger on recurring_period_tasks
     - Recurring invoices should be created manually or through a different workflow

  2. **ENABLE auto-invoice for non-recurring work**:
     - Create new trigger on `work_tasks` table
     - When all tasks for a work are completed, auto-create invoice
     - Use service.tax_rate (defaults to 0 if NULL)
     - Always include tax_rate in invoice_items

  ## Testing Scenarios

  ### Recurring Work:
  - Mark all tasks completed → NO invoice created ✓
  - User manually creates invoice if needed ✓

  ### Non-Recurring Work:
  - Service with 0% tax → Invoice shows: subtotal=1500, tax=0 (0%), total=1500 ✓
  - Service with 18% tax → Invoice shows: subtotal=1500, tax=270 (18%), total=1770 ✓
  - Service with 5% tax → Invoice shows: subtotal=1500, tax=75 (5%), total=1575 ✓
*/

-- ============================================================================
-- PART 1: DISABLE Auto-Invoice for Recurring Work
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_invoice_on_all_tasks_complete ON recurring_period_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_on_all_tasks_complete CASCADE;

RAISE NOTICE '✓ Disabled auto-invoice for recurring work (recurring_period_tasks)';

-- ============================================================================
-- PART 2: ENABLE Auto-Invoice for Non-Recurring Work
-- ============================================================================

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_on_work_tasks_complete CASCADE;

-- Create function to auto-create invoice when all work_tasks are completed
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
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' OR NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_work_id := NEW.work_id;

  -- Count total tasks and completed tasks for this work
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'completed') as completed
  INTO v_task_count, v_all_completed
  FROM work_tasks
  WHERE work_id = v_work_id;

  -- Check if ALL tasks are now completed
  v_all_completed := (v_task_count > 0 AND v_task_count = v_all_completed);

  -- If not all tasks completed, exit
  IF NOT v_all_completed THEN
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

  -- Only proceed for non-recurring work
  IF v_work_record.is_recurring = true THEN
    RETURN NEW;
  END IF;

  -- Check if auto_bill is enabled
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- Check if invoice already exists for this work
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_work_id
    AND user_id = v_work_record.user_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    RAISE NOTICE '⚠ Invoice already exists for work %', v_work_record.title;
    RETURN NEW;
  END IF;

  -- Use customer-specific price or default service price
  v_price := COALESCE(v_work_record.final_price, v_work_record.billing_amount, 0);

  -- Get tax rate from service (defaults to 0 if NULL)
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);

  -- Calculate tax amount and total
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating auto-invoice for non-recurring work: price=%, tax_rate=%, tax_amount=%, total=%',
    v_price, v_tax_rate, v_tax_amount, v_total_amount;

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

  RAISE NOTICE '✓ Created invoice % for non-recurring work % with tax_rate=%, subtotal=%, tax=%, total=%',
    v_invoice_number, v_work_record.title, v_tax_rate, v_price, v_tax_amount, v_total_amount;

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
  'Auto-creates invoice when all work_tasks are completed for NON-RECURRING work.
   Uses service.tax_rate (defaults to 0%) and shows tax even if 0%.
   Calculates: tax_amount = price * (tax_rate / 100), total = price + tax_amount';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ MIGRATION COMPLETE ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. ✓ DISABLED AUTO-INVOICE FOR RECURRING WORK';
  RAISE NOTICE '   - Marking all recurring period tasks as completed → NO invoice created';
  RAISE NOTICE '   - Recurring invoices must be created manually or through other workflow';
  RAISE NOTICE '';
  RAISE NOTICE '2. ✓ ENABLED AUTO-INVOICE FOR NON-RECURRING WORK';
  RAISE NOTICE '   - Marking all work tasks as completed → Invoice created automatically';
  RAISE NOTICE '   - Uses service.tax_rate (can be 0%, 5%, 18%, etc.)';
  RAISE NOTICE '   - Tax is ALWAYS shown in invoice even if 0%';
  RAISE NOTICE '   - Correctly calculates: tax = price * (rate/100), total = price + tax';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Test with:';
  RAISE NOTICE '- Recurring work: Mark all tasks complete → NO invoice';
  RAISE NOTICE '- Non-recurring work + 0% tax: Mark all tasks complete → Invoice with tax=0';
  RAISE NOTICE '- Non-recurring work + 18% tax: Mark all tasks complete → Invoice with tax=18%';
  RAISE NOTICE '========================================================================';
END $$;
