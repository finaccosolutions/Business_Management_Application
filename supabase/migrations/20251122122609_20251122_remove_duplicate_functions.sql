/*
  # Remove Duplicate Functions

  1. Functions Removed
    - `calculate_period_dates` - Superseded by calculate_enhanced_task_due_date and calculate_next_period_dates
    - `calculate_next_due_date` - Basic functionality covered by calculate_enhanced_task_due_date
    - `create_periods_for_recurring_work` - Initial period creation now handled by generate_next_recurring_periods

  2. Verification
    - No dependencies found on removed functions
    - No triggers reference these functions
    - System uses more robust alternatives instead

  3. Remaining Functions (Recommended)
    - `calculate_enhanced_task_due_date` - Most comprehensive date calculation
    - `calculate_next_period_dates` - Clear next period calculation
    - `generate_next_recurring_periods` - Bulk period generation
    - `auto_generate_next_recurring_period` - Trigger-based auto generation
    - `copy_service_tasks_to_work` - Trigger-based copying for non-recurring works
    - `copy_service_tasks_to_existing_work` - Manual function for existing works
    - `copy_tasks_to_period` - Copies to recurring period instances
    - `post_invoice_to_ledgers` - Only ledger posting function (no duplicate)
*/

DROP FUNCTION IF EXISTS calculate_period_dates(text, text, date);

DROP FUNCTION IF EXISTS calculate_next_due_date(date, text, integer);

DROP FUNCTION IF EXISTS create_periods_for_recurring_work(uuid);