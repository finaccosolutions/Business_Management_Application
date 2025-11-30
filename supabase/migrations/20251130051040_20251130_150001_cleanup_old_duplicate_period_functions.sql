/*
  # Clean Up Old Duplicate Period Functions
  
  ## Purpose
  Remove all old/duplicate period creation functions that are no longer used.
  Keep only the core functions needed for the new task-driven system.
  
  ## Core Functions to Keep
  - backfill_recurring_work_at_creation
  - create_period_with_all_tasks
  - should_create_period_for_date
  - get_last_task_due_date_for_period
  - calculate_task_due_date_for_period
  - check_and_create_pending_periods
  - process_recurring_work_periods
*/

-- Drop all old/deprecated period creation functions
DROP FUNCTION IF EXISTS create_period_with_first_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS create_period_with_first_tasks_v2(UUID, DATE, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS create_period_with_all_applicable_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_next_recurring_period() CASCADE;
DROP FUNCTION IF EXISTS generate_next_recurring_periods() CASCADE;
DROP FUNCTION IF EXISTS generate_periods_for_recurring_work(UUID) CASCADE;
DROP FUNCTION IF EXISTS check_and_generate_recurring_periods() CASCADE;
DROP FUNCTION IF EXISTS add_period_specific_date_override(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS remove_period_specific_date_override(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS manage_recurring_periods_for_work(UUID) CASCADE;
DROP FUNCTION IF EXISTS should_create_period(DATE, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period(UUID, DATE, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_based_on_tasks(UUID, DATE, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS should_create_period_task_driven(UUID, DATE, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_first_period_dates(UUID, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_first_period_tasks(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_first_tasks_for_period_with_dues(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_first_tasks_in_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_subsequent_period_tasks(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_applicable_for_period_type(UUID, DATE, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_ready_for_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_tasks_to_create_for_period(UUID, DATE, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS add_subsequent_tasks_to_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS add_tasks_to_period_on_due_date(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS auto_add_tasks_to_periods() CASCADE;
DROP FUNCTION IF EXISTS trigger_auto_create_periods_on_task_update() CASCADE;
DROP FUNCTION IF EXISTS backfill_periods_for_recurring_work_v2(UUID, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS backfill_recurring_work_periods(UUID, DATE, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS create_pending_periods_for_work(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_period_last_task_due_date(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_latest_task_due_date_in_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS calculate_first_task_last_due_date_for_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_first_task_last_day_of_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS generate_period_name(DATE) CASCADE;
DROP FUNCTION IF EXISTS generate_period_tasks_for_instance(UUID, UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_period_end_date_for_task(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_next_period_range(TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_period_range_for_date(DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_period_boundaries(DATE, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_work_periods_with_next_due(UUID) CASCADE;
DROP FUNCTION IF EXISTS auto_create_next_period_on_schedule() CASCADE;
DROP FUNCTION IF EXISTS get_earliest_task_period_end(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_task_period_date(UUID, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date_in_period(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS copy_documents_to_period(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS trigger_log_recurring_period_created() CASCADE;
DROP FUNCTION IF EXISTS trigger_log_recurring_period_completed() CASCADE;
DROP FUNCTION IF EXISTS update_period_status_on_task_change() CASCADE;
DROP FUNCTION IF EXISTS update_period_task_counts() CASCADE;
DROP FUNCTION IF EXISTS update_work_status_from_periods() CASCADE;
DROP FUNCTION IF EXISTS reset_period_invoice_flag_on_task_status_change() CASCADE;
DROP FUNCTION IF EXISTS get_monthly_task_months_in_period(UUID, DATE, DATE) CASCADE;
