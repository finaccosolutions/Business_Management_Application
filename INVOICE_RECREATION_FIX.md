# Invoice Auto-Creation and Re-creation Fix

## Problems Fixed

### 1. Invoice Not Re-created After Deletion
**Problem:**
- When all tasks were completed, an invoice was auto-created
- If you deleted the invoice and changed task status back to pending
- Then completed the tasks again, NO invoice was created

**Root Cause:**
- When invoice was deleted, `work.billing_status` remained as `'billed'`
- The auto-invoice trigger checks `billing_status = 'billed'` and skips invoice creation
- Result: Invoice could never be re-created

**Solution:**
- Added a new trigger `trigger_reset_billing_on_invoice_deletion`
- When an invoice is deleted, the trigger automatically resets:
  - `work.billing_status` to `'pending'` (for non-recurring work)
  - `invoice_generated` flag to `false` (for recurring work)
- Now when tasks are completed again, the auto-invoice trigger will create a new invoice

### 2. Hidden Status and Billing Status Fields
**Problem:**
- When creating a new work, the Status and Billing Status fields were visible
- These fields are not relevant during work creation
- They are managed automatically by the system based on task completion

**Solution:**
- Modified `Works.tsx` to hide these fields when creating a new work
- Fields only show when editing an existing work (`editingWork` is true)
- This simplifies the work creation form and prevents confusion

## How It Works Now

### Complete Workflow for Non-Recurring Work

1. **Create Work:**
   - Work created with `status = 'pending'` and `billing_status = 'pending'`
   - Status and Billing Status fields are hidden in the create form

2. **Complete Tasks:**
   - When ALL tasks are marked as completed
   - Auto-invoice trigger runs
   - Invoice is created with status `'draft'`
   - `work.billing_status` is set to `'billed'`

3. **Delete Invoice (if needed):**
   - When invoice is deleted
   - Trigger automatically resets `work.billing_status` to `'pending'`

4. **Change Tasks Back to Pending (optional):**
   - If you change tasks from completed to pending
   - Another trigger resets `billing_status` to `'pending'`

5. **Complete Tasks Again:**
   - When ALL tasks are completed again
   - Auto-invoice trigger runs again
   - New invoice is created successfully

### Complete Workflow for Recurring Work

1. **Create Recurring Work:**
   - Work created with recurring periods generated automatically

2. **Complete Period Tasks:**
   - When ALL tasks in a period are marked as completed
   - Auto-invoice trigger runs
   - Invoice is created for that period
   - `invoice_generated` flag set to `true` for the period

3. **Delete Invoice (if needed):**
   - When invoice is deleted
   - Trigger automatically resets `invoice_generated` to `false`

4. **Complete Tasks Again:**
   - When ALL tasks are completed again
   - New invoice is created successfully

## Technical Details

### Database Changes

**Migration:** `20251022030000_fix_invoice_deletion_and_recreation.sql`

**New Function:**
```sql
reset_billing_status_on_invoice_deletion()
```
- Runs BEFORE DELETE on invoices table
- Resets billing status for non-recurring work
- Resets invoice_generated flag for recurring work

**New Trigger:**
```sql
trigger_reset_billing_on_invoice_deletion
```
- Attached to `invoices` table
- Executes on DELETE operation

### Frontend Changes

**File:** `src/pages/Works.tsx`

**Changes:**
1. Status field now only visible when `editingWork` is true
2. Billing Status field now only visible when `editingWork` is true
3. Form layout adjusted to handle conditional rendering

## Testing

### Test Case 1: Non-Recurring Work Invoice Re-creation
1. Create a non-recurring work with tasks
2. Complete all tasks → Invoice created
3. Delete the invoice
4. Verify `billing_status` reset to `'pending'`
5. Complete all tasks again → New invoice created ✓

### Test Case 2: Recurring Work Invoice Re-creation
1. Create a recurring work with periods
2. Complete all tasks in a period → Invoice created
3. Delete the invoice
4. Verify `invoice_generated` reset to `false`
5. Complete all tasks again → New invoice created ✓

### Test Case 3: Work Creation Form
1. Click "Add New Work"
2. Verify Status field is NOT visible
3. Verify Billing Status field is NOT visible
4. Edit an existing work
5. Verify Status field IS visible
6. Verify Billing Status field IS visible ✓

## Benefits

1. **Flexible Invoice Management:**
   - Can delete incorrect invoices without breaking auto-creation
   - Can re-generate invoices by completing tasks again

2. **Cleaner UI:**
   - Work creation form is simpler and less confusing
   - Only relevant fields are shown

3. **Automatic Status Management:**
   - System automatically manages billing status
   - No manual intervention needed

4. **Data Integrity:**
   - Billing status stays in sync with invoice existence
   - No orphaned states or stuck workflows

## Migration Applied

The migration has been successfully applied to the database. All existing works and invoices will continue to function normally, and new invoices will follow the updated workflow.
