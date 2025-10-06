# Database Setup Instructions

## Important: Run this SQL migration file before using the updated application

The application has been upgraded with comprehensive work management features. To use these features, you **MUST** run the database migration first.

## Migration File Location

The migration SQL file is located at:
```
supabase/migrations/20251006_comprehensive_work_management.sql
```

## How to Run the Migration

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the entire contents of `supabase/migrations/20251006_comprehensive_work_management.sql`
4. Paste it into the SQL Editor
5. Click "Run" to execute the migration

### Option 2: Supabase CLI (if you have it installed)
```bash
supabase migration up
```

## What This Migration Adds

### New Tables:
1. **staff_members** - Complete staff management with roles, employment details, skills, and availability tracking
2. **work_assignments** - Full assignment and reassignment history with tracking of who assigned work and when
3. **work_tasks** - Optional tasks/subtasks within works with individual assignment, status tracking, and time estimates
4. **work_recurring_instances** - Management of recurring work periods (e.g., monthly GST filing periods)
5. **time_logs** - Detailed time tracking for works and tasks with billable hours tracking

### Updates to Existing Tables:
- **works table** - Added columns for:
  - Recurring work management (is_recurring, recurrence_pattern, recurrence_day, next_due_date)
  - Assignment tracking (assigned_date, completion_date)
  - Billing information (billing_status, billing_amount)
  - Time tracking (estimated_hours, actual_duration_hours)
  - Recurring instance support (is_recurring_instance, parent_service_id, instance_date)

## New Features After Migration

### 1. Enhanced Work Creation
- Auto-fill billing amount and due date from service configuration
- Support for recurring works (create ONE work that manages multiple periods)
- Comprehensive fields for better work tracking

### 2. Assignment & Reassignment
- Assign works to staff members
- Track assignment history with dates and who assigned
- Reassign works and maintain complete history

### 3. Tasks & Subtasks
- Add optional tasks within works
- Assign individual tasks to different staff members
- Track task status, estimated hours, and actual time
- Add remarks and notes to tasks
- Auto-update work status based on task completion

### 4. Recurring Work Management
For services like monthly GST filing:
- Create ONE work record instead of multiple works
- Add periods (e.g., "January 2025", "February 2025") inside the work
- Track each period's status independently
- View all periods in one place

### 5. Time Tracking
- Log time spent by staff members on works
- Track start time, end time, and duration
- Automatic calculation of hours worked
- Billable time tracking

### 6. Dashboard Updates
- View work statistics by staff member
- Track pending vs completed works
- Monitor overdue works
- See recent reassignments

## Important Notes

1. **For Recurring Works**: DO NOT create separate works for each period
   - ✅ Correct: Create ONE work with is_recurring=true
   - ❌ Wrong: Creating monthly works separately

2. **Assignment Management**: All assignment features are now within the Work module
   - No separate staff assignment page needed
   - Everything managed through Work Details

3. **Data Safety**: This migration is non-destructive and adds new tables/columns only

4. **Row Level Security (RLS)**: All new tables have RLS enabled for data security

## After Running the Migration

1. Refresh your application
2. Go to Works page
3. Try creating a new work - you'll see enhanced form with new fields
4. Click on any work to see the new WorkDetails with all features:
   - Overview tab
   - Tasks tab (add tasks/subtasks)
   - Time Logs tab (track time)
   - Assignments tab (view assignment history)
   - Recurring Periods tab (for recurring works)

## Troubleshooting

If you encounter any errors:

1. **Check if migration was already run**: Some columns may already exist
   - The migration uses `IF NOT EXISTS` checks, so it's safe to run multiple times

2. **Permission errors**: Ensure you have proper database permissions
   - You need CREATE TABLE, CREATE POLICY, CREATE INDEX permissions

3. **Foreign key errors**: Ensure all base tables exist
   - This migration depends on: profiles, customers, services tables from previous migrations

## Need Help?

If you encounter issues running the migration, check:
1. Supabase project is accessible
2. You have admin/owner permissions on the project
3. All previous migrations have been run successfully
