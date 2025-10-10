# Service-Work Automation Setup Guide

## Overview

This guide will help you set up the comprehensive Service-Work automation system with recurring period management, auto-billing, and workflow automation.

## Features Implemented

### 1. **Service Templates & Task Management**
   - Define reusable task templates for each service
   - Tasks automatically copy to works when created
   - Organize tasks with priority, estimated hours, and descriptions

### 2. **Auto-Fill Work Details**
   - Service details (price, duration, recurring pattern) auto-populate in works
   - Users can still modify values for specific client needs
   - Automatic due date calculation based on recurring rules

### 3. **Recurring Work with Fixed Due Days**
   - Set recurring pattern (monthly, quarterly, yearly)
   - Define fixed due day (e.g., 10th of every month)
   - System auto-calculates next due date

### 4. **Period-Wise Management**
   - Track each recurring period separately (Oct 2024, Nov 2024, etc.)
   - Assign team members per period
   - Update status independently (Pending, In Progress, Completed)
   - View complete period history

### 5. **Auto-Billing & Invoice Generation**
   - Automatically generate invoices when work/period is completed
   - Configurable per-period billing amounts
   - Track billing status per period
   - Link invoices to specific periods

### 6. **Team Assignment & Tracking**
   - Assign work to team members
   - Track reassignments with reasons
   - View complete assignment history
   - Monitor team workload

### 7. **Time Tracking**
   - Log time spent on each work
   - Track actual vs estimated hours
   - Generate time reports
   - Billable hour tracking

## Setup Instructions

### Step 1: Run the Database Migration

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the migration file: `supabase/migrations/20251010_service_work_automation_and_recurring_periods.sql`
4. Copy the entire SQL content
5. Paste it into the SQL Editor
6. Click **Run** to execute the migration

This will create:
- `service_tasks` table for task templates
- `work_tasks` table for work-specific tasks
- `time_logs` table for time tracking
- `work_assignments` table for team assignments
- `work_recurring_instances` table for period tracking
- `staff_members` table (if not exists)
- All necessary functions and indexes

### Step 2: Verify the Migration

After running the migration, verify the tables were created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'service_tasks',
    'work_tasks',
    'time_logs',
    'work_assignments',
    'work_recurring_instances',
    'staff_members'
  )
ORDER BY table_name;
```

You should see all 6 tables listed.

### Step 3: Test the System

1. **Create a Service with Recurring Pattern:**
   - Go to Services page
   - Click "Add Service"
   - Fill in service details
   - Check "Recurring Service"
   - Set recurrence type (e.g., Monthly)
   - Set due day (e.g., 10)
   - Save

2. **Add Task Templates to Service:**
   - Click on the service to open details
   - Go to "Task Templates" tab
   - Click "Add Task"
   - Define tasks (e.g., "Collect data", "Process returns", "File documents")
   - Save each task

3. **Create a Work from Service:**
   - Go to Works page
   - Click "Add New Work"
   - Select customer
   - Select the service you created
   - Notice: Price, duration, and recurring details auto-fill
   - Due date is automatically calculated based on recurring day
   - Save

4. **View Work Details:**
   - Click on the created work
   - See auto-copied tasks in "Tasks" tab
   - See empty "Recurring Periods" tab (if recurring work)
   - Assign team member
   - Log time
   - Add recurring periods

5. **Add Recurring Periods:**
   - In Work Details, go to "Recurring Periods" tab
   - Click "Add Period"
   - Enter period name (e.g., "October 2024")
   - Set period dates and due date
   - Set billing amount (optional, uses default if empty)
   - Save

6. **Complete a Period:**
   - Change period status to "Completed"
   - System auto-generates invoice
   - Invoice is linked to the period
   - Billing status updated automatically

## How to Use the System

### For Non-Recurring Services

1. Create service with details
2. Add task templates (optional)
3. Create work → details auto-fill
4. Tasks auto-copy to work
5. Track progress and log time
6. Mark as completed → auto-bill if enabled

### For Recurring Services

1. Create service with recurring pattern and due day
2. Add task templates
3. Create ONE work (not per month)
4. System adds recurring periods inside work details
5. For each period:
   - Track separately
   - Assign team members
   - Update status
   - Auto-bill on completion
6. View all period history in one place

### Auto-Billing Rules

- **Trigger:** When work status = "Completed" OR period status = "Completed"
- **Amount:** Uses billing_amount from period (if set) or work default
- **Invoice:** Auto-generated with proper line items
- **Status:** Invoice marked as "Draft", can be edited before sending

## Key Workflows

### Workflow 1: Monthly Recurring Service (e.g., GST Returns)

```
1. Create Service
   ├─ Name: "GST Return"
   ├─ Recurring: Yes (Monthly, Day 10)
   ├─ Price: ₹5,000
   └─ Tasks:
      ├─ Collect purchase data
      ├─ Collect sales data
      ├─ Prepare GSTR-1
      └─ File returns

