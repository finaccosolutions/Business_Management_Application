# Migration Instructions - Work Management System

## ⚠️ Important Notice
The Supabase `ap-south-1` region was temporarily unavailable during implementation. This document provides step-by-step instructions to apply the migration when the service is restored.

## 📋 Prerequisites
- Access to Supabase Dashboard
- Database connection established
- SQL Editor access

## 🚀 Migration Steps

### Step 1: Access Supabase Dashboard
1. Log in to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Verify you can execute queries

### Step 2: Run the Migration

#### Option A: Using SQL Editor (Recommended)
1. Open the file: `supabase/migrations/20251006_enhanced_work_and_invoice_automation.sql`
2. Copy the entire contents
3. In Supabase SQL Editor, paste the migration SQL
4. Click **Run** or press `Ctrl+Enter`
5. Wait for confirmation message
6. Check for any errors in the output

#### Option B: Using Supabase CLI (If Available)
```bash
# From project root
supabase db push

# OR apply specific migration
supabase migration up
```

### Step 3: Verify Migration

Run these verification queries in SQL Editor:

#### Check New Columns Added
```sql
-- Verify works table columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'works'
  AND column_name IN ('work_type', 'is_active', 'auto_bill');

-- Verify services table columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'services'
  AND column_name IN ('recurrence_day', 'auto_generate_work', 'payment_terms');

-- Verify work_recurring_instances table columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'work_recurring_instances'
  AND column_name IN ('invoice_id', 'billing_amount', 'is_billed');
```

#### Check Functions Created
```sql
-- List the new functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'auto_generate%';
```

Expected output:
- `auto_generate_work_invoice` (function)
- `auto_generate_recurring_period_invoice` (function)

#### Check Triggers Created
```sql
-- List the new triggers
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE 'trigger_auto_generate%';
```

Expected output:
- `trigger_auto_generate_work_invoice` on `works` table
- `trigger_auto_generate_recurring_period_invoice` on `work_recurring_instances` table

#### Check Indexes Created
```sql
-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('works', 'work_recurring_instances')
  AND indexname LIKE 'idx_%';
```

### Step 4: Test the System

#### Test 1: Regular Work Auto-Billing
```sql
-- 1. Create a test work
INSERT INTO works (
  user_id,
  customer_id,
  service_id,
  title,
  status,
  billing_amount,
  auto_bill
) VALUES (
  '<your-user-id>',
  '<test-customer-id>',
  '<test-service-id>',
  'Test Work for Auto-billing',
  'pending',
  1000.00,
  true
);

-- 2. Get the work ID
SELECT id, title, status, billing_status
FROM works
WHERE title = 'Test Work for Auto-billing';

-- 3. Mark it as completed (trigger should fire)
UPDATE works
SET status = 'completed'
WHERE title = 'Test Work for Auto-billing';

-- 4. Check if invoice was created
SELECT i.id, i.invoice_number, i.total_amount, i.status, w.title
FROM invoices i
JOIN works w ON i.customer_id = w.customer_id
WHERE w.title = 'Test Work for Auto-billing'
ORDER BY i.created_at DESC
LIMIT 1;

-- 5. Verify work billing status updated
SELECT billing_status
FROM works
WHERE title = 'Test Work for Auto-billing';
-- Expected: 'billed'
```

#### Test 2: Recurring Period Auto-Billing
```sql
-- 1. Create a recurring work
INSERT INTO works (
  user_id,
  customer_id,
  service_id,
  title,
  status,
  billing_amount,
  auto_bill,
  is_recurring,
  recurrence_pattern
) VALUES (
  '<your-user-id>',
  '<test-customer-id>',
  '<test-service-id>',
  'Test Recurring Work',
  'in_progress',
  2000.00,
  true,
  true,
  'monthly'
);

-- 2. Get the work ID
SELECT id FROM works WHERE title = 'Test Recurring Work';

-- 3. Add a test period
INSERT INTO work_recurring_instances (
  work_id,
  period_name,
  period_start_date,
  period_end_date,
  due_date,
  billing_amount,
  status
) VALUES (
  '<work-id-from-step-2>',
  'Test Period January 2025',
  '2025-01-01',
  '2025-01-31',
  '2025-02-10',
  2500.00,
  'pending'
);

-- 4. Mark period as completed (trigger should fire)
UPDATE work_recurring_instances
SET status = 'completed'
WHERE period_name = 'Test Period January 2025';

-- 5. Check if invoice was created and linked
SELECT
  wri.period_name,
  wri.is_billed,
  i.invoice_number,
  i.total_amount
FROM work_recurring_instances wri
LEFT JOIN invoices i ON wri.invoice_id = i.id
WHERE wri.period_name = 'Test Period January 2025';
-- Expected: is_billed = true, invoice details shown
```

