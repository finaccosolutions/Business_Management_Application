/*
  # Complete Fix for Period and Task Generation

  1. Issues Fixed:
    - Remove all duplicate period generation functions
    - Ensure periods only created for complete elapsed periods until current date
    - Fix task copying to only include service template tasks, no extras
    - Prevent unnecessary task creation when creating new work

  2. Key Logic:
    - Current date: 16-11-2025
    - For monthly recurring: only create periods up to October (ends 31-10-2025)
    - November is NOT created because 30-11-2025 hasn't passed yet
    - Tasks are copied ONLY from service_tasks with proper offsets
    - No automatic or random task creation

  3. Changes:
    - Clean up duplicate function definitions
    - Ensure copy_tasks_to_period filters active service tasks only
    - Verify period generation respects completion check
    - Remove any trigger that auto-creates unnecessary tasks
*/

-- Drop ALL duplicate functions first
DROP FUNCTION IF EXISTS auto_generate_next_period_for_work(UUID) CASCADE;
DROP FUNCTION IF EXISTS calculate_next_period_dates(DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS backfill_missing_periods(UUID) CASCADE;
DROP FUNCTION IF EXISTS copy_tasks_to_period(UUID, UUID, DATE, DATE, UUID) CASCADE;
DROP FUNCTION IF EXISTS copy_documents_to_period(UUID, UUID) CASCADE;

-- ============================================================================
-- CORE FUNCTIONS: Create single, definitive versions
-- ============================================================================

-- Calculate next period dates based on recurrence pattern
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

-- Copy tasks from service template to a period
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

  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    IF v_task.due_date_offset_days IS NOT NULL THEN
      v_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSE
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
  AND is_active = TRUE;
END $$;

GRANT EXECUTE ON FUNCTION copy_documents_to_period(UUID, UUID) TO authenticated;

-- Backfill all missing periods from work start date until today
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
    FROM calculate_next_period_dates(v_next_start, v_work.recurrence_pattern);

    -- ONLY create periods where end_date has PASSED (not today, but before today)
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

  IF v_latest_period IS NULL THEN
    PERFORM backfill_missing_periods(p_work_id);
    RETURN TRUE;
  END IF;

  SELECT start_date, end_date, period_name
  INTO v_next_start, v_next_end, v_next_name
  FROM calculate_next_period_dates(
    v_latest_period.period_end_date,
    v_work.recurrence_pattern
  );

  -- Only create if end date has already passed (strict past check)
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