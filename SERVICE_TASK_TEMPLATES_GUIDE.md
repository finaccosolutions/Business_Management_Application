# Service Task Templates Implementation Guide

## Overview
This guide documents the new Service Task Templates feature, which allows you to define predefined tasks for each service. When creating a work, these tasks are automatically copied, streamlining your workflow.

## Features Implemented

### 1. Database Structure
- **New Table**: `service_tasks` - Stores task templates for services
- **Migration File**: `supabase/migrations/20251008_add_service_tasks.sql`
- **Additional Columns**: Added `billing_amount`, `is_billed`, and `invoice_id` to `work_recurring_instances` table

**Important**: You need to apply the migration manually by running the SQL in `supabase/migrations/20251008_add_service_tasks.sql` in your Supabase SQL editor.

### 2. Service Module Enhancements

#### a. Service Tiles
- **Clickable Tiles**: Click anywhere on a service tile to view details
- **Edit Button**: Green edit button to quickly edit service details
- **Delete Button**: Red delete button with confirmation
- **View Button**: Blue button to explicitly view details

#### b. Service Details Page
- **New "Task Templates" Tab**: Manage task templates for each service
- **Task Management**: Add, edit, and delete task templates
- **Task Information Displayed**:
  - Sequential numbering (1, 2, 3...)
  - Title and description
  - Priority level (with color coding)
  - Estimated hours
  - Notes
  - Active/Inactive status

#### c. Task Template Features
- **Priority Levels**: Low, Medium, High, Urgent
- **Estimated Hours**: Track expected duration
- **Sort Order**: Tasks maintain their order
- **Active/Inactive**: Control which tasks are copied to new works

### 3. Work Module Integration

#### Automatic Task Creation
When you create a new work from a service:
1. System fetches all active task templates from the service
2. Tasks are automatically copied to the work
3. Each task is created with:
   - Title and description from template
   - Priority level
   - Estimated hours
   - Status set to "pending"
   - Notes copied from template

**Note**: Only active tasks are copied. Inactive tasks are skipped.

### 4. Workflow Example

#### Setting Up Service Templates

1. **Go to Services Module**
2. **Click on a service** (e.g., "GST Return Filing")
3. **Navigate to "Task Templates" tab**
4. **Click "Add Task"**
5. **Define tasks**:
   - Task 1: "Collect purchase & sales data" (Priority: High)
   - Task 2: "Reconcile with GSTR-2A" (Priority: Medium)
   - Task 3: "Prepare GSTR-3B" (Priority: High)
   - Task 4: "File and send acknowledgment" (Priority: Urgent)

#### Creating Work with Templates

1. **Go to Works Module**
2. **Click "Add New Work"**
3. **Select Customer** and **Service** (e.g., GST Return Filing)
4. **Fill in work details**
5. **Submit**: All 4 tasks are automatically created for this work!

#### Managing Work Tasks

1. **Click on the work** to open Work Details
2. **Go to "Tasks" tab**
3. **All predefined tasks are there** with pending status
4. **Assign tasks** to staff members
5. **Track progress** by updating task status
6. **Log time** for each task if needed

## Benefits

### Time Savings
- No need to manually recreate tasks for each work
- Standardized workflow across all similar services
- Reduced errors from forgetting steps

### Consistency
- Every GST filing follows the same steps
- Team members know what to expect
- Quality control through standardized processes

### Flexibility
- Tasks are templates - edit them anytime
- Changes don't affect existing works
- Each work can modify its tasks independently

## Technical Implementation

### File Changes
1. **Database Migration**: `supabase/migrations/20251008_add_service_tasks.sql`
2. **Utility Function**: `src/lib/serviceTaskUtils.ts`
3. **Services Page**: `src/pages/Services.tsx`
4. **Service Details**: `src/components/ServiceDetails.tsx`
5. **Add Service Modal**: `src/components/AddServiceModal.tsx`
6. **Works Page**: `src/pages/Works.tsx`

### Key Functions

#### copyServiceTasksToWork()
Located in `src/lib/serviceTaskUtils.ts`
- Fetches active task templates from a service
- Creates work tasks with template data
- Maintains sort order
- Returns success/failure status

### Database Schema

```sql
CREATE TABLE service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium',
  estimated_hours numeric(10, 2),
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Tips and Best Practices

### Service Templates
1. **Be Specific**: Use clear, actionable task titles
2. **Set Priorities**: Help staff know what's most important
3. **Estimate Hours**: Helps with resource planning
4. **Add Notes**: Include special instructions or requirements
5. **Order Matters**: Arrange tasks in logical sequence

### Work Management
1. **Review Tasks**: Check if all tasks apply to specific work
2. **Customize as Needed**: Edit, add, or remove tasks for special cases
3. **Track Progress**: Update task status regularly
4. **Assign Wisely**: Match tasks to appropriate staff members
5. **Use Time Logs**: Track actual time spent for better estimates

### Maintenance
1. **Review Templates Quarterly**: Keep them up-to-date
2. **Get Team Feedback**: Staff insights improve templates
3. **Archive Unused Tasks**: Set to inactive instead of deleting
4. **Document Changes**: Use notes field for version tracking

## Troubleshooting

### Tasks Not Copying to Work
- **Check**: Are tasks marked as "active"?
- **Verify**: Does the service have task templates defined?
- **Confirm**: Database migration has been applied

### Can't Edit Task Template
- **Check**: You must be on the Service Details page
- **Navigate**: Services → Click service → Task Templates tab
- **Permission**: Ensure you own the service

### Tasks Appear Out of Order
- **Solution**: Edit tasks and adjust sort_order
- **Note**: New tasks get highest sort_order automatically
- **Tip**: Drag-and-drop ordering coming in future update

## Future Enhancements (Roadmap)
- Drag-and-drop task reordering
- Task dependencies (Task B starts after Task A)
- Task templates with due date offsets
- Bulk task operations
- Task completion checklists
- Template import/export

## Support
For issues or questions about service task templates:
1. Check this guide first
2. Review the database migration file
3. Inspect browser console for errors
4. Check Supabase logs for database issues
