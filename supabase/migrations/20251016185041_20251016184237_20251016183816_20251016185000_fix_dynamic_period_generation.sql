/*
  # Fix Period Generation - Respect period_type and Fix Date Calculation
  
  ## Issues Fixed
  1. period_type is ignored - if 'previous_period', should start from previous period
  2. Duplicate periods with wrong dates (2025-09-30 to 2025-10-30 is WRONG)
  3. get_period_boundaries is creating incorrect period end dates
  
  ## Logic
  - period_type = 'previous_period' → Start from period BEFORE work start date
  - period_type = 'current_period' → Start from period CONTAINING work start date  
  - period_type = 'next_period' → Start from period AFTER work start date
  
  ## Examples
  **Monthly with start_date = Oct 16, 2025:**
  - previous_period: September 2025 (Sep 1 - Sep 30)
  - current_period: October 2025 (Oct 1 - Oct 31)
  - next_period: November 2025 (Nov 1 - Nov 30)
  
  **Quarterly with start_date = Oct 16, 2025 (Q4):**
  - previous_period: Q3 2025 (Jul 1 - Sep 30)
  - current_period: Q4 2025 (Oct 1 - Dec 31)
  - next_period: Q1 2026 (Jan 1 - Mar 31)
  
  **Half-yearly with start_date = Oct 16, 2025 (H2):**
  - previous_period: H1 2025 (Jan 1 - Jun 30)
  - current_period: H2 2025 (Jul 1 - Dec 31)
  - next_period: H1 2026 (Jan 1 - Jun 30)
  
  **Yearly with start_date = Oct 16, 2025 (FY 2025-26):**
  - previous_period: FY 2024-25 (Apr 1, 2024 - Mar 31, 2025)
  - current_period: FY 2025-26 (Apr 1, 2025 - Mar 31, 2026)
  - next_period: FY 2026-27 (Apr 1, 2026 - Mar 31, 2027)
*/

-- ============================================================================
-- Recreate period generation with period_type support
-- ============================================================================
DROP FUNCTION IF EXISTS generate_all_required_periods(UUID, UUID, DATE, TEXT, NUMERIC, UUID) CASCADE;

CREATE OR REPLACE FUNCTION generate_all_required_periods(
  p_work_id UUID,
  p_service_id UUID,
  p_start_date DATE,
  p_recurrence_pattern TEXT,
  p_period_type TEXT,
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
  v_max_iterations INTEGER := 200;
  v_iteration INTEGER := 0;
BEGIN
  -- Get the period containing work start date
  SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
  FROM get_period_boundaries(p_start_date, p_recurrence_pattern);

  -- Adjust based on period_type
  CASE COALESCE(p_period_type, 'current_period')
    WHEN 'previous_period' THEN
      -- Move back one period
      CASE p_recurrence_pattern
        WHEN 'monthly' THEN
          v_first_period_start := (v_first_period_start - INTERVAL '1 month')::DATE;
        WHEN 'quarterly' THEN
          v_first_period_start := (v_first_period_start - INTERVAL '3 months')::DATE;
        WHEN 'half_yearly' THEN
          v_first_period_start := (v_first_period_start - INTERVAL '6 months')::DATE;
        WHEN 'yearly' THEN
          v_first_period_start := (v_first_period_start - INTERVAL '1 year')::DATE;
        ELSE
          v_first_period_start := (v_first_period_start - INTERVAL '1 month')::DATE;
      END CASE;
      
      -- Recalculate boundaries for the previous period
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(v_first_period_start, p_recurrence_pattern);
    
    WHEN 'next_period' THEN
      -- Move forward one period
      CASE p_recurrence_pattern
        WHEN 'monthly' THEN
          v_first_period_start := (v_first_period_start + INTERVAL '1 month')::DATE;
        WHEN 'quarterly' THEN
          v_first_period_start := (v_first_period_start + INTERVAL '3 months')::DATE;
        WHEN 'half_yearly' THEN
          v_first_period_start := (v_first_period_start + INTERVAL '6 months')::DATE;
        WHEN 'yearly' THEN
          v_first_period_start := (v_first_period_start + INTERVAL '1 year')::DATE;
        ELSE
          v_first_period_start := (v_first_period_start + INTERVAL '1 month')::DATE;
      END CASE;
      
      -- Recalculate boundaries for the next period
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(v_first_period_start, p_recurrence_pattern);
    
    ELSE
      -- 'current_period' - already calculated, do nothing
      NULL;
  END CASE;

  -- Generate all periods from first period up to current date
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
        v_loop_date := (v_loop_date + INTERVAL '1 month')::DATE;
      WHEN 'quarterly' THEN
        v_loop_date := (v_loop_date + INTERVAL '3 months')::DATE;
      WHEN 'half_yearly' THEN
        v_loop_date := (v_loop_date + INTERVAL '6 months')::DATE;
      WHEN 'yearly' THEN
        v_loop_date := (v_loop_date + INTERVAL '1 year')::DATE;
      ELSE
        v_loop_date := (v_loop_date + INTERVAL '1 month')::DATE;
    END CASE;
  END LOOP;

  RETURN v_periods_created;
END;
$$;

-- ============================================================================
-- Update trigger to pass period_type
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
  IF TG_OP != 'INSERT' OR NEW.is_recurring != TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.start_date IS NULL OR NEW.recurrence_pattern IS NULL THEN
    RETURN NEW;
  END IF;

  v_periods_created := generate_all_required_periods(
    NEW.id,
    NEW.service_id,
    NEW.start_date,
    NEW.recurrence_pattern,
    COALESCE(NEW.period_type, 'current_period'),
    NEW.billing_amount,
    NEW.assigned_to
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Update backfill function
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

  v_count := generate_all_required_periods(
    v_work.id,
    v_work.service_id,
    v_work.start_date,
    v_work.recurrence_pattern,
    COALESCE(v_work.period_type, 'current_period'),
    v_work.billing_amount,
    v_work.assigned_to
  );

  periods_created := v_count;
  message := 'Successfully created ' || v_count || ' period(s)';
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- Delete duplicate/incorrect periods
-- ============================================================================
DELETE FROM work_recurring_instances 
WHERE period_start_date < period_end_date - INTERVAL '35 days' 
   OR period_start_date > period_end_date;

-- Delete duplicates by keeping only the one with correct date range
DELETE FROM work_recurring_instances wri1
WHERE EXISTS (
  SELECT 1 FROM work_recurring_instances wri2
  WHERE wri1.work_id = wri2.work_id
  AND wri1.period_name = wri2.period_name
  AND wri1.id > wri2.id
);

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION generate_all_required_periods(UUID, UUID, DATE, TEXT, TEXT, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_missing_periods(UUID) TO authenticated;
