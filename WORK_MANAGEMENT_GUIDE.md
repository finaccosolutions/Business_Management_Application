# Work Management System Guide

## Overview
This comprehensive work management system provides automatic invoice generation, recurring work support, and detailed tracking for all work assignments.

## Key Features

### 1. Automatic Invoice Generation
When a work is completed, the system automatically generates an invoice if:
- **Auto-bill** is enabled (default: enabled)
- **Billing amount** is specified
- Work status changes to **completed**

The generated invoice includes:
- Invoice number (auto-generated)
- Customer information
- Work details as line item
- Due date based on payment terms
- Status set to 'draft' for review

### 2. Recurring Work Management
For recurring services (e.g., monthly GST filing, quarterly returns):

#### Creating Recurring Work
1. Select a service marked as recurring
2. The work form auto-populates with:
   - Recurrence pattern (monthly, quarterly, etc.)
   - Recurrence day
   - Default price from service

3. **ONE work** manages all periods
4. Track each period in the **Recurring Periods** tab

#### Managing Recurring Periods
Each period tracks:
- Period name (e.g., "January 2024")
- Period dates (start and end)
- Due date
- Billing amount (can differ per period)
- Status (pending, in_progress, completed)
- Invoice generation status

When a period is marked **completed**:
- Automatic invoice generation (if auto-bill enabled)
- Invoice linked to the period
- Billing status updated

#### Deactivating Recurring Work
Set `is_active` to false to:
- Stop processing future periods
- Stop automatic billing
- Keep historical data intact

## Work Creation Fields

### Basic Information
- **Customer**: Select customer (required)
- **Service**: Select service (required)
- **Title**: Work title (required)
- **Description**: Detailed description
- **Status**: pending, in_progress, completed
- **Priority**: low, medium, high, urgent
- **Due Date**: Work deadline

### Assignment & Team
- **Assign to Staff**: Assign work to team member
- **Department**: Organizing department
- **Work Location**: Office, Remote, Client site, etc.

### Financial Details
- **Billing Amount**: Amount to bill for this work
- **Billing Status**: not_billed, billed, paid
- **Estimated Hours**: Estimated time to complete
- **Auto-bill**: Enable/disable automatic invoice generation

### Additional Details
- **Start Date**: When work begins
- **Requirements & Instructions**: Specific requirements
- **Expected Deliverables**: What should be delivered

## Recurring Work Settings
When creating recurring work:
- **Recurrence Pattern**: monthly, quarterly, half_yearly, yearly
- **Due Day**: Day of month for recurring due dates
- **Active Status**: Control if work continues
- System creates ONE work that manages all periods

## Work Details View

### Tabs Available
1. **Overview**: Work information, customer, service details
2. **Tasks**: Subtasks with status, priority, time tracking
3. **Time Logs**: Track time spent by staff members
4. **Assignments**: Assignment history and reassignments
5. **Recurring Periods**: (Only for recurring work) Manage all periods

### Quick Stats
- Time tracked vs estimated
- Tasks completed
- Assigned staff
- Billing amount and status

## Auto-Billing Process

### Regular Work
1. User creates work with auto-bill enabled
2. User marks work as completed
3. System automatically:
   - Generates invoice
   - Creates invoice line item
   - Updates billing status to 'billed'
   - Calculates due date from payment terms

### Recurring Work Periods
1. User adds recurring periods to work
2. When period is marked completed:
   - System checks if auto-bill enabled
   - Uses period billing amount (or work default)
   - Generates invoice for that period
   - Marks period as billed
   - Links invoice to period

## Payment Terms
Set on services, used for due date calculation:
- **net_15**: Due in 15 days
- **net_30**: Due in 30 days (default)
- **due_on_receipt**: Due immediately

## Best Practices

### For Regular Work
1. Always specify billing amount before completion
2. Enable auto-bill for automatic invoicing
3. Assign to staff for better tracking
4. Add tasks for complex work breakdown

### For Recurring Work
1. Create ONE work for the entire recurrence
2. Add periods in advance (recommended: next 3-6 months)
3. Specify billing amount per period if it varies
4. Mark periods completed as they finish
5. Review auto-generated invoices before sending
6. Deactivate work when service ends

### For Work Management
1. Use status transitions: pending → in_progress → completed
2. Log time regularly for accurate billing
3. Document requirements and deliverables clearly
4. Track all communications and notes
5. Review and send auto-generated invoices promptly

## Database Tables

### works
Main work table with fields:
- Basic info: title, description, status, priority
- Financial: billing_amount, billing_status, auto_bill
- Recurring: is_recurring, recurrence_pattern, is_active
- Tracking: estimated_hours, actual_duration_hours
- Assignment: assigned_to, assigned_date

### work_recurring_instances
Tracks each period for recurring work:
- Period info: period_name, period_start_date, period_end_date
- Billing: billing_amount, is_billed, invoice_id
- Status: status, completed_at, completed_by

### Database Triggers
- `trigger_auto_generate_work_invoice`: Generates invoice when work completed
- `trigger_auto_generate_recurring_period_invoice`: Generates invoice when period completed

## Invoice Integration
Auto-generated invoices:
- Appear in Invoices section
- Status: 'draft' (ready for review)
- Contains work/period details
- Editable before sending
- Linked back to work/period

## Migration
Run the migration file:
```sql
-- File: supabase/migrations/20251006_enhanced_work_and_invoice_automation.sql
```

This adds:
- New columns to works, services, and work_recurring_instances tables
- Database triggers for automatic invoice generation
- Indexes for improved performance

## Troubleshooting

### Invoice Not Auto-Generated
Check:
- Auto-bill is enabled on the work
- Billing amount is specified
- Work/period status changed to 'completed'
- Database triggers are installed

### Recurring Periods Not Billing
Check:
- Work has auto-bill enabled
- Period has billing amount (or work has default)
- Period status is 'completed'
- Work is marked as active

## Future Enhancements
- Automatic period generation based on recurrence pattern
- Email notifications for completed work/invoices
- Batch invoice generation for multiple periods
- Revenue forecasting for recurring work
- Custom billing cycles per customer
