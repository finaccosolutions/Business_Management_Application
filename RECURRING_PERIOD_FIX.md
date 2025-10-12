# Recurring Period Generation Fix

## Problem
When creating a recurring work with:
- Start date: 07-10-2025
- Current date: 13-10-2025
- Recurrence: Monthly on the 10th

The system was incorrectly generating **3 periods** with wrong due dates:
1. October 2025 - Due: 09/10/2025 ❌
2. November 2025 - Due: 09/11/2025 ❌
3. November 2025 - Due: 10/11/2025 ❌ (duplicate)

## Root Cause
The `generate_next_recurring_period()` database function had flawed logic:
- Incorrectly calculated period boundaries
- Wrong due date calculations (off by 1 day)
- Did not properly handle the initial period generation from work start date

## Solution
Applied migration `20251013_fix_recurring_period_generation.sql` which:

### 1. Fixed Period Calculation Logic
- Correctly calculates the due date for the first period based on `recurrence_day`
- If the calculated due date is before the start date, it moves to the next month
- Period boundaries now correctly span the full month (1st to last day)

### 2. Correct Due Date Assignment
- For monthly recurrence with day 10: `date_trunc('month', date) + (10 - 1)` = 10th of month
- Fixed off-by-one error in the calculation

### 3. Enhanced Functions
Created 3 key functions:

#### `generate_next_recurring_period(work_id)`
- Generates a single period for a work
- Handles both initial period and subsequent periods
- Correctly sets period start/end dates and due dates

#### `check_and_generate_recurring_periods()`
- Batch processes all recurring works
- Generates catch-up periods for works that are behind
- Creates upcoming periods automatically

#### `initialize_recurring_periods_for_work(work_id)`
- New utility function to re-initialize periods for a work
- Deletes existing periods and regenerates them correctly
- Useful for fixing existing works with incorrect periods

## Expected Behavior Now

For work created on 07-10-2025 (current date: 13-10-2025) with monthly recurrence on day 10:

### Correct Output ✅
1. **October 2025**
   - Period: 01/10/2025 - 31/10/2025
   - Due: 10/10/2025
   - Status: Overdue (due date has passed)

2. **November 2025**
   - Period: 01/11/2025 - 30/11/2025
   - Due: 10/11/2025
   - Status: Pending (upcoming)

## How to Fix Existing Works

If you have existing works with incorrect periods:

```sql
-- Fix a specific work (replace with actual work_id)
SELECT * FROM initialize_recurring_periods_for_work('your-work-id-here');

-- Or run the batch function to check all works
SELECT * FROM check_and_generate_recurring_periods();
```

## Testing

To verify the fix works:
1. Create a new recurring work with monthly recurrence on a specific day
2. Set start date in the past
3. Check that periods are generated correctly with:
   - Correct month boundaries
   - Exact due dates matching recurrence_day
   - Only necessary periods (past due + current + 1 future)
