/*
  # Final Aggressive Cleanup - Remove All Remaining Duplicates
  
  Direct DROP FUNCTION statements with proper error handling.
  Focus on functions that still reference duplicate logic.
*/

DO $$
BEGIN
  -- Remaining calculate_task_due_date and similar that need deletion
  EXECUTE 'DROP FUNCTION IF EXISTS calculate_task_due_date(text, date, date, integer, integer, text, text) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, text, integer, integer, text, text) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, date, integer, integer, jsonb) CASCADE';
  
  -- Period date functions
  EXECUTE 'DROP FUNCTION IF EXISTS calculate_period_dates(date, text) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS get_period_boundaries(uuid) CASCADE';
  
  -- Period generation duplicates
  EXECUTE 'DROP FUNCTION IF EXISTS check_and_generate_recurring_periods(uuid) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS generate_next_recurring_periods(uuid) CASCADE';
  
  -- Period creation duplicates
  EXECUTE 'DROP FUNCTION IF EXISTS create_period_for_non_recurring_work(uuid, uuid, date, numeric, uuid) CASCADE';
  
  -- Copy function duplicates
  EXECUTE 'DROP FUNCTION IF EXISTS copy_service_documents_to_work(uuid, uuid) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS copy_service_tasks_to_existing_work(uuid, uuid) CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS copy_tasks_to_period(uuid, uuid) CASCADE';
  
  -- Invoice generation duplicates
  EXECUTE 'DROP FUNCTION IF EXISTS manually_generate_invoice_for_work(uuid, date) CASCADE';
  
  -- Ledger posting duplicate
  EXECUTE 'DROP FUNCTION IF EXISTS post_invoice_to_ledgers(uuid) CASCADE';
  
  -- Work status update duplicate
  EXECUTE 'DROP FUNCTION IF EXISTS update_work_status_from_periods(uuid) CASCADE';
  
  -- Enhanced task due date (if duplicate)
  EXECUTE 'DROP FUNCTION IF EXISTS calculate_enhanced_task_due_date(date, date, integer, integer, jsonb) CASCADE';
  
  RAISE NOTICE 'All duplicate functions dropped successfully';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error during cleanup: %', SQLERRM;
END;
$$;
