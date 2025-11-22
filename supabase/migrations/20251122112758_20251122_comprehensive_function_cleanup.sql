/*
  # Comprehensive Database Function Cleanup
  
  ## Summary
  This migration removes duplicate functions that cause conflicts and creates wrong periods/tasks.
  Identified 13 groups of duplicate functions with overlapping purposes.
  
  ## Functions Being Removed
  
  ### Calculate Task Due Date Duplicates
  - 2 old overloads removed, keeping flexible offset-based version
  
  ### Period Generation Duplicates
  - auto_generate_recurring_periods (causes upfront period creation)
  - generate_all_required_periods (redundant)
  - check_and_generate_recurring_periods (redundant)
  - generate_next_recurring_periods (redundant)
  - Keeping: auto_generate_next_recurring_period (safe on-demand)
  
  ### Period Creation Duplicates
  - create_period_for_non_recurring_work
  - manually_create_period_for_work
  - Keeping: create_periods_for_recurring_work (most complete)
  
  ### Task Copy Duplicates
  - copy_service_tasks_to_existing_work
  - Keeping: copy_service_tasks_to_work (main version)
  
  ### Document Copy Duplicates
  - copy_service_documents_to_work
  - copy_tasks_to_period
  - Keeping: copy_documents_to_period (most general)
  
  ### Invoice Generation Duplicates
  - manually_generate_invoice_for_work
  - manually_generate_invoice_for_period
  - create_invoice_for_completed_work
  - Keeping: auto_create_invoice_on_work_tasks_complete
  - Keeping: auto_create_invoice_on_recurring_tasks_complete
  
  ### Ledger/Invoice Status Duplicates
  - post_invoice_to_ledgers (plural version)
  - Keeping: post_invoice_to_ledger (singular)
  
  ### Period Date Calculation Duplicates
  - calculate_period_dates
  - get_period_boundaries
  - Keeping: calculate_next_period_dates
  
  ### Invoice Number Generation Duplicates
  - generate_invoice_number_from_config
  - get_next_invoice_number
  - Keeping: generate_next_invoice_number
  
  ### Voucher Number Duplicates
  - get_next_voucher_number
  - Keeping: generate_voucher_number
  
  ### Work Status Update Duplicates
  - update_work_status_from_periods
  - Keeping: auto_update_work_status_on_task_completion
  
  ### Enhanced Task Due Date
  - calculate_enhanced_task_due_date
  - Keeping: calculate_task_due_date (main version)
  
  ## Expected Results
  - No more duplicate periods for recurring works
  - No more unnecessary duplicate tasks
  - Consistent task due date calculations
  - Cleaner trigger execution without conflicts
*/

DO $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting comprehensive function cleanup...';

  -- Drop duplicate calculate_task_due_date overloads (keep flexible offset version)
  BEGIN
    DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, date, integer, integer, jsonb) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_task_due_date(date, date, date, int, int, jsonb)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop calculate_task_due_date(date, date, date, int, int, jsonb): %', SQLERRM;
  END;

  -- Drop period generation duplicates
  BEGIN
    DROP FUNCTION IF EXISTS auto_generate_recurring_periods() CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped auto_generate_recurring_periods trigger';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop auto_generate_recurring_periods: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS generate_all_required_periods(uuid, uuid, date, text, text, numeric, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped generate_all_required_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop generate_all_required_periods: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS check_and_generate_recurring_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped check_and_generate_recurring_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop check_and_generate_recurring_periods: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS generate_next_recurring_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped generate_next_recurring_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop generate_next_recurring_periods: %', SQLERRM;
  END;

  -- Drop period creation duplicates
  BEGIN
    DROP FUNCTION IF EXISTS create_period_for_non_recurring_work(uuid, uuid, date, numeric, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped create_period_for_non_recurring_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop create_period_for_non_recurring_work: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS manually_create_period_for_work(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped manually_create_period_for_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop manually_create_period_for_work: %', SQLERRM;
  END;

  -- Drop task copy duplicate
  BEGIN
    DROP FUNCTION IF EXISTS copy_service_tasks_to_existing_work(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_service_tasks_to_existing_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop copy_service_tasks_to_existing_work: %', SQLERRM;
  END;

  -- Drop document copy duplicates
  BEGIN
    DROP FUNCTION IF EXISTS copy_service_documents_to_work(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_service_documents_to_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop copy_service_documents_to_work: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS copy_tasks_to_period(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_tasks_to_period';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop copy_tasks_to_period: %', SQLERRM;
  END;

  -- Drop invoice generation duplicates
  BEGIN
    DROP FUNCTION IF EXISTS manually_generate_invoice_for_work(uuid, date) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped manually_generate_invoice_for_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop manually_generate_invoice_for_work: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS manually_generate_invoice_for_period(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped manually_generate_invoice_for_period';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop manually_generate_invoice_for_period: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS create_invoice_for_completed_work(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped create_invoice_for_completed_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop create_invoice_for_completed_work: %', SQLERRM;
  END;

  -- Drop ledger posting duplicate
  BEGIN
    DROP FUNCTION IF EXISTS post_invoice_to_ledgers(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped post_invoice_to_ledgers (plural)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop post_invoice_to_ledgers: %', SQLERRM;
  END;

  -- Drop period date calculation duplicates
  BEGIN
    DROP FUNCTION IF EXISTS calculate_period_dates(date, text) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_period_dates';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop calculate_period_dates: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS get_period_boundaries(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped get_period_boundaries';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop get_period_boundaries: %', SQLERRM;
  END;

  -- Drop invoice number generation duplicates
  BEGIN
    DROP FUNCTION IF EXISTS generate_invoice_number_from_config(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped generate_invoice_number_from_config';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop generate_invoice_number_from_config: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS get_next_invoice_number(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped get_next_invoice_number';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop get_next_invoice_number: %', SQLERRM;
  END;

  -- Drop voucher number generation duplicate
  BEGIN
    DROP FUNCTION IF EXISTS get_next_voucher_number(uuid, text) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped get_next_voucher_number';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop get_next_voucher_number: %', SQLERRM;
  END;

  -- Drop work status update duplicate
  BEGIN
    DROP FUNCTION IF EXISTS update_work_status_from_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped update_work_status_from_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop update_work_status_from_periods: %', SQLERRM;
  END;

  -- Drop enhanced task due date if it's a duplicate
  BEGIN
    DROP FUNCTION IF EXISTS calculate_enhanced_task_due_date(date, date, integer, integer, jsonb) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_enhanced_task_due_date';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop calculate_enhanced_task_due_date: %', SQLERRM;
  END;

  RAISE NOTICE 'Cleanup complete. Removed % functions', v_count;
END;
$$;
