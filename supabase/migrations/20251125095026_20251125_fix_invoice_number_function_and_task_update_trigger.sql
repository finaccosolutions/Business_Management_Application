/*
  # Fix Invoice Number Function Calls and Task Update Triggers

  1. Issues Fixed
    - `auto_create_invoice_on_recurring_tasks_complete` was calling non-existent `generate_invoice_number_from_config()`
    - `auto_create_invoice_on_work_tasks_complete` was calling non-existent `generate_invoice_number_from_config()`
    - Replace with correct function name `generate_next_invoice_number()`
    - Drop dependent triggers to allow function recreation

  2. Functions Updated
    - `auto_create_invoice_on_recurring_tasks_complete`
    - `auto_create_invoice_on_work_tasks_complete`

  3. Security
    - Maintain existing SECURITY DEFINER setting
    - Preserve all existing error handling
*/

-- Drop dependent triggers first
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_recurring_tasks_complete ON recurring_period_tasks;
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_work_tasks_complete ON work_tasks;

-- Drop and recreate auto_create_invoice_on_recurring_tasks_complete with correct function name
DROP FUNCTION IF EXISTS public.auto_create_invoice_on_recurring_tasks_complete();

CREATE FUNCTION public.auto_create_invoice_on_recurring_tasks_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
v_income_ledger_id uuid;
v_customer_ledger_id uuid;
BEGIN
-- Only trigger on UPDATE when status changes to completed
IF TG_OP != 'UPDATE' THEN
RETURN NEW;
END IF;

IF NEW.status != 'completed' THEN
RETURN NEW;
END IF;

IF OLD.status = 'completed' THEN
RETURN NEW;
END IF;

v_period_id := NEW.work_recurring_instance_id;

-- Get period details first
SELECT * INTO v_instance_record
FROM work_recurring_instances
WHERE id = v_period_id;

IF NOT FOUND THEN
RETURN NEW;
END IF;

-- If invoice already generated, skip
IF v_instance_record.invoice_generated = true THEN
RETURN NEW;
END IF;

-- Check if ALL tasks for this period are completed
SELECT
COUNT(*),
COUNT(*) FILTER (WHERE status = 'completed')
INTO v_task_count, v_completed_count
FROM recurring_period_tasks
WHERE work_recurring_instance_id = v_period_id;

v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

-- If not all tasks completed, just return
IF NOT v_all_completed THEN
RETURN NEW;
END IF;

-- Update period status to completed
UPDATE work_recurring_instances
SET status = 'completed', updated_at = NOW()
WHERE id = v_period_id AND status != 'completed';

-- Get work and service details
SELECT
w.*,
s.name as service_name,
s.default_price,
s.income_account_id as service_income_account_id,
COALESCE(s.tax_rate, 0) as service_tax_rate,
c.name as customer_name,
c.account_id as customer_account_id,
cs.price as customer_service_price
INTO v_work_record
FROM works w
JOIN services s ON w.service_id = s.id
JOIN customers c ON w.customer_id = c.id
LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
WHERE w.id = v_instance_record.work_id;

IF NOT FOUND THEN
RETURN NEW;
END IF;

-- Check auto_bill flag (treat NULL as true)
IF COALESCE(v_work_record.auto_bill, true) = false THEN
RETURN NEW;
END IF;

-- Get ledger mappings - prioritize service level mapping
v_income_ledger_id := v_work_record.service_income_account_id;

IF v_income_ledger_id IS NULL THEN
SELECT default_income_ledger_id INTO v_income_ledger_id
FROM company_settings
WHERE user_id = v_work_record.user_id;
END IF;

-- Ensure customer ledger exists and get/create account_id
v_customer_ledger_id := ensure_customer_ledger_exists(v_work_record.customer_id, v_work_record.user_id);

-- Calculate price
v_price := COALESCE(
v_instance_record.billing_amount,
v_work_record.billing_amount,
v_work_record.customer_service_price,
v_work_record.default_price,
0
);

IF v_price <= 0 THEN
RETURN NEW;
END IF;

-- Calculate tax
v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
v_total_amount := v_price + v_tax_amount;

-- Generate invoice number using correct function name
SELECT generate_next_invoice_number(v_work_record.user_id) INTO v_invoice_number;

IF v_invoice_number IS NULL THEN
RAISE WARNING 'Failed to generate invoice number for user %', v_work_record.user_id;
RETURN NEW;
END IF;

-- Create invoice
BEGIN
INSERT INTO invoices (
user_id, customer_id, work_id, work_recurring_instance_id,
invoice_number, invoice_date, due_date,
subtotal, tax_amount, total_amount, status, notes,
income_account_id, customer_account_id
)
VALUES (
v_work_record.user_id, v_work_record.customer_id, v_instance_record.work_id, v_period_id,
v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
v_price, v_tax_amount, v_total_amount, 'draft',
'Auto-generated for ' || v_instance_record.period_name,
v_income_ledger_id, v_customer_ledger_id
)
RETURNING id INTO v_invoice_id;

-- Add invoice item with service_id
INSERT INTO invoice_items (
invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
)
VALUES (
v_invoice_id,
v_work_record.service_name || ' - ' || v_instance_record.period_name,
1, v_price, v_price, v_tax_rate, v_work_record.service_id
);

