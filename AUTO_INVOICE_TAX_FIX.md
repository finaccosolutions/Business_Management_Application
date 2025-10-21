# Auto-Invoice Tax Rate Fix

## Problem Identified

When creating non-recurring work and marking it as completed, the auto-generated invoice was showing **18% tax** instead of the actual service tax rate (which was 0% in your case). This resulted in:

- Invoice showing: Subtotal = 1000, Tax = 180 (18%), Total = 1180
- Expected: Subtotal = 1000, Tax = 0 (0%), Total = 1000
- Ledger also posted the incorrect amount (1180)

## Root Cause

The `create_invoice_for_non_recurring_work_v2()` function had **hardcoded 18% tax** in three places:

1. Line 212: `tax_amount = v_price * 0.18` (hardcoded 18%)
2. Line 213: `total_amount = v_price * 1.18` (hardcoded 18%)
3. Line 234: `tax_rate = 18.00` (hardcoded 18%)

This function runs **when a work is created** (AFTER INSERT on works table), not when tasks are completed.

## Fix Applied

### Migration 1: `20251021200000_fix_auto_invoice_hardcoded_tax_rate`
Fixed the `create_invoice_for_non_recurring_work_v2()` function to:
- Retrieve actual tax_rate from the service table
- Use `COALESCE(s.tax_rate, 0)` to default to 0% if NULL
- Calculate tax_amount = price × (tax_rate / 100)
- Calculate total_amount = price + tax_amount
- Store the actual tax_rate in invoice_items

### Migration 2: `20251021200001_fix_recurring_invoice_hardcoded_tax_rate`
Fixed the `auto_create_invoice_on_period_complete_v7()` function (for recurring work) with the same logic.

## How It Works Now

### Invoice Creation Triggers

There are **two scenarios** where invoices are auto-created:

#### 1. Work Creation (Immediate)
- **Trigger**: `create_invoice_for_non_recurring_work_trigger` on works table
- **Function**: `create_invoice_for_non_recurring_work_v2()`
- **When**: Runs AFTER INSERT on works table
- **Condition**: Only if work.auto_bill = true AND work.is_recurring = false
- **Tax**: Uses service.tax_rate ✓ (NOW FIXED)

#### 2. Task Completion (Later)
- **Trigger**: `trigger_auto_invoice_on_work_tasks_complete` on work_tasks table
- **Function**: `auto_create_invoice_on_work_tasks_complete()`
- **When**: Runs when ALL tasks are marked as completed
- **Condition**: Only if work.auto_bill = true AND work.is_recurring = false
- **Tax**: Uses service.tax_rate ✓ (ALREADY CORRECT)

### Tax Calculation Examples

Now both functions correctly calculate tax based on service settings:

- **Service tax_rate = 0%**: Invoice shows subtotal=1000, tax=0, total=1000
- **Service tax_rate = 5%**: Invoice shows subtotal=1000, tax=50, total=1050
- **Service tax_rate = 18%**: Invoice shows subtotal=1000, tax=180, total=1180

## Fixing Existing Incorrect Invoices

If you have invoices that were created with the wrong tax rate:

### Option 1: Delete and Recreate (Recommended)
1. Go to the invoice that has wrong tax
2. Delete the invoice (this will also delete related ledger entries)
3. The next time you create a similar work, it will use the correct tax rate

### Option 2: Manual Edit
1. Go to Invoices page
2. Click Edit on the invoice with wrong tax
3. Update the invoice items to show correct tax rate
4. The ledger entries will be automatically updated

## Verification

To verify the fix is working:

1. **Create a new non-recurring work** with auto_bill = true
2. **Check the service tax_rate** (should be 0% or whatever you set)
3. **Invoice should be auto-created immediately** with correct tax
4. **Verify in ledger** that the posted amount matches the invoice total

OR

1. **Complete all tasks** for a non-recurring work (if invoice wasn't created yet)
2. **Invoice should be auto-created** when last task is completed
3. **Verify tax matches service tax_rate**

## Technical Notes

- Both invoice creation functions now use identical tax calculation logic
- Tax is always stored in invoice_items even if 0%
- Ledger posting happens automatically when invoice status changes to 'sent' or 'paid'
- The function `create_invoice_for_non_recurring_work_v2()` creates invoice on work creation
- The function `auto_create_invoice_on_work_tasks_complete()` creates invoice on task completion
- Only ONE invoice is created (whichever trigger fires first based on your workflow)
