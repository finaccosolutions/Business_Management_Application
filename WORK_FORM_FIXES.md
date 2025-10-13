# Work Creation Form Fixes

## Issues Resolved

### 1. Duplicate Key Constraint Error
**Problem:** When creating recurring works, the system threw an error:
```
Error: duplicate key value violates unique constraint "work_recurring_period_documen_work_recurring_instance_id_wo_key"
```

**Root Cause:**
- The database has a trigger `auto_create_period_documents_trigger` that fires when recurring periods are inserted
- When creating a new work with multiple recurring periods (batch insert), the trigger tried to create period documents
- The UNIQUE constraint on `(work_recurring_instance_id, work_document_id)` caused failures when multiple periods tried to reference the same documents

**Fix:**
- Updated the trigger function to use `ON CONFLICT DO NOTHING` in the INSERT statement
- This safely handles duplicate attempts and cases where no documents exist yet
- Migration file: `supabase/migrations/20251013_fix_period_documents_trigger.sql`

### 2. Form Field Requirements
**Problem:**
- Due date was required for all works (including recurring)
- Start date wasn't properly marked as required for recurring works
- Field requirements weren't clear to users

**Fix:**
- **Non-recurring works:** Due date is now REQUIRED, start date is optional
- **Recurring works:** Start date is now REQUIRED, due date is hidden (not applicable)
- Added visual hints showing which fields are required for each work type

### 3. Poor Form Layout
**Problem:**
- Fields were scattered without logical grouping
- Hard to navigate and understand the form
- No clear distinction between work types

**Fix:**
Reorganized form into logical sections:
1. **Recurring Toggle** (at top) - Clear checkbox to indicate work type
2. **Basic Information** - Customer, Service, Title, Description
3. **Work Details** - Status, Priority, Assignment, Location, Department
4. **Schedule** - Smart section that shows different fields based on work type
5. **Billing Information** - Billing status and amount
6. **Additional Details** - Requirements and deliverables
7. **Auto-billing Settings** - Invoice automation toggle
8. **Recurring Work Settings** - Only shown for recurring works

### 4. Conditional Field Visibility
**Problem:**
- All fields were always visible regardless of work type
- Confusing for users to know which fields apply to their work type

**Fix:**
- Added smart conditional rendering based on `formData.is_recurring`
- Recurring works show: Start Date (required), Recurrence Pattern, Recurrence Day
- Non-recurring works show: Start Date (optional), Due Date (required)
- Recurring settings section only appears when checkbox is checked

## Changes Made

### Files Modified
1. **src/pages/Works.tsx**
   - Reorganized form layout with clear sections
   - Added conditional field visibility
   - Moved recurring toggle to top for better UX
   - Added field requirement indicators
   - Improved form validation

### Files Created
1. **supabase/migrations/20251013_fix_period_documents_trigger.sql**
   - Fixed the database trigger to prevent duplicate key errors
   - Added ON CONFLICT handling

## How to Apply

### Database Migration
The migration file needs to be applied to your Supabase database:
```bash
# This will be applied automatically when you run your migrations
```

### Testing
1. **Test Non-Recurring Work:**
   - Uncheck "This is a recurring work"
   - Fill in Customer, Service, Title
   - Enter Due Date (required)
   - Submit - should work without errors

2. **Test Recurring Work:**
   - Check "This is a recurring work"
   - Fill in Customer, Service, Title
   - Enter Start Date (required)
   - Set Recurrence Pattern and Day
   - Submit - should work without duplicate key errors

## Benefits
- Clear, organized form layout
- Better user experience with grouped fields
- Proper validation for each work type
- No more duplicate key errors for recurring works
- Intuitive field visibility based on work type
