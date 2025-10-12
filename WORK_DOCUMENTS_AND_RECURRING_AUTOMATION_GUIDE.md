# Work Documents & Recurring Period Automation - Implementation Guide

## Overview
This document describes the implementation of the Documents tab in Work Details page and the enhanced recurring period automation system.

## Features Implemented

### 1. Documents Tab in Work Details

#### Document Management Features
- **Document List Display**: View all documents associated with a work, organized by required/optional
- **Document Collection Tracking**: Mark documents as collected with timestamp
- **File Upload Support**: Upload document files (UI ready, storage integration pending)
- **Download Files**: Download uploaded documents
- **Edit Documents**: Modify document details
- **Delete Documents**: Remove documents from work
- **Visual Status Indicators**:
  - Required vs Optional badges
  - Collected status with green highlighting
  - Uploaded status with file information
  - Overdue warnings for uncollected required documents

#### Document Statistics
The tab displays three key metrics:
- **Total Documents**: Count of all documents
- **Collected**: Count of collected documents (with required document breakdown)
- **Uploaded**: Count of documents with uploaded files

#### Document Fields
Each document tracks:
- `name`: Document name
- `description`: Optional description
- `category`: Document category for organization
- `is_required`: Whether the document is mandatory
- `is_collected`: Collection status
- `file_url`: URL to uploaded file
- `file_type`: MIME type of uploaded file
- `file_size`: Size of uploaded file in bytes
- `collected_at`: Timestamp when marked as collected
- `uploaded_at`: Timestamp when file was uploaded
- `sort_order`: Display order

#### Auto-Copy from Service Documents
When a work is created for a service:
- Service documents are automatically copied to work documents
- This ensures all required documents are tracked for each work instance
- Documents can then be managed independently per work

### 2. Recurring Period Automation

#### Automatic Period Creation
**When Creating Recurring Work:**
- First period is automatically created when work is saved
- Period name, start date, end date calculated based on recurrence pattern
- Due date set according to recurrence_day field

**Automatic Next Period Generation:**
When a period's due date elapses:
- System automatically creates the next period
- Calculates correct due date based on pattern:
  - Monthly: Day X of next month
  - Quarterly: Day X of next quarter
  - Half-yearly: Day X of next half-year
  - Yearly: Day X of next year

#### Auto-Billing on Period Completion
When a recurring period is marked as "completed":
- Checks if work has `auto_bill` enabled
- Automatically generates an invoice if conditions are met
- Uses period's `billing_amount` or falls back to work's `billing_amount`
- Applies tax rate from service configuration
- Calculates due date based on service payment terms
- Marks period as `is_billed` and links to invoice
- Creates invoice with detailed line item

#### Period Lifecycle
1. **Pending**: Period is created and waiting to be worked on
2. **In Progress**: Work has started on this period
3. **Completed**: Period work is finished
   - If auto_bill enabled → Invoice generated automatically
   - completed_at timestamp recorded
   - completed_by staff member tracked
4. **Next Period Created**: When due date elapses, next period auto-created

## Database Triggers

### 1. `trigger_create_initial_recurring_period`
- Fires: AFTER INSERT on works table
- Purpose: Creates the first period when a recurring work is created
- Action: Automatically inserts first period with calculated dates

### 2. `trigger_auto_generate_recurring_period_invoice`
- Fires: BEFORE UPDATE on work_recurring_instances table
- Purpose: Auto-generates invoice when period is completed
- Conditions:
  - Status changed to 'completed'
  - Not already billed
  - Work has auto_bill enabled
  - Billing amount is set
- Action: Creates invoice and invoice items, updates period with invoice_id

### 3. `create_next_recurring_period_if_needed()` Function
- Type: Manual/Scheduled function
- Purpose: Creates next periods when due dates elapse
- Should be called periodically (recommended: daily cron job)
- Checks all active recurring works and creates missing periods

## Implementation Details

### Frontend Changes

#### New Component: `DocumentsTab`
- Location: `src/components/works/WorkDetailsTabs.tsx`
- Features:
  - Document list with categorization
  - Status indicators and badges
  - Quick actions (collect, upload, edit, delete)
  - Statistics summary cards

#### Updated: `WorkDetailsMain`
- Added document state management
- Added document CRUD operations
- Integrated DocumentsTab into tab navigation
- Added document fetching in work details query

#### New Type: `WorkDocument`
- Location: `src/components/works/WorkDetailsTypes.ts`
- Complete TypeScript interface for work documents

### Database Schema

