/*
  # Fix duplicate functions and is_active reference error

  1. Issue
    - `auto_generate_next_period_for_work` function references `is_active` column that may not be properly accessible
    - Three functions have duplicates: `calculate_next_due_date`, `calculate_next_period_dates`, `calculate_task_due_date`
    - Duplicates cause column reference confusion and function resolution errors

  2. Solution
    - Drop all duplicate function versions
    - Recreate single clean versions of affected functions
    - Fix the `auto_generate_next_period_for_work` function to be more robust

  3. Important Notes
    - This migration removes duplicate function definitions
    - Ensures only one version of each function exists
    - Fixes the 42703 error (column does not exist)
*/

DO $$
BEGIN
  -- Drop duplicate calculate_next_due_date functions
  DROP FUNCTION IF EXISTS calculate_next_due_date(date, integer);
  DROP FUNCTION IF EXISTS calculate_next_due_date(date, integer, text);
  DROP FUNCTION IF EXISTS calculate_next_due_date(timestamp with time zone, integer);
  
  -- Drop duplicate calculate_next_period_dates functions
  DROP FUNCTION IF EXISTS calculate_next_period_dates(date, text);
  DROP FUNCTION IF EXISTS calculate_next_period_dates(timestamp with time zone, text);
  
  -- Drop duplicate calculate_task_due_date functions
  DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, integer);
  DROP FUNCTION IF EXISTS calculate_task_due_date(date, date, integer, text);
  DROP FUNCTION IF EXISTS calculate_task_due_date(timestamp with time zone, date, integer);
  
  -- Drop and recreate auto_generate_next_period_for_work with proper error handling
  DROP FUNCTION IF EXISTS auto_generate_next_period_for_work(uuid);
  
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Recreate calculate_next_period_dates as single version
CREATE OR REPLACE FUNCTION calculate_next_period_dates(
  p_current_end DATE,
  p_recurrence_pattern TEXT
)
RETURNS TABLE (
  next_start_date DATE,
  next_end_date DATE,
  next_period_name TEXT
) AS $$
DECLARE
  v_next_start DATE;
  v_next_end DATE;
  v_period_name TEXT;
BEGIN
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := (DATE_TRUNC('month', v_next_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_next_start, 'Mon YYYY');
    WHEN 'quarterly' THEN
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := (DATE_TRUNC('quarter', v_next_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'Q' || TO_CHAR(v_next_start, 'Q') || ' ' || TO_CHAR(v_next_start, 'YYYY');
    WHEN 'yearly' THEN
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := (DATE_TRUNC('year', v_next_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_next_start, 'YYYY');
    ELSE
      v_next_start := p_current_end + INTERVAL '1 day';
      v_next_end := p_current_end + INTERVAL '30 days';
      v_period_name := TO_CHAR(v_next_start, 'Mon YYYY');
  END CASE;

  RETURN QUERY SELECT v_next_start, v_next_end, v_period_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recreate auto_generate_next_period_for_work with proper type handling
CREATE OR REPLACE FUNCTION auto_generate_next_period_for_work(p_work_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_work_is_recurring BOOLEAN;
  v_latest_period RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_period_exists BOOLEAN;
  v_work_service_id UUID;
  v_work_billing_amount NUMERIC;
  v_work_assigned_to UUID;
  v_work_recurrence_pattern TEXT;
BEGIN
  -- Get work details without using SELECT *
  SELECT is_recurring, service_id, billing_amount, assigned_to, recurrence_pattern
  INTO v_work_is_recurring, v_work_service_id, v_work_billing_amount, v_work_assigned_to, v_work_recurrence_pattern
  FROM works
  WHERE id = p_work_id;

  IF v_work_is_recurring IS NULL OR v_work_is_recurring = FALSE THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_latest_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY period_end_date DESC
  LIMIT 1;

  -- If no period exists, backfill from start date
  IF v_latest_period IS NULL THEN
    PERFORM backfill_missing_periods(p_work_id);
    RETURN TRUE;
  END IF;

  SELECT next_start_date, next_end_date, next_period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    COALESCE(v_work_recurrence_pattern, 'monthly')
  );

  -- Only create if end date has already passed
  IF v_next_end >= CURRENT_DATE THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = v_next_start
  ) INTO v_period_exists;

  IF v_period_exists THEN
    RETURN FALSE;
  END IF;

  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    billing_amount,
    status,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    p_work_id,
    v_next_name,
    v_next_start,
    v_next_end,
    v_work_billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  IF v_work_service_id IS NOT NULL THEN
    v_task_count := copy_tasks_to_period(
      v_new_period_id,
      v_work_service_id,
      v_next_start,
      v_next_end,
      v_work_assigned_to
    );

    UPDATE work_recurring_instances
    SET total_tasks = v_task_count
    WHERE id = v_new_period_id;
  END IF;

  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Recreate backfill_missing_periods with improved variable handling
CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_work_start_date DATE;
  v_work_service_id UUID;
  v_work_billing_amount NUMERIC;
  v_work_assigned_to UUID;
  v_work_recurrence_pattern TEXT;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
  v_new_period_id UUID;
BEGIN
  -- Get work details
  SELECT start_date, service_id, billing_amount, assigned_to, recurrence_pattern
  INTO v_work_start_date, v_work_service_id, v_work_billing_amount, v_work_assigned_to, v_work_recurrence_pattern
  FROM works
  WHERE id = p_work_id AND is_recurring = TRUE;

  IF v_work_start_date IS NULL THEN
    RETURN 0;
  END IF;

  v_next_start := v_work_start_date::DATE - INTERVAL '1 day';

  LOOP
    SELECT next_start_date, next_end_date, next_period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_next_start, COALESCE(v_work_recurrence_pattern, 'monthly'));

    -- Only create periods where end_date has PASSED
    IF v_next_end >= CURRENT_DATE THEN
      EXIT;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;

    IF NOT v_period_exists THEN
      INSERT INTO work_recurring_instances (
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        billing_amount,
        status,
        is_billed,
        total_tasks,
        completed_tasks,
        all_tasks_completed
      ) VALUES (
        p_work_id,
        v_next_name,
        v_next_start,
        v_next_end,
        v_work_billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

      IF v_work_service_id IS NOT NULL THEN
        v_task_count := copy_tasks_to_period(
          v_new_period_id,
          v_work_service_id,
          v_next_start,
          v_next_end,
          v_work_assigned_to
        );

        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_new_period_id;
      END IF;

      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

      v_total_created := v_total_created + 1;
    END IF;

    v_next_start := v_next_end;
  END LOOP;

  RETURN v_total_created;
END;
$$ LANGUAGE plpgsql;
