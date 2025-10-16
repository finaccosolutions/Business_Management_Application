# Recurring Periods System - Complete Guide

## Overview

This system manages recurring work periods (monthly, quarterly, yearly, etc.) with automatic period generation when previous periods have elapsed.

## How It Works

### 1. **When You Create a Recurring Work**

When you create a new work and mark it as "recurring":
- The system automatically creates the **first period**
- Period start date = Work start date
- Period end date = Start date + pattern duration
  - Monthly: 30/31 days
  - Quarterly: 3 months
  - Half-yearly: 6 months
  - Yearly: 12 months
- All service tasks are copied to the period
- Task due dates = Period end date + task offset days
  - Example: For GST filing, Sep 1-30 period → GSTR-1 due Oct 10 (offset: 10 days)

### 2. **Manual Period Creation**

You can manually add periods anytime:
1. Go to Work Details → Periods & Tasks tab
2. Click "Add Period"
3. Enter:
   - Period name (e.g., "October 2025")
   - Start date
   - End date
   - Billing amount (optional)
   - Notes (optional)
4. System automatically:
   - Copies all service tasks with calculated due dates
   - Copies all required documents
   - Sets up tracking

### 3. **Automatic Next Period Generation**

When a period's end date has **elapsed** (passed):
1. Click the **"Generate Next"** button
2. System checks all recurring works
3. For works with elapsed periods:
   - Creates next period starting the day after previous period ended
   - Calculates end date based on recurrence pattern
   - Copies tasks and documents
4. Shows notification of how many periods were created

### 4. **Period Management**

For each period you can:
- View and manage tasks with due dates
- Track document collection
- Update status (Pending → In Progress → Completed)
- Edit period details
- Delete periods if needed

## Example: Monthly GST Filing

**Setup:**
- Service: GST Filing (Monthly)
- Work start date: Sep 1, 2025
- Tasks:
  - GSTR-1: Due 10 days after period ends
  - GSTR-3B: Due 20 days after period ends

**Period 1 (Auto-created):**
- Name: September 2025
- Period: Sep 1 - Sep 30
- GSTR-1 due: Oct 10
- GSTR-3B due: Oct 20

**On Oct 1:**
- Click "Generate Next"
- Period 2 created automatically:
  - Name: October 2025
  - Period: Oct 1 - Oct 31
  - GSTR-1 due: Nov 10
  - GSTR-3B due: Nov 20

## Key Features

✅ **No Duplicates** - System prevents duplicate period creation
✅ **Correct Due Dates** - Tasks use period end date + offset
✅ **Automatic Task Copy** - All service tasks copied to each period
✅ **Document Tracking** - Track required document collection per period
✅ **Manual Override** - Add periods manually anytime
✅ **Simple Logic** - Easy to understand and predict

## Database Functions

The system uses these PostgreSQL functions:

1. `create_first_recurring_period()` - Creates first period when work is created
2. `generate_next_recurring_periods()` - Generates next periods for elapsed periods
3. `calculate_next_period_dates()` - Calculates next period dates
4. `copy_tasks_to_period()` - Copies tasks with correct due dates
5. `copy_documents_to_period()` - Copies documents to period
6. `update_period_task_completion()` - Tracks task completion

## Migration Applied

File: `20251016130000_clean_recurring_periods_system.sql`

This migration:
- Removes all old conflicting triggers
- Creates clean, simple period generation logic
- Ensures no duplicate periods
- Fixes task due date calculation

## UI Updates

**RecurringPeriodManager Component:**
- Added "Generate Next" button to manually trigger period generation
- Shows spinning icon during generation
- Displays success/info messages
- Lists all periods with status tracking

## Future Enhancements

Consider adding:
- Scheduled cron job to auto-generate periods daily
- Email notifications when new periods are created
- Bulk period generation for multiple future periods
- Period templates for faster setup
