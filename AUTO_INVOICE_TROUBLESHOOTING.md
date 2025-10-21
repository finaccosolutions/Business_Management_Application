# Auto-Invoice Troubleshooting Guide

## Overview
When all tasks in a recurring work period are marked as completed, the system should automatically generate an invoice (if auto-billing is enabled).

## Common Issues and Solutions

### 1. Invoice Not Being Created

#### Check 1: Verify Auto-Bill Flag
The work must have `auto_bill` enabled.

**SQL Check:**
```sql
SELECT id, customer_id, service_id, auto_bill, is_recurring
FROM works
WHERE id = '<your-work-id>';
```

**Expected:** `auto_bill = true`

**Fix:** Update the work:
```sql
UPDATE works
SET auto_bill = true
WHERE id = '<your-work-id>';
```

#### Check 2: Verify All Tasks Are Completed
All tasks for the period must have `status = 'completed'`.

**SQL Check:**
```sql
SELECT id, title, status, completed_at
FROM recurring_period_tasks
WHERE work_recurring_instance_id = '<period-id>'
ORDER BY sort_order;
```

**Expected:** All tasks show `status = 'completed'`

**Fix:** Mark remaining tasks as completed in the UI or via SQL:
```sql
UPDATE recurring_period_tasks
SET status = 'completed',
    completed_at = NOW(),
    completed_by = auth.uid()
WHERE work_recurring_instance_id = '<period-id>'
  AND status != 'completed';
```

#### Check 3: Verify Invoice Not Already Generated
The period instance should have `invoice_generated = false`.

**SQL Check:**
```sql
SELECT id, period_name, invoice_generated, invoice_id, is_billed
FROM work_recurring_instances
WHERE id = '<period-id>';
```

**Expected:** `invoice_generated = false` or `NULL`

**Fix:** If incorrectly marked, reset:
```sql
UPDATE work_recurring_instances
SET invoice_generated = false,
    invoice_id = NULL,
    is_billed = false
WHERE id = '<period-id>';
```

#### Check 4: View Auto-Invoice Logs
The trigger logs detailed information with `[AUTO-INVOICE]` prefix.

**PostgreSQL Logs Check:**
Look for messages like:
- `[AUTO-INVOICE] Task ... marked completed`
- `[AUTO-INVOICE] All tasks completed for period`
- `[AUTO-INVOICE] Auto-billing enabled, proceeding...`
- `[AUTO-INVOICE] ✓✓✓ SUCCESS! Created invoice ...`

**Common Error Messages:**
- `Auto-billing NOT enabled` → Set `auto_bill = true` on work
- `Invoice already exists` → Already created, check invoices table
- `Work record ... not found` → Data integrity issue
- `ERROR generating invoice number` → Check invoice numbering config

### 2. Invoice Created with Wrong Tax

#### Check Service Tax Rate
```sql
SELECT id, name, default_price, tax_rate
FROM services
WHERE id = '<service-id>';
```

The invoice will use the service's `tax_rate` field. If `NULL` or `0`, no tax is added.

**Fix:**
```sql
UPDATE services
SET tax_rate = 18.00  -- or your desired tax percentage
WHERE id = '<service-id>';
```

### 3. Manual Invoice Generation (Emergency)

If auto-invoice fails, you can manually generate an invoice:

**SQL Script:**
```sql
-- Get period and work details
WITH period_info AS (
  SELECT
    wri.id as period_id,
    wri.period_name,
    wri.work_id,
    w.user_id,
    w.customer_id,
    w.service_id,
    s.name as service_name,
    s.tax_rate,
    COALESCE(cs.price, s.default_price) as price
  FROM work_recurring_instances wri
  JOIN works w ON wri.work_id = w.id
  JOIN services s ON w.service_id = s.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE wri.id = '<period-id>'
)
-- Insert invoice (you need to manually generate invoice number)
INSERT INTO invoices (
  user_id, customer_id, work_id, work_recurring_instance_id,
  invoice_number, invoice_date, due_date,
  subtotal, tax_amount, total_amount,
  status, notes
)
SELECT
  user_id,
  customer_id,
  work_id,
  period_id,
  'INV-MANUAL-001', -- REPLACE with proper number
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  price,
  ROUND(price * (COALESCE(tax_rate, 0) / 100), 2),
  price + ROUND(price * (COALESCE(tax_rate, 0) / 100), 2),
  'draft',
  'Manually created for ' || period_name
FROM period_info;
```

### 4. Testing the Trigger

**Test Scenario:**
1. Create a recurring work with `auto_bill = true`
2. Create a period with tasks
3. Mark all tasks as completed one by one
4. When the last task is marked completed, invoice should auto-generate

**SQL Test:**
```sql
-- Mark last task as completed (this should trigger invoice creation)
UPDATE recurring_period_tasks
SET status = 'completed',
    updated_at = NOW()
WHERE id = '<last-task-id>';

-- Check if invoice was created
SELECT * FROM invoices
WHERE work_recurring_instance_id = '<period-id>';
```

## Debug Checklist

- [ ] Work has `auto_bill = true`
- [ ] All tasks for period have `status = 'completed'`
- [ ] Period has `invoice_generated = false`
- [ ] Service has valid `default_price`
- [ ] Service has `tax_rate` set (or 0 for no tax)
- [ ] User has valid invoice number configuration
- [ ] No errors in PostgreSQL logs with `[AUTO-INVOICE]` tag

## Getting Help

If invoice generation still fails:

1. Check PostgreSQL logs for `[AUTO-INVOICE]` messages
2. Verify all conditions in the checklist above
3. Try manually updating one task status to trigger the system
4. Check for database errors or constraint violations

## Recent Fixes (2025-10-21)

### Fixed: Hardcoded 18% Tax
- **Issue:** Auto-invoices always had 18% tax regardless of service settings
- **Fix:** Now uses `services.tax_rate` field (defaults to 0%)
- **Result:** If service has 0% tax, invoice total equals subtotal (no tax added)

### Enhanced: Debug Logging
- **Issue:** Hard to troubleshoot why invoices weren't generating
- **Fix:** Added comprehensive `[AUTO-INVOICE]` logging throughout the process
- **Result:** Can now see exactly why invoice generation succeeds or fails
