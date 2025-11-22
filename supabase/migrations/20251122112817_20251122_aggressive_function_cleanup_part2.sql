/*
  # Aggressive Function Cleanup - Part 2
  
  This migration removes remaining duplicate functions that were not dropped in part 1.
  Uses CASCADE to force drop dependent triggers and functions.
*/

DO $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting aggressive function cleanup part 2...';

  -- Force drop duplicate calculate_task_due_date overloads
  BEGIN
    DROP FUNCTION IF EXISTS calculate_task_due_date(text, date, date, integer, integer, text, text) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_task_due_date overload 1';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop overload 1: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, text, integer, integer, text, text) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_task_due_date overload 2';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop overload 2: %', SQLERRM;
  END;

  -- Force drop remaining period generation functions
  BEGIN
    DROP FUNCTION IF EXISTS check_and_generate_recurring_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped check_and_generate_recurring_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS generate_next_recurring_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped generate_next_recurring_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  -- Force drop remaining task copy functions
  BEGIN
    DROP FUNCTION IF EXISTS copy_service_tasks_to_existing_work(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_service_tasks_to_existing_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  -- Force drop remaining document copy functions
  BEGIN
    DROP FUNCTION IF EXISTS copy_service_documents_to_work(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_service_documents_to_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS copy_tasks_to_period(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_tasks_to_period';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  -- Force drop remaining invoice functions
  BEGIN
    DROP FUNCTION IF EXISTS manually_generate_invoice_for_work(uuid, date) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped manually_generate_invoice_for_work';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  -- Force drop ledger functions
  BEGIN
    DROP FUNCTION IF EXISTS post_invoice_to_ledgers(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped post_invoice_to_ledgers';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  -- Force drop period date functions
  BEGIN
    DROP FUNCTION IF EXISTS calculate_period_dates(date, text) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_period_dates';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS get_period_boundaries(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped get_period_boundaries';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  -- Force drop work status update function
  BEGIN
    DROP FUNCTION IF EXISTS update_work_status_from_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped update_work_status_from_periods';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop: %', SQLERRM;
  END;

  RAISE NOTICE 'Aggressive cleanup part 2 complete. Removed % functions', v_count;
END;
$$;
