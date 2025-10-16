/*
  # Intelligent Period Generation System

  ## Overview
  This migration implements smart period generation that calculates how many periods
  should exist between work start date and current date based on:
  - Recurrence pattern (monthly, quarterly, half_yearly, yearly)
  - Period type (previous_period, current_period, next_period)
  - Work start date
  - Current date

  ## Examples
  - Monthly + previous_period: If work starts Aug 5, 2025 and today is Oct 16, 2025
    Periods needed: July 2025, August 2025, September 2025 (3 periods)
  
  - Monthly + current_period: If work starts Aug 5, 2025 and today is Oct 16, 2025
    Periods needed: August 2025, September 2025, October 2025 (3 periods)

  ## Changes
  1. New function to calculate all required periods between two dates
  2. Updated trigger to generate ALL required periods on work creation
  3. Function to backfill missing periods for existing works
*/

-- ============================================================================
-- Drop old trigger
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_create_first_recurring_period ON works;
DROP FUNCTION IF EXISTS create_first_recurring_period() CASCADE;

-- ============================================================================
-- Function: Calculate period boundaries based on recurrence pattern
-- ============================================================================
CREATE OR REPLACE FUNCTION get_period_boundaries(
  p_date DATE,
  p_recurrence_pattern TEXT,
  OUT period_start DATE,
  OUT period_end DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      period_start := DATE_TRUNC('month', p_date)::DATE;
      period_end := (DATE_TRUNC('month', p_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    WHEN 'quarterly' THEN
      period_start := DATE_TRUNC('quarter', p_date)::DATE;
      period_end := (DATE_TRUNC('quarter', p_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    
    WHEN 'half_yearly' THEN
      -- H1: Jan-Jun, H2: Jul-Dec
      IF EXTRACT(MONTH FROM p_date) <= 6 THEN
        period_start := DATE_TRUNC('year', p_date)::DATE;
        period_end := (DATE_TRUNC('year', p_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      ELSE
        period_start := (DATE_TRUNC('year', p_date) + INTERVAL '6 months')::DATE;
        period_end := (DATE_TRUNC('year', p_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      END IF;
    
    WHEN 'yearly' THEN
      -- Assuming FY = Apr to Mar (Indian Financial Year)
      IF EXTRACT(MONTH FROM p_date) >= 4 THEN
        period_start := (DATE_TRUNC('year', p_date) + INTERVAL '3 months')::DATE;
        period_end := (DATE_TRUNC('year', p_date) + INTERVAL '1 year' + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      ELSE
        period_start := (DATE_TRUNC('year', p_date) - INTERVAL '9 months')::DATE;
        period_end := (DATE_TRUNC('year', p_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      END IF;
    
    ELSE
      -- Default to monthly
      period_start := DATE_TRUNC('month', p_date)::DATE;
      period_end := (DATE_TRUNC('month', p_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  END CASE;
END;
$$;

-- ============================================================================
-- Function: Generate period name from dates
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_period_name(
  p_start_date DATE,
  p_end_date DATE,
  p_recurrence_pattern TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_name TEXT;
BEGIN
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      v_name := TO_CHAR(p_start_date, 'Month YYYY');
    
    WHEN 'quarterly' THEN
      v_name := 'Q' || TO_CHAR(p_start_date, 'Q YYYY');
    
    WHEN 'half_yearly' THEN
      v_name := 'H' || CEIL(EXTRACT(MONTH FROM p_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(p_start_date, 'YYYY');
    
    WHEN 'yearly' THEN
      v_name := 'FY ' || TO_CHAR(p_start_date, 'YYYY-') || TO_CHAR(p_end_date, 'YY');
    
    ELSE
      v_name := TO_CHAR(p_start_date, 'Month YYYY');
  END CASE;
  
  RETURN TRIM(v_name);
END;
$$;

-- ============================================================================
-- Function: Generate all required periods for a work
-- ============================================================================
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
  v_max_iterations INTEGER := 200; -- Safety limit
  v_iteration INTEGER := 0;
BEGIN
  -- Determine the first period based on period_type
  CASE p_period_type
    WHEN 'previous_period' THEN
      -- First period is the one BEFORE the period containing start_date
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(p_start_date, p_recurrence_pattern);
      
      -- Go back one period
      CASE p_recurrence_pattern
        WHEN 'monthly' THEN
          v_first_period_start := v_first_period_start - INTERVAL '1 month';
        WHEN 'quarterly' THEN
          v_first_period_start := v_first_period_start - INTERVAL '3 months';
        WHEN 'half_yearly' THEN
          v_first_period_start := v_first_period_start - INTERVAL '6 months';
        WHEN 'yearly' THEN
          v_first_period_start := v_first_period_start - INTERVAL '1 year';
        ELSE
          v_first_period_start := v_first_period_start - INTERVAL '1 month';
      END CASE;
      
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(v_first_period_start, p_recurrence_pattern);
    
    WHEN 'next_period' THEN
      -- First period is the one AFTER the period containing start_date
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(p_start_date, p_recurrence_pattern);
      
      -- Go forward one period
      CASE p_recurrence_pattern
        WHEN 'monthly' THEN
          v_first_period_start := v_first_period_start + INTERVAL '1 month';
        WHEN 'quarterly' THEN
          v_first_period_start := v_first_period_start + INTERVAL '3 months';
        WHEN 'half_yearly' THEN
          v_first_period_start := v_first_period_start + INTERVAL '6 months';
        WHEN 'yearly' THEN
          v_first_period_start := v_first_period_start + INTERVAL '1 year';
        ELSE
          v_first_period_start := v_first_period_start + INTERVAL '1 month';
      END CASE;
      
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(v_first_period_start, p_recurrence_pattern);
    
    ELSE -- 'current_period' or NULL
      -- First period is the one containing start_date
      SELECT period_start, period_end INTO v_first_period_start, v_first_period_end
      FROM get_period_boundaries(p_start_date, p_recurrence_pattern);
  END CASE;

  -- Now generate all periods from first_period_start up to current date
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
-- Function: Trigger to auto-generate periods on work creation
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
  
  -- Generate all required periods
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
-- Create trigger
-- ============================================================================
CREATE TRIGGER trigger_auto_generate_recurring_periods
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_recurring_periods();

-- ============================================================================
-- Function: Manually backfill missing periods for existing work
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
  
  -- Generate all missing periods
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
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_period_boundaries TO authenticated;
GRANT EXECUTE ON FUNCTION generate_period_name TO authenticated;
GRANT EXECUTE ON FUNCTION generate_all_required_periods TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_missing_periods TO authenticated;
