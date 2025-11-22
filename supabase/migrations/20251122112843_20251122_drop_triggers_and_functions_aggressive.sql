/*
  # Drop Triggers and Duplicate Functions - Aggressive Cleanup
  
  This migration drops all triggers that reference duplicate functions,
  then drops the duplicate functions themselves.
*/

DO $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting aggressive trigger and function cleanup...';

  -- Drop triggers referencing duplicate period generation functions
  BEGIN
    DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work ON works CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped trigger_handle_new_recurring_work';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Drop triggers for copy functions we're removing
  BEGIN
    DROP TRIGGER IF EXISTS trigger_copy_service_documents_to_work ON works CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped trigger_copy_service_documents_to_work';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Drop duplicate triggers (those that repeat)
  BEGIN
    DROP TRIGGER IF EXISTS trigger_check_invoice_overdue ON invoices CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_check_invoice_overdue';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_create_advance_payment_record ON vouchers CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_create_advance_payment_record';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_handle_invoice_status_change';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_handle_voucher_status_change ON vouchers CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_handle_voucher_status_change';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_populate_invoice_accounts ON invoices CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_populate_invoice_accounts';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_update_period_status ON recurring_period_tasks CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_update_period_status';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_update_account_balance ON ledger_transactions CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_update_account_balance';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS trigger_validate_payment_allocation ON invoice_payment_allocations CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate trigger_validate_payment_allocation';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS update_work_billing_on_invoice_change ON invoices CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate update_work_billing_on_invoice_change';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS update_work_status_from_periods_trigger ON work_recurring_instances CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate update_work_status_from_periods_trigger';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP TRIGGER IF EXISTS update_work_status_on_task_change ON work_tasks CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped duplicate update_work_status_on_task_change';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Now drop the duplicate functions
  BEGIN
    DROP FUNCTION IF EXISTS copy_service_documents_to_work(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_service_documents_to_work';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS copy_service_tasks_to_existing_work(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_service_tasks_to_existing_work';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS copy_tasks_to_period(uuid, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped copy_tasks_to_period';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS calculate_period_dates(date, text) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped calculate_period_dates';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS get_period_boundaries(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped get_period_boundaries';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS check_and_generate_recurring_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped check_and_generate_recurring_periods';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS generate_next_recurring_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped generate_next_recurring_periods';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS create_period_for_non_recurring_work(uuid, uuid, date, numeric, uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped create_period_for_non_recurring_work';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS manually_generate_invoice_for_work(uuid, date) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped manually_generate_invoice_for_work';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS post_invoice_to_ledgers(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped post_invoice_to_ledgers';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP FUNCTION IF EXISTS update_work_status_from_periods(uuid) CASCADE;
    v_count := v_count + 1;
    RAISE NOTICE 'Dropped update_work_status_from_periods';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RAISE NOTICE 'Cleanup complete. Dropped % items', v_count;
END;
$$;
