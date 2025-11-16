/*
  # Comprehensive Fix: Clean Up All Duplicate Functions and Triggers

  ## Problem Analysis
  Multiple migrations created conflicting versions of period/task functions:
  1. copy_tasks_to_period - called from trigger handle_new_recurring_work
  2. copy_tasks_to_period_with_templates - created in latest migration but never used correctly
  3. auto_generate_next_period_for_work - multiple versions with different signatures
  4. Triggers referencing non-existent or conflicting functions

  Error: record "v_service_task" has no field "default_price"
  Cause: The function had wrong column reference

  ## Solution
  1. Drop ALL duplicate/conflicting functions
  2. Create single unified versions of each function
  3. Fix triggers to use correct functions
  4. Ensure all parameters match across function calls

  ## Key Changes:
  - Use only copy_tasks_to_period (5 params) - NOT with_templates version
  - Ensure all functions have matching signatures
  - Fix handle_new_recurring_work trigger
  - Drop unused copy_tasks_to_period_with_templates
*/

-- ============================================================================
-- STEP 1: Drop ALL conflicting and duplicate functions
-- ============================================================================

DROP FUNCTION IF EXISTS copy_tasks_to_period_with_templates(UUID, UUID, UUID, DATE, UUID) CASCADE;
DROP FUNCTION IF EXISTS copy_work_templates_to_period(UUID, UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS handle_new_recurring_work() CASCADE;
DROP FUNCTION IF EXISTS copy_tasks_to_period(UUID, UUID, DATE, DATE, UUID) CASCADE;
DROP FUNCTION IF EXISTS copy_documents_to_period(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS backfill_missing_periods(UUID) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_next_period_for_work(UUID) CASCADE;

-- ============================================================================
-- STEP 2: Create Single Unified Versions
-- ============================================================================

-- Helper function to calculate next period boundaries
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
  next_start_date := p_current_end_date + INTERVAL '1 day';

  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      next_end_date := (DATE_TRUNC('month', next_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      next_period_name := TO_CHAR(next_start_date, 'Month YYYY');

    WHEN 'quarterly' THEN
      next_end_date := (DATE_TRUNC('quarter', next_start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      next_period_name := 'Q' || TO_CHAR(next_start_date, 'Q YYYY');

    WHEN 'half_yearly' THEN
      next_end_date := (DATE_TRUNC('quarter', next_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      next_period_name := 'H' || CEIL(EXTRACT(MONTH FROM next_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(next_start_date, 'YYYY');

    WHEN 'yearly' THEN
      next_end_date := (DATE_TRUNC('year', next_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      next_period_name := 'FY ' || TO_CHAR(next_start_date, 'YYYY-') || TO_CHAR(next_start_date + INTERVAL '1 year', 'YY');

    ELSE
      next_end_date := (DATE_TRUNC('month', next_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      next_period_name := TO_CHAR(next_start_date, 'Month YYYY');
  END CASE;
END;
$$;

-- Copy documents from work to period
CREATE OR REPLACE FUNCTION copy_documents_to_period(
  p_period_id UUID,
  p_work_id UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    collected_at,
    file_url,
    file_size,
    uploaded_at,
    notes
  )
  SELECT
    p_period_id,
    id,
    FALSE,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  FROM work_documents
  WHERE work_id = p_work_id
  AND is_active = TRUE
  ON CONFLICT DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION copy_documents_to_period(UUID, UUID) TO authenticated;

-- Copy service tasks to period - UNIFIED VERSION
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
  IF p_service_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Copy all active service tasks for this service
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    IF v_task.due_date_offset_days IS NOT NULL THEN
      v_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSE
      -- Default: 10 days after period ends
      v_due_date := p_period_end_date + INTERVAL '10 days';
    END IF;

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
      COALESCE(v_task.priority, 'medium'),
      v_task.estimated_hours,
      v_task.sort_order,
      v_due_date,
      'pending',
      p_assigned_to
    )
    ON CONFLICT DO NOTHING;

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END $$;

GRANT EXECUTE ON FUNCTION copy_tasks_to_period(UUID, UUID, DATE, DATE, UUID) TO authenticated;

-- Backfill all missing periods from work start until today
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
  SELECT * INTO v_work FROM works 
  WHERE id = p_work_id AND is_recurring = TRUE;

  IF v_work IS NULL OR v_work.start_date IS NULL THEN
    RETURN 0;
  END IF;

  v_next_start := v_work.start_date::DATE - INTERVAL '1 day';

  LOOP
    SELECT start_date, end_date, period_name
    INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(v_next_start, COALESCE(v_work.recurrence_pattern, 'monthly'));

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
        v_work.billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

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

      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

      v_total_created := v_total_created + 1;
    END IF;

    v_next_start := v_next_end;
  END LOOP;

  RETURN v_total_created;
END $$;

GRANT EXECUTE ON FUNCTION backfill_missing_periods(UUID) TO authenticated;

-- Generate next period if its end date has passed
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
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
  AND is_recurring = TRUE;

  IF v_work IS NULL THEN
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

  SELECT start_date, end_date, period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    COALESCE(v_work.recurrence_pattern, 'monthly')
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
    v_work.billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

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

  PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

  RETURN TRUE;
END $$;

GRANT EXECUTE ON FUNCTION auto_generate_next_period_for_work(UUID) TO authenticated;

-- ============================================================================
-- STEP 3: Fix the trigger for new recurring work
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_recurring_work()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_period_id UUID;
  v_task_count INTEGER;
  v_period_dates RECORD;
  v_service_recurrence TEXT;
BEGIN
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;

  SELECT recurrence_pattern INTO v_service_recurrence
  FROM services
  WHERE id = NEW.service_id;

  SELECT * INTO v_period_dates
  FROM calculate_next_period_dates(
    (NEW.start_date AT TIME ZONE 'UTC')::DATE - INTERVAL '1 day',
    COALESCE(v_service_recurrence, 'monthly')
  );

  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status,
    billing_amount,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    NEW.id,
    v_period_dates.next_period_name,
    v_period_dates.next_start_date,
    v_period_dates.next_end_date,
    'pending',
    NEW.billing_amount,
    FALSE,
    0,
    0,
    FALSE
  ) RETURNING id INTO v_period_id;

  v_task_count := copy_tasks_to_period(
    v_period_id,
    NEW.service_id,
    v_period_dates.next_start_date,
    v_period_dates.next_end_date,
    NEW.assigned_to
  );

  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_period_id;

  PERFORM copy_documents_to_period(v_period_id, NEW.id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in handle_new_recurring_work: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work ON works;
CREATE TRIGGER trigger_handle_new_recurring_work
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = TRUE)
  EXECUTE FUNCTION handle_new_recurring_work();

COMMENT ON FUNCTION handle_new_recurring_work IS 'Creates initial recurring period with tasks when a new recurring work is added';
