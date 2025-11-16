/*
  # Final Cleanup: Remove All Redundant Period Generation Functions

  This migration removes all the old redundant period generation functions
  that have been consolidated into create_periods_for_recurring_work()
  
  Keeping only:
  - create_periods_for_recurring_work (new consolidated function)
  - copy_tasks_to_period (helper)
  - copy_documents_to_period (helper)
  - calculate_next_period_dates (used by other systems)
  - calculate_enhanced_task_due_date
  - update_period_task_counts (helper)
  - update_period_status_on_task_change (helper)
*/

DO $$
BEGIN
  -- Drop all the old redundant period generation functions
  DROP FUNCTION IF EXISTS auto_generate_next_recurring_period(uuid) CASCADE;
  DROP FUNCTION IF EXISTS auto_generate_recurring_periods(uuid) CASCADE;
  DROP FUNCTION IF EXISTS check_and_generate_recurring_periods(uuid) CASCADE;
  DROP FUNCTION IF EXISTS generate_all_required_periods() CASCADE;
  DROP FUNCTION IF EXISTS generate_next_recurring_periods(uuid) CASCADE;
  DROP FUNCTION IF EXISTS backfill_missing_periods() CASCADE;
  DROP FUNCTION IF EXISTS calculate_first_period_dates(date, text) CASCADE;
  DROP FUNCTION IF EXISTS calculate_period_dates(date, text) CASCADE;
  DROP FUNCTION IF EXISTS get_first_period_dates(uuid) CASCADE;
  DROP FUNCTION IF EXISTS get_period_boundaries(uuid) CASCADE;
  DROP FUNCTION IF EXISTS generate_period_name(date, text) CASCADE;
  DROP FUNCTION IF EXISTS generate_period_tasks_for_instance(uuid, uuid, date, date, uuid) CASCADE;
  DROP FUNCTION IF EXISTS create_period_for_non_recurring_work() CASCADE;
  DROP FUNCTION IF EXISTS manually_create_period_for_work(uuid, date, date) CASCADE;
  DROP FUNCTION IF EXISTS trigger_auto_create_period_for_non_recurring_work() CASCADE;
  DROP FUNCTION IF EXISTS trigger_recurring_period_generation() CASCADE;
  
  -- Drop override management functions (rarely used)
  DROP FUNCTION IF EXISTS add_period_specific_date_override(uuid, date) CASCADE;
  DROP FUNCTION IF EXISTS remove_period_specific_date_override(uuid) CASCADE;
  DROP FUNCTION IF EXISTS track_task_due_date_override(uuid, date) CASCADE;
  
  RAISE NOTICE 'Successfully dropped all redundant period generation functions';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cleanup completed with note: %', SQLERRM;
END $$;
