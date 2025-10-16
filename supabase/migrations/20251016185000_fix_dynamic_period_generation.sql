/*
  # Dynamic Period Generation Fix

  ## Problem
  Current system generates periods based on period_type (previous/current/next),
  which creates confusion and unnecessary periods.

  ## Solution
  Generate periods dynamically based ONLY on:
  - Work start date
  - Current date
  - Recurrence pattern

  ## Logic
  - If work starts in October 2025 and today is October 2025 → 1 period (October)
  - If work starts in August 2025 and today is October 2025 → 3 periods (Aug, Sep, Oct)
  - If work starts in January 2025 and today is October 2025 → 10 periods (Jan to Oct)

  ## Changes
  1. Simplified generate_all_required_periods function
  2. Removes period_type logic for initial generation
  3. Always starts from period containing work start date
  4. Generates up to current date only
*/

-- ============================================================================
-- Drop and recreate the period generation function
-- ============================================================================
DROP FUNCTION IF EXISTS generate_all_required_periods(UUID, UUID, DATE, TEXT, TEXT, NUMERIC, UUID) CASCADE;

CREATE OR REPLACE FUNCTION generate_all_required_periods(
  p_work_id UUID,
  p_service_id UUID,
  p_start_date DATE,
  p_recurrence_pattern TEXT,
  p_billing_amount NUMERIC,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_first_period_start DATE;
  v_first_period_end DATE;
  v_current_period_start DATE;
  v_current_period_end DATE;
  v_period_name TEXT;
  v_current_date DATE := CURRENT_DATE;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_periods_created INTEGER := 0;
  v_loop_date DATE;
  v_max_iterations INTEGER := 200; -- Safety limit
  v_iteration INTEGER := 0;
BEGIN
  -- Start from the period containing the work start date
  SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
  FROM get_period_boundaries(p_start_date, p_recurrence_pattern);

  -- Generate all periods from start period up to current date
  v_loop_date := v_first_period_start;

  WHILE v_loop_date <= v_current_date AND v_iteration < v_max_iterations LOOP
    v_iteration := v_iteration + 1;

    -- Get period boundaries for this loop date
    SELECT period_start, period_end INTO v_current_period_start, v_current_period_end
    FROM get_period_boundaries(v_loop_date, p_recurrence_pattern);

    -- Check if period already exists
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_current_period_start
    ) THEN
      -- Generate period name
      v_period_name := generate_period_name(v_current_period_start, v_current_period_end, p_recurrence_pattern);

      -- Create period
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
        v_period_name,
        v_current_period_start,
        v_current_period_end,
        p_billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

      -- Copy tasks to this period
      v_task_count := copy_tasks_to_period(
        v_new_period_id,
        p_service_id,
        v_current_period_end,
        p_assigned_to
      );

      -- Update task count
      UPDATE work_recurring_instances
      SET total_tasks = v_task_count
      WHERE id = v_new_period_id;

      -- Copy documents
      PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

      v_periods_created := v_periods_created + 1;
    END IF;

    -- Move to next period
    CASE p_recurrence_pattern
      WHEN 'monthly' THEN
        v_loop_date := v_loop_date + INTERVAL '1 month';
      WHEN 'quarterly' THEN
        v_loop_date := v_loop_date + INTERVAL '3 months';
      WHEN 'half_yearly' THEN
        v_loop_date := v_loop_date + INTERVAL '6 months';
      WHEN 'yearly' THEN
        v_loop_date := v_loop_date + INTERVAL '1 year';
      ELSE
        v_loop_date := v_loop_date + INTERVAL '1 month';
    END CASE;
  END LOOP;

  RETURN v_periods_created;
END;
$$;

-- ============================================================================
-- Update trigger function to use new signature (removed period_type parameter)
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_generate_recurring_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_periods_created INTEGER;
BEGIN
  -- Only for new recurring works
  IF TG_OP != 'INSERT' OR NEW.is_recurring != TRUE THEN
    RETURN NEW;
  END IF;

  -- Ensure required fields are present
  IF NEW.start_date IS NULL OR NEW.recurrence_pattern IS NULL THEN
    RETURN NEW;
  END IF;

  -- Generate all required periods (no period_type needed)
  v_periods_created := generate_all_required_periods(
    NEW.id,
    NEW.service_id,
    NEW.start_date,
    NEW.recurrence_pattern,
    NEW.billing_amount,
    NEW.assigned_to
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Update backfill function to use new signature
-- ============================================================================
CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id UUID)
RETURNS TABLE (
  periods_created INTEGER,
  message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_work RECORD;
  v_count INTEGER;
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
  AND is_recurring = TRUE;

  IF v_work IS NULL THEN
    periods_created := 0;
    message := 'Work not found or is not recurring';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Generate all missing periods (no period_type needed)
  v_count := generate_all_required_periods(
    v_work.id,
    v_work.service_id,
    v_work.start_date,
    v_work.recurrence_pattern,
    v_work.billing_amount,
    v_work.assigned_to
  );

  periods_created := v_count;
  message := 'Successfully created ' || v_count || ' period(s)';
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION generate_all_required_periods(UUID, UUID, DATE, TEXT, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_missing_periods(UUID) TO authenticated;