### Step 5: Cleanup Test Data (Optional)
```sql
-- Remove test invoices
DELETE FROM invoice_items
WHERE invoice_id IN (
  SELECT i.id FROM invoices i
  JOIN works w ON i.customer_id = w.customer_id
  WHERE w.title IN ('Test Work for Auto-billing', 'Test Recurring Work')
);

DELETE FROM invoices
WHERE customer_id IN (
  SELECT customer_id FROM works
  WHERE title IN ('Test Work for Auto-billing', 'Test Recurring Work')
);

-- Remove test work
DELETE FROM work_recurring_instances
WHERE work_id IN (
  SELECT id FROM works
  WHERE title = 'Test Recurring Work'
);

DELETE FROM works
WHERE title IN ('Test Work for Auto-billing', 'Test Recurring Work');
```

## ✅ Verification Checklist

After running the migration, verify:

- [ ] All new columns exist in tables
- [ ] Both trigger functions created
- [ ] Both triggers attached to tables
- [ ] Indexes created successfully
- [ ] Test work auto-generates invoice
- [ ] Test recurring period auto-generates invoice
- [ ] Billing status updates correctly
- [ ] Invoice links to period correctly
- [ ] No errors in Supabase logs

## 🐛 Troubleshooting

### Issue: Migration fails with "column already exists"
**Solution**: This is safe to ignore if columns were added previously. The migration uses `IF NOT EXISTS` checks.

### Issue: Trigger doesn't fire
**Check**:
1. Trigger exists: `SELECT * FROM pg_trigger WHERE tgname LIKE 'trigger_auto_generate%';`
2. Function exists: `\df auto_generate*`
3. Function has correct permissions: `SECURITY DEFINER` set
4. Check logs for errors

### Issue: Invoice not generated
**Debug**:
```sql
-- Check work status
SELECT id, title, status, auto_bill, billing_amount, billing_status
FROM works
WHERE id = '<work-id>';

-- Check trigger fired (in Supabase logs)
-- Look for function execution logs
```

### Issue: Permission denied errors
**Solution**: Ensure RLS policies exist and are correct. The migration should handle this, but verify:
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('works', 'work_recurring_instances', 'invoices');

-- List policies
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('works', 'work_recurring_instances', 'invoices');
```

## 📞 Support

If you encounter issues:

1. **Check Supabase Status**: https://status.supabase.com
2. **Review Logs**: Supabase Dashboard → Logs
3. **Database Logs**: SQL Editor → Check error messages
4. **Migration File**: Review the migration SQL for any custom changes needed

## 📝 Post-Migration Tasks

After successful migration:

1. ✅ Update existing works to have default values:
```sql
UPDATE works
SET
  auto_bill = true,
  is_active = true,
  work_type = CASE WHEN is_recurring THEN 'recurring' ELSE 'regular' END
WHERE auto_bill IS NULL;
```

2. ✅ Update existing services with default payment terms:
```sql
UPDATE services
SET payment_terms = 'net_30'
WHERE payment_terms IS NULL;
```

3. ✅ Test with real data (create a work and complete it)

4. ✅ Train team on new features

5. ✅ Monitor for the first few days to ensure smooth operation

## 🎉 Success!

Once all verifications pass, the work management system with automatic invoice generation is ready to use!

Remember to:
- Review auto-generated invoices before sending
- Set up any customer-specific payment terms
- Configure services with appropriate default prices
- Enable auto-bill on works where appropriate

---

**Migration File**: `supabase/migrations/20251006_enhanced_work_and_invoice_automation.sql`
**Documentation**: See `WORK_MANAGEMENT_GUIDE.md` and `QUICK_REFERENCE.md`