2. Create Work for Customer
   ├─ Select Service → Auto-fills all details
   ├─ Due date: Auto-calculated (10th of upcoming month)
   └─ Tasks: Auto-copied from service

3. Add Periods
   ├─ October 2024 (1-Oct to 31-Oct, Due: 10-Nov)
   ├─ November 2024 (1-Nov to 30-Nov, Due: 10-Dec)
   └─ December 2024 (1-Dec to 31-Dec, Due: 10-Jan)

4. For Each Period
   ├─ Assign team member
   ├─ Update status (Pending → In Progress → Completed)
   ├─ Log time spent
   └─ Auto-generate invoice on completion

5. Benefits
   ├─ Track all months in one work
   ├─ See complete history
   ├─ Avoid creating duplicate works
   └─ Automatic billing per month
```

### Workflow 2: One-Time Service (e.g., Company Registration)

```
1. Create Service
   ├─ Name: "Company Registration"
   ├─ Recurring: No
   ├─ Price: ₹25,000
   └─ Tasks:
      ├─ Collect documents
      ├─ Prepare application
      ├─ File with ROC
      └─ Receive certificate

2. Create Work
   ├─ Select Service → Auto-fills
   ├─ Set due date manually
   └─ Tasks auto-copied

3. Track Progress
   ├─ Update task statuses
   ├─ Log time
   └─ Assign team members

4. Complete
   ├─ Mark work as completed
   └─ Invoice auto-generated
```

## Database Functions Available

### 1. `copy_service_tasks_to_work(service_id, work_id)`
Automatically copies all active task templates from a service to a work.

**Usage:** Called automatically when work is created.

### 2. `calculate_next_due_date(pattern, day, base_date)`
Calculates the next due date based on recurring pattern.

**Example:**
```sql
SELECT calculate_next_due_date('monthly', 10, CURRENT_DATE);
-- Returns: 10th of current or next month
```

### 3. `increment_work_hours(work_id, hours_to_add)`
Updates actual work hours when time is logged.

**Usage:** Called automatically when time log is created.

## Tips & Best Practices

1. **Service Setup:**
   - Create services once with complete details
   - Add comprehensive task templates
   - Set realistic estimated hours

2. **Work Management:**
   - One work per customer-service combination
   - For recurring: Use periods instead of multiple works
   - Keep work title descriptive

3. **Period Management:**
   - Add periods in advance (e.g., add Q1 periods at start of year)
   - Use consistent naming (e.g., "January 2024", "Q1 2024")
   - Set realistic due dates

4. **Team Assignment:**
   - Assign early for better planning
   - Use reassignment tracking when needed
   - Balance workload across team

5. **Time Tracking:**
   - Log time regularly
   - Add descriptions for clarity
   - Review actual vs estimated hours

## Troubleshooting

### Issue: Tasks not copying to work
**Solution:** Ensure service has active task templates before creating work.

### Issue: Due date not auto-calculating
**Solution:** Check recurring pattern and day are set in service.

### Issue: Auto-billing not working
**Solution:** Verify `auto_bill` is enabled on work and status is "Completed".

### Issue: Can't see recurring periods tab
**Solution:** Ensure work `is_recurring` is set to true.

## Support

For issues or questions:
1. Check this documentation
2. Review the migration SQL file
3. Check Supabase logs for errors
4. Verify RLS policies are working correctly

## Next Steps

After setup:
1. Create your services with task templates
2. Test with one customer
3. Verify auto-fill and auto-billing work
4. Train team on the system
5. Roll out to all customers