#### Tables Used
1. **service_documents**: Template documents for services
2. **work_documents**: Instance documents for each work
3. **work_recurring_instances**: Recurring period tracking
4. **works**: Work management with recurring support
5. **invoices**: Auto-generated invoices
6. **invoice_items**: Invoice line items

## Setup Instructions

### Step 1: Apply Database Migration
Run the SQL file `APPLY_THIS_MIGRATION.sql` in your Supabase SQL editor:
```bash
# Copy contents of APPLY_THIS_MIGRATION.sql and run in Supabase SQL Editor
```

### Step 2: Set Up Periodic Job (Optional but Recommended)
For automatic next period creation, set up a cron job or scheduled function:
```sql
-- Run this query daily to auto-create next periods
SELECT create_next_recurring_period_if_needed();
```

You can use:
- Supabase Edge Functions with cron triggers
- pg_cron extension
- External cron job calling the function via API

### Step 3: Configure Service Documents
1. Go to Services page
2. Edit a service
3. Add required documents in the Documents tab
4. These will automatically copy to works created from this service

## Usage Guide

### Managing Documents in Work Details

#### Viewing Documents
1. Open any work in the Works page
2. Click the "Documents" tab
3. View all documents with their status

#### Marking Documents as Collected
1. Click the checkmark icon on a document
2. Document will turn green and show "Collected" badge
3. Collection timestamp is automatically recorded

#### Uploading Document Files
1. Click the upload icon on a document
2. (File upload dialog will appear - storage integration pending)
3. Once uploaded, file is available for download

#### Editing Document Details
1. Click the edit icon
2. Modify document name, description, or category
3. Save changes

### Managing Recurring Periods

#### Viewing Periods
1. Open a recurring work
2. Go to "Recurring Periods" tab
3. See all periods with status, due dates, and billing info

#### Completing a Period
1. Select "Completed" from the status dropdown
2. If auto_bill is enabled, invoice generates automatically
3. Period is marked with completion timestamp and invoice link

#### Tracking Period Progress
- **Pending**: Yellow badge, waiting to start
- **In Progress**: Blue badge, work ongoing
- **Completed**: Green badge, work finished
- **Overdue**: Red badge, past due date

## Benefits

### For Work Management
1. **Complete Document Tracking**: Never lose track of required documents
2. **Automatic Workflows**: Less manual work creating periods and invoices
3. **Status Visibility**: Clear view of what's collected, uploaded, or missing
4. **Audit Trail**: Timestamps for all document and period actions

### For Recurring Work
1. **Automatic Period Creation**: No manual period creation needed
2. **Auto-Billing**: Invoices generate when work is completed
3. **Continuous Tracking**: Periods auto-create when previous ones elapse
4. **Clear Period Management**: Each period is independent and trackable

## Technical Notes

### Document Storage
- File URLs are stored in database
- Actual file storage requires Supabase Storage integration
- Upload UI is ready, backend integration pending

### Performance Optimization
- Indexed queries on due_date and status
- Efficient period checks
- Batch processing for multiple works

### Security
- All operations check user authentication
- RLS policies ensure data isolation
- SECURITY DEFINER functions for system operations

## Future Enhancements

### Potential Improvements
1. **File Storage Integration**: Connect to Supabase Storage for actual file uploads
2. **Document Templates**: Predefined document templates per service category
3. **Email Notifications**: Alert when documents are due or overdue
4. **Bulk Document Upload**: Upload multiple files at once
5. **Document Versioning**: Track document revision history
6. **Period Notifications**: Alert staff before period due dates
7. **Auto-Send Invoices**: Email invoices to customers automatically

## Troubleshooting

### Periods Not Creating Automatically
- Ensure `create_next_recurring_period_if_needed()` is being called regularly
- Check that work has `is_recurring = true` and `is_active = true`
- Verify `recurrence_pattern` and `recurrence_day` are set

### Invoices Not Generating
- Confirm work has `auto_bill = true`
- Check that period has `billing_amount` set
- Verify service has `payment_terms` and `tax_rate` configured
- Ensure period status changed to 'completed'

### Documents Not Showing
- Verify `work_documents` table has RLS policies enabled
- Check that documents were copied from service_documents
- Ensure work_id matches correctly

## Support

For issues or questions:
1. Check the database triggers are created successfully
2. Verify RLS policies are in place
3. Review error logs in Supabase Dashboard
4. Check browser console for frontend errors

---

## Summary

This implementation provides a comprehensive document management system within work details and fully automated recurring period handling. Documents are tracked from service templates through work completion, while recurring periods automatically create, bill, and progress without manual intervention.

The system is designed for maximum automation while maintaining full visibility and control over the entire work lifecycle.
