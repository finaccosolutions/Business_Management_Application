# Task Due Date System - Implementation Guide

## Overview

The task due date system has been simplified and enhanced to provide flexible due date configuration for recurring service tasks. This system allows users to:

1. Set task recurrence frequency (can be more frequent than service recurrence)
2. Configure due date offset from period end (in days or months)
3. Override specific period due dates for exceptions (e.g., date extensions)

## Key Features

### 1. Task Recurrence Frequency

For recurring services, tasks can have different recurrence frequencies than the service itself.

**Example:**
- Service: Quarterly GST Filing
- Task 1: GSTR-1 Filing (quarterly) - once per service period
- Task 2: GSTR-3B Filing (monthly) - three times per service period

**Rules:**
- Task recurrence frequency **cannot exceed** service recurrence frequency
- For quarterly service, tasks can be: monthly, quarterly
- For monthly service, tasks can only be: monthly
- For yearly service, tasks can be: monthly, quarterly, half-yearly, yearly

### 2. Due Date Offset Configuration

Tasks are due a specific time **after the period END date**.

**Fields:**
- `due_offset_type`: Either "days" or "months"
- `due_offset_value`: Number of days/months to offset

**Examples:**
- 10 days after period end: `due_offset_type = 'days'`, `due_offset_value = 10`
- 1 month + 10 days after period end: `due_offset_type = 'months'`, `due_offset_value = 1` (adds 1 month to period end, then adds the value as days)

**Calculation Logic:**
```
IF due_offset_type = 'months':
  due_date = period_end_date + due_offset_value months
ELSE (days):
  due_date = period_end_date + due_offset_value days
```

### 3. Period-Specific Date Overrides

Users can override the calculated due date for specific periods using the `specific_period_dates` JSONB field.

**Format:**
```json
{
  "2025-09": "2025-09-25",
  "2025-10": "2025-10-20",
  "Q1-2025": "2025-04-30"
}
```

**Keys:** Period identifiers (YYYY-MM for monthly, Q1-YYYY for quarterly, etc.)
**Values:** Exact due dates for that period

**Priority:**
- If a period-specific override exists, it **always takes precedence**
- Otherwise, the calculated date is used
- Overrides only apply to the specific period, normal calculation resumes for other periods

## Database Schema

### service_tasks Table

New columns added:

```sql
task_recurrence_type    TEXT      -- How often task recurs (monthly, quarterly, etc.)
due_offset_type         TEXT      -- 'days' or 'months'
due_offset_value        INTEGER   -- Offset amount (default: 10)
specific_period_dates   JSONB     -- Period-specific overrides
```

## User Interface

### Creating/Editing Tasks (Service Details Page)

**For Recurring Services Only:**

1. **Task Frequency Section**
   - Dropdown to select how often this task should be due
   - Options filtered based on service recurrence (can't be less frequent)
   - Shows current service recurrence for reference

2. **Due Date Configuration**
   - Offset Type: Days or Months dropdown
   - Offset Value: Number input (from period end)
   - Clear explanation with examples

3. **Period-Specific Overrides**
   - Note explaining that overrides can be set in work details
   - Managed per-period in the "Periods & Tasks" tab after work creation

### Work Details Page - Periods & Tasks Tab

When viewing a specific period's tasks:

1. **Task List** shows calculated due dates
2. **Override Button** per task allows setting specific date for that period
3. **Override Indicator** shows which tasks have overrides
4. **Remove Override** option to revert to calculated date

## Use Cases

### Case 1: Monthly GST Filing

**Service:** Monthly GST
**Tasks:**
1. GSTR-1 Filing
   - Recurrence: Monthly (same as service)
   - Offset: 11 days after period end
   - Example: For period Aug 1-31, due date = Sep 11

2. GSTR-3B Filing
   - Recurrence: Monthly
   - Offset: 20 days after period end
   - Example: For period Aug 1-31, due date = Sep 20

**September Extension:**
- User notices September deadline extended to 25th
- Opens work details → September period → GSTR-3B task
- Sets override: Sep 25, 2025
- Only September affected, October reverts to normal (20 days after Oct 31 = Nov 20)

### Case 2: Quarterly GST Filing

**Service:** Quarterly GST (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec)
**Tasks:**
1. GSTR-1 Filing
   - Recurrence: Quarterly (same as service)
   - Offset: 1 month after period end
   - Example: For Q1 (Jan-Mar), due date = Apr 30

2. Monthly GSTR-3B Filing
   - Recurrence: Monthly (more frequent than service)
   - Offset: 20 days after each month
   - Creates 3 tasks per quarter:
     - Jan period: Due Feb 20
     - Feb period: Due Mar 20
     - Mar period: Due Apr 20

3. Quarterly Return Filing
   - Recurrence: Quarterly
   - Offset: 1 month + 15 days
   - Example: For Q1 (Jan-Mar), due date = May 15

## Migration Files

1. **20251020_add_flexible_task_due_dates.sql**
   - Adds new columns to service_tasks table
   - Creates indexes for performance

2. **20251020_update_task_copy_with_flexible_dates.sql**
   - Updates copy_tasks_to_period() function
   - Adds period-specific override logic
   - Creates helper functions for managing overrides

3. **20251020_fix_copy_tasks_function_calls.sql**
   - Updates triggers to use new function signature
   - Ensures period_start_date is passed correctly

## Technical Notes

### Date Calculation Function

```sql
copy_tasks_to_period(
  p_period_id UUID,
  p_service_id UUID,
  p_period_start_date DATE,    -- Used for period identifier
  p_period_end_date DATE,       -- Used for offset calculation
  p_assigned_to UUID
)
```

**Logic:**
1. Generate period identifier (YYYY-MM format)
2. Check for period-specific override
3. If override exists, use it
4. Otherwise, calculate: period_end_date + offset
5. Insert task with calculated/override due date

### Helper Functions

```sql
-- Add override for specific period
add_period_specific_date_override(
  service_task_id UUID,
  period_identifier TEXT,    -- e.g., "2025-09"
  due_date DATE
)

-- Remove override for specific period
remove_period_specific_date_override(
  service_task_id UUID,
  period_identifier TEXT
)
```

## Benefits

1. **Simplified Interface:** Only essential fields for task due date configuration
2. **Flexible:** Supports different task frequencies within same service
3. **Override Support:** Handle government deadline extensions easily
4. **Automatic:** Tasks automatically created with correct due dates
5. **Non-intrusive:** Overrides only affect specific periods
6. **Clear Logic:** All dates calculated from period END date (consistent reference point)

## Future Enhancements

Potential improvements for future versions:

1. Bulk override updates (e.g., apply extension to multiple tasks at once)
2. Override templates (save common override patterns)
3. Notification system for approaching due dates
4. Historical view of override changes
5. Import government holiday/extension calendars
