/*
  # Force Drop All Redundant Period Functions
  
  Forcefully drop all redundant period generation functions
  by dropping dependent functions first, then the helpers
*/

DO $$
DECLARE
  v_function_record RECORD;
BEGIN
  -- First pass: Drop all trigger functions that reference old period functions
  DROP TRIGGER IF EXISTS trigger_recurring_period_generation ON work_recurring_instances CASCADE;
  DROP TRIGGER IF EXISTS trigger_auto_create_period_for_non_recurring_work ON works CASCADE;
  
  -- Drop function overloads by signature
  DROP FUNCTION IF EXISTS auto_generate_next_recurring_period(uuid);
  DROP FUNCTION IF EXISTS auto_generate_recurring_periods(uuid);
  DROP FUNCTION IF EXISTS check_and_generate_recurring_periods(uuid);
  DROP FUNCTION IF EXISTS generate_all_required_periods();
  DROP FUNCTION IF EXISTS generate_next_recurring_periods(uuid);
  DROP FUNCTION IF EXISTS backfill_missing_periods();
  DROP FUNCTION IF EXISTS create_period_for_non_recurring_work();
  DROP FUNCTION IF EXISTS manually_create_period_for_work(uuid, date, date);
  DROP FUNCTION IF EXISTS trigger_auto_create_period_for_non_recurring_work();
  DROP FUNCTION IF EXISTS trigger_recurring_period_generation();
  DROP FUNCTION IF EXISTS calculate_first_period_dates(date, text);
  DROP FUNCTION IF EXISTS calculate_period_dates(date, text);
  DROP FUNCTION IF EXISTS get_first_period_dates(uuid);
  DROP FUNCTION IF EXISTS get_period_boundaries(uuid);
  DROP FUNCTION IF EXISTS generate_period_name(date, text);
  DROP FUNCTION IF EXISTS generate_period_tasks_for_instance(uuid, uuid, date, date, uuid);
  DROP FUNCTION IF EXISTS add_period_specific_date_override(uuid, date);
  DROP FUNCTION IF EXISTS remove_period_specific_date_override(uuid);
  DROP FUNCTION IF EXISTS track_task_due_date_override(uuid, date);
  DROP FUNCTION IF EXISTS auto_create_period_documents();
  
  RAISE NOTICE 'Force dropped all redundant period functions';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Note during cleanup: %', SQLERRM;
END $$;
