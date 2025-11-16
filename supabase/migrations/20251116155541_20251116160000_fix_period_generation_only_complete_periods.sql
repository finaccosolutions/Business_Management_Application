/*
  # Fix Period Generation - Only Generate Complete Periods Until Today

  1. Changes:
    - Fix calculate_next_period_dates to properly determine period boundaries
    - Rewrite backfill_missing_periods to only create periods with end_date < today
    - Fix auto_generate_next_period_for_work to respect period completion check
    - Remove old duplicate auto_generate_next_period_for_work function

  2. Key Logic:
    - For monthly: only create periods whose last date has passed (end_date < CURRENT_DATE)
    - Example: On 16-11-2025, create periods up to October (ends 31-10-2025)
    - November period is NOT created because it ends 30-11-2025 (future date)
    
  3. Security:
    - Maintains existing RLS policies
    - Functions already have proper SECURITY DEFINER settings

  4. Notes:
    - Preserves all existing periods and their statuses
    - No data loss or deletion
    - Fixes duplicate period creation issue
*/

-- Drop old duplicate functions to avoid conflicts
DROP FUNCTION IF EXISTS auto_generate_next_period_for_work(UUID) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS backfill_missing_periods(UUID) CASCADE;

-- ============================================================================
-- STEP 1: Recreate calculate_next_period_dates with correct logic
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_next_period_dates(
  p_current_end_date DATE,
  p_recurrence_pattern TEXT,
  OUT next_start_date DATE,
  OUT next_end_date DATE,
  OUT next_period_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Next period starts day after current period ends
  next_start_date := p_current_end_date + INTERVAL '1 day';

  -- Calculate end date based on recurrence pattern
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      -- End date is last day of the month
      next_end_date := (DATE_TRUNC('month', next_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      next_period_name := TO_CHAR(next_start_date, 'Month YYYY');

    WHEN 'quarterly' THEN
      -- End date is last day of quarter
      next_end_date := (DATE_TRUNC('quarter', next_start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      next_period_name := 'Q' || TO_CHAR(next_start_date, 'Q YYYY');

    WHEN 'half_yearly' THEN
      -- End date is last day of half year
      next_end_date := (DATE_TRUNC('quarter', next_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      next_period_name := 'H' || CEIL(EXTRACT(MONTH FROM next_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(next_start_date, 'YYYY');

    WHEN 'yearly' THEN
      -- End date is last day of year
      next_end_date := (DATE_TRUNC('year', next_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      next_period_name := 'FY ' || TO_CHAR(next_start_date, 'YYYY-') || TO_CHAR(next_start_date + INTERVAL '1 year', 'YY');

    ELSE
      -- Default to monthly
      next_end_date := (DATE_TRUNC('month', next_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      next_period_name := TO_CHAR(next_start_date, 'Month YYYY');
  END CASE;
END;
$$;

-- ============================================================================
-- STEP 2: Recreate backfill_missing_periods with correct completion check
-- ============================================================================

CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_work RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_period_exists BOOLEAN;
  v_task_count INTEGER := 0;
  v_total_created INTEGER := 0;
  v_new_period_id UUID;
BEGIN
  -- Get the work
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;

  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;

  -- Start from one day before work start date to get first period
  v_next_start := v_work.start_date::DATE - INTERVAL '1 day';

  -- Loop to generate all periods up to today
  WHILE TRUE LOOP
    -- Calculate next period dates
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_next_start, v_work.recurrence_pattern);

    -- CRITICAL: Only create periods whose end_date has already passed
    -- This ensures we only create COMPLETE periods
    IF v_next_end >= CURRENT_DATE THEN
      EXIT;
    END IF;

    -- Check if period already exists
    SELECT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_next_start
    ) INTO v_period_exists;

    IF NOT v_period_exists THEN
      -- Create the period
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
        v_work.billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

      -- Copy tasks from service template if available
      IF v_work.service_id IS NOT NULL THEN
        v_task_count := copy_tasks_to_period(
          v_new_period_id,
          v_work.service_id,
          v_next_start,
          v_next_end,
          v_work.assigned_to
        );

        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_new_period_id;
      END IF;

      -- Copy documents
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

      v_total_created := v_total_created + 1;
    END IF;

    -- Move to next period
    v_next_start := v_next_end;
  END LOOP;

  RETURN v_total_created;
END $$;

GRANT EXECUTE ON FUNCTION backfill_missing_periods(UUID) TO authenticated;

-- ============================================================================
-- STEP 3: Recreate auto_generate_next_period_for_work with correct logic
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_next_period_for_work(p_work_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_work RECORD;
  v_latest_period RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_period_exists BOOLEAN;
BEGIN
  -- Get the work
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
  AND is_recurring = TRUE;

  -- Return false if work not found or not recurring
  IF v_work IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get latest period for this work
  SELECT * INTO v_latest_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY period_end_date DESC
  LIMIT 1;

  -- If no period exists, use backfill to create from start date
  IF v_latest_period IS NULL THEN
    PERFORM backfill_missing_periods(p_work_id);
    RETURN TRUE;
  END IF;

  -- Calculate next period dates based on latest period
  SELECT start_date, end_date, period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    v_work.recurrence_pattern
  );

  -- CRITICAL: Only create next period if its end date has already passed
  IF v_next_end >= CURRENT_DATE THEN
    RETURN FALSE;
  END IF;

  -- Check if period already exists
  SELECT EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = v_next_start
  ) INTO v_period_exists;

  IF v_period_exists THEN
    RETURN FALSE;
  END IF;

  -- Create the new period
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
    v_work.billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks from service template if available
  IF v_work.service_id IS NOT NULL THEN
    v_task_count := copy_tasks_to_period(
      v_new_period_id,
      v_work.service_id,
      v_next_start,
      v_next_end,
      v_work.assigned_to
    );

    UPDATE work_recurring_instances
    SET total_tasks = v_task_count
    WHERE id = v_new_period_id;
  END IF;

  -- Copy documents
  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

  RETURN TRUE;
END $$;

GRANT EXECUTE ON FUNCTION auto_generate_next_period_for_work(UUID) TO authenticated;

-- ============================================================================
-- STEP 4: Recreate copy_tasks_to_period with proper signature
-- ============================================================================

DROP FUNCTION IF EXISTS copy_tasks_to_period(UUID, UUID, DATE, DATE, UUID) CASCADE;

CREATE OR REPLACE FUNCTION copy_tasks_to_period(
  p_period_id UUID,
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
BEGIN
  -- Copy all active service tasks to this period
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Calculate due date: period_end_date + offset_days
    IF v_task.due_date_offset_days IS NOT NULL THEN
      v_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSE
      -- Default: 10 days after period ends
      v_due_date := p_period_end_date + INTERVAL '10 days';
    END IF;

    -- Insert task for this period
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      due_date,
      status,
      assigned_to
    ) VALUES (
      p_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_due_date,
      'pending',
      p_assigned_to
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END $$;

GRANT EXECUTE ON FUNCTION copy_tasks_to_period(UUID, UUID, DATE, DATE, UUID) TO authenticated;
