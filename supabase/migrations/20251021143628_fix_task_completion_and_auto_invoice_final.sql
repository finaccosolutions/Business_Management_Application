/*
  # Fix Task Completion and Auto-Invoice System - Complete Cleanup

  ## Changes Made
  1. **Remove Duplicate/Conflicting Triggers**
     - Drop multiple overlapping triggers on recurring_period_tasks
     - Keep only essential triggers for task status updates and invoice generation
  
  2. **Fix Column References**
     - All triggers now correctly use 'work_recurring_instance_id' (not 'recurring_period_id')
     - Fixed invoice lookup queries to use correct column names
  
  3. **Streamlined Auto-Invoice Logic**
     - Single, clean trigger that creates invoice when ALL tasks in a period are completed
     - Checks work.auto_bill flag before creating invoice
     - Prevents duplicate invoice creation with proper checks
     - Uses customer-specific price or service default price
  
  4. **Period Status Management**
     - Automatically updates period status based on task completion
     - Tracks total_tasks, completed_tasks, and all_tasks_completed flags
     - Sets completed_at timestamp when all tasks done
  
  ## How It Works
  When you mark a task as "completed":
  1. Task completion timestamp is recorded
  2. Period status is updated (pending → in_progress → completed)
  3. Task counts are recalculated
  4. If ALL tasks completed AND work.auto_bill=true → auto-create invoice
  5. Invoice uses customer_services.price or services.default_price
*/

-- ===========================================
-- STEP 1: Clean up all existing triggers
-- ===========================================

-- Drop all existing triggers on recurring_period_tasks
DROP TRIGGER IF EXISTS trigger_handle_period_task_update ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_update_period_status_on_task_change ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_track_due_date_override ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_create_invoice_on_all_tasks_completed ON recurring_period_tasks;
DROP TRIGGER IF EXISTS auto_create_invoice_on_period_complete_trigger ON recurring_period_tasks;

-- Drop old functions
DROP FUNCTION IF EXISTS handle_period_task_update() CASCADE;
DROP FUNCTION IF EXISTS check_and_update_period_status() CASCADE;
DROP FUNCTION IF EXISTS track_due_date_override() CASCADE;
DROP FUNCTION IF EXISTS create_invoice_on_period_task_completion() CASCADE;
DROP FUNCTION IF EXISTS auto_create_invoice_on_period_complete_v7() CASCADE;

-- ===========================================
-- STEP 2: Create clean, consolidated functions
-- ===========================================

-- Function 1: Update period status when tasks change
CREATE OR REPLACE FUNCTION update_period_status_on_task_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_id uuid;
  v_total_tasks INT;
  v_completed_tasks INT;
  v_all_completed BOOLEAN;
BEGIN
  -- Get period ID from NEW or OLD record
  v_period_id := COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);
  
  IF v_period_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- If this is an UPDATE and status changed to completed, set completion timestamp
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;

  -- Count tasks for this period
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_tasks, v_completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = v_period_id;

  v_all_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

  -- Update the period instance with current status
  UPDATE work_recurring_instances
  SET
    total_tasks = v_total_tasks,
    completed_tasks = v_completed_tasks,
    all_tasks_completed = v_all_completed,
    status = CASE
      WHEN v_all_completed THEN 'completed'
      WHEN v_completed_tasks > 0 THEN 'in_progress'
      ELSE 'pending'
    END,
    completed_at = CASE
      WHEN v_all_completed AND completed_at IS NULL THEN NOW()
      WHEN NOT v_all_completed THEN NULL
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = v_period_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Function 2: Auto-create invoice when all tasks completed
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

  -- Generate invoice number
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

-- Function 3: Track due date overrides
CREATE OR REPLACE FUNCTION track_task_due_date_override()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If due_date changed during UPDATE
  IF TG_OP = 'UPDATE' AND OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    NEW.is_overridden := true;
    NEW.due_date_override := NEW.due_date;
    NEW.updated_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- ===========================================
-- STEP 3: Create triggers in correct order
-- ===========================================

-- Trigger 1: Track due date overrides (runs first)
CREATE TRIGGER trigger_track_task_due_date_override
  BEFORE UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION track_task_due_date_override();

-- Trigger 2: Update period status (runs after row changes)
CREATE TRIGGER trigger_update_period_status
  AFTER INSERT OR UPDATE OR DELETE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_period_status_on_task_change();

-- Trigger 3: Auto-create invoice when all tasks complete (runs last)
CREATE TRIGGER trigger_auto_invoice_on_all_tasks_complete
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_all_tasks_complete();

-- ===========================================
-- STEP 4: Ensure invoice column exists
-- ===========================================

-- Add work_recurring_instance_id to invoices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'work_recurring_instance_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN work_recurring_instance_id uuid REFERENCES work_recurring_instances(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_work_recurring_instance ON invoices(work_recurring_instance_id);
  END IF;
END $$;

-- ===========================================
-- STEP 5: Fix any existing data inconsistencies
-- ===========================================

-- Recalculate task counts for all periods
UPDATE work_recurring_instances wri
SET
  total_tasks = counts.total,
  completed_tasks = counts.completed,
  all_tasks_completed = (counts.total > 0 AND counts.total = counts.completed),
  status = CASE
    WHEN counts.total > 0 AND counts.total = counts.completed THEN 'completed'
    WHEN counts.completed > 0 THEN 'in_progress'
    ELSE 'pending'
  END
FROM (
  SELECT
    work_recurring_instance_id,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'completed') as completed
  FROM recurring_period_tasks
  GROUP BY work_recurring_instance_id
) counts
WHERE wri.id = counts.work_recurring_instance_id;