-- Mark invoice generation successful
UPDATE work_recurring_instances
SET
invoice_generated = true,
invoice_id = v_invoice_id,
is_billed = true,
billing_amount = v_total_amount,
updated_at = NOW()
WHERE id = v_period_id;

EXCEPTION WHEN OTHERS THEN
RAISE WARNING 'Error creating invoice for period %: %', v_period_id, SQLERRM;
END;

RETURN NEW;
END;
$function$;

-- Drop and recreate auto_create_invoice_on_work_tasks_complete with correct function name
DROP FUNCTION IF EXISTS public.auto_create_invoice_on_work_tasks_complete();

CREATE FUNCTION public.auto_create_invoice_on_work_tasks_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
v_income_ledger_id uuid;
v_customer_ledger_id uuid;
BEGIN
-- Only trigger on UPDATE when status changes to completed
IF TG_OP != 'UPDATE' THEN
RETURN NEW;
END IF;

IF NEW.status != 'completed' THEN
RETURN NEW;
END IF;

IF OLD.status = 'completed' THEN
RETURN NEW;
END IF;

v_work_id := NEW.work_id;

-- Get work details first
SELECT
w.*,
s.name as service_name,
s.default_price,
s.income_account_id as service_income_account_id,
COALESCE(s.tax_rate, 0) as service_tax_rate,
c.name as customer_name,
c.account_id as customer_account_id,
cs.price as customer_service_price
INTO v_work_record
FROM works w
JOIN services s ON w.service_id = s.id
JOIN customers c ON w.customer_id = c.id
LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
WHERE w.id = v_work_id;

IF NOT FOUND THEN
RETURN NEW;
END IF;

-- Only for non-recurring works
IF v_work_record.is_recurring = true THEN
RETURN NEW;
END IF;

-- Check auto_bill flag (treat NULL as true)
IF COALESCE(v_work_record.auto_bill, true) = false THEN
RETURN NEW;
END IF;

-- Check if already billed
IF v_work_record.billing_status = 'billed' THEN
RETURN NEW;
END IF;

-- Check if ALL tasks are completed
SELECT
COUNT(*),
COUNT(*) FILTER (WHERE status = 'completed')
INTO v_task_count, v_completed_count
FROM work_tasks
WHERE work_id = v_work_id;

v_all_completed := (v_task_count > 0 AND v_task_count = v_completed_count);

-- If not all tasks completed, just return
IF NOT v_all_completed THEN
RETURN NEW;
END IF;

-- Update work status to completed
UPDATE works
SET status = 'completed', updated_at = NOW()
WHERE id = v_work_id AND status != 'completed';

-- Get ledger mappings - prioritize service level mapping
v_income_ledger_id := v_work_record.service_income_account_id;

IF v_income_ledger_id IS NULL THEN
SELECT default_income_ledger_id INTO v_income_ledger_id
FROM company_settings
WHERE user_id = v_work_record.user_id;
END IF;

-- Ensure customer ledger exists and get/create account_id
v_customer_ledger_id := ensure_customer_ledger_exists(v_work_record.customer_id, v_work_record.user_id);

-- Calculate price
v_price := COALESCE(
v_work_record.billing_amount,
v_work_record.customer_service_price,
v_work_record.default_price,
0
);

IF v_price <= 0 THEN
RETURN NEW;
END IF;

-- Calculate tax
v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);
v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
v_total_amount := v_price + v_tax_amount;

-- Generate invoice number using correct function name
SELECT generate_next_invoice_number(v_work_record.user_id) INTO v_invoice_number;

IF v_invoice_number IS NULL THEN
RAISE WARNING 'Failed to generate invoice number for user %', v_work_record.user_id;
RETURN NEW;
END IF;

-- Create invoice
BEGIN
INSERT INTO invoices (
user_id, customer_id, work_id,
invoice_number, invoice_date, due_date,
subtotal, tax_amount, total_amount, status, notes,
income_account_id, customer_account_id
)
VALUES (
v_work_record.user_id, v_work_record.customer_id, v_work_id,
v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
v_price, v_tax_amount, v_total_amount, 'draft',
'Auto-generated for work: ' || v_work_record.title,
v_income_ledger_id, v_customer_ledger_id
)
RETURNING id INTO v_invoice_id;

-- Add invoice item with service_id
INSERT INTO invoice_items (
invoice_id, description, quantity, unit_price, amount, tax_rate, service_id
)
VALUES (
v_invoice_id,
v_work_record.service_name || ' - ' || v_work_record.title,
1, v_price, v_price, v_tax_rate, v_work_record.service_id
);

-- Update work billing status
UPDATE works
SET billing_status = 'billed', updated_at = NOW()
WHERE id = v_work_id;

EXCEPTION WHEN OTHERS THEN
RAISE WARNING 'Error creating invoice for work %: %', v_work_id, SQLERRM;
END;

RETURN NEW;
END;
$function$;

-- Recreate the triggers
CREATE TRIGGER trigger_auto_invoice_on_recurring_tasks_complete
AFTER UPDATE ON recurring_period_tasks
FOR EACH ROW
EXECUTE FUNCTION auto_create_invoice_on_recurring_tasks_complete();

CREATE TRIGGER trigger_auto_invoice_on_work_tasks_complete
AFTER UPDATE ON work_tasks
FOR EACH ROW
EXECUTE FUNCTION auto_create_invoice_on_work_tasks_complete();