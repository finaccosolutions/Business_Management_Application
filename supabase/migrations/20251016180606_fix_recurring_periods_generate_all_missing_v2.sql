/*
  # Fix Recurring Periods - Generate All Missing Periods

  ## Problem
  Currently, when a recurring work is created with a past start date, only ONE period is created.
  
  ## Requirements
  When creating a recurring work:
  - If start_date is 5-Aug-2025 and current date is 16-Oct-2025
  - For monthly with "previous period" type:
    - Period 1: July 2025 (because when work started in Aug, July period was needed)
    - Period 2: August 2025 (between start and current)
    - Period 3: September 2025 (current month is Oct, so Sep is needed)
  
  ## Solution
  1. Calculate which periods are needed based on:
     - Pattern type (monthly, quarterly, etc.)
     - Period type (previous_period, current_period, next_period)
     - Start date vs current date
  2. Generate ALL missing periods at once
  3. Each period gets correct start/end dates
  4. Tasks get correct due dates based on period_end_date + offset

  ## Changes
  - Add period_type column to works table (previous_period, current_period, next_period)
  - Rewrite period generation to calculate all missing periods
  - Fix task due date calculation
*/

-- ============================================================================
-- STEP 1: Add period_type column to works table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'period_type'
  ) THEN
    ALTER TABLE works ADD COLUMN period_type TEXT DEFAULT 'previous_period' CHECK (period_type IN ('previous_period', 'current_period', 'next_period'));
    COMMENT ON COLUMN works.period_type IS 'Defines which period the work applies to: previous_period (last month), current_period (this month), next_period (next month)';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Drop existing functions and triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_create_first_recurring_period ON works;
DROP TRIGGER IF EXISTS trigger_generate_all_missing_periods ON works;
DROP FUNCTION IF EXISTS create_first_recurring_period() CASCADE;
DROP FUNCTION IF EXISTS generate_all_missing_periods() CASCADE;
DROP FUNCTION IF EXISTS calculate_period_for_date(DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS generate_period_name(DATE, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS add_period_interval(DATE, TEXT, INTEGER) CASCADE;

-- ============================================================================
-- STEP 3: Helper function to calculate period dates based on reference date
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_period_for_date(
  p_reference_date DATE,
  p_pattern TEXT,
  OUT period_start DATE,
  OUT period_end DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_pattern
    WHEN 'monthly' THEN
      period_start := DATE_TRUNC('month', p_reference_date)::DATE;
      period_end := (DATE_TRUNC('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    WHEN 'quarterly' THEN
      period_start := DATE_TRUNC('quarter', p_reference_date)::DATE;
      period_end := (DATE_TRUNC('quarter', p_reference_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    
    WHEN 'half_yearly' THEN
      -- First half: Jan-Jun, Second half: Jul-Dec
      IF EXTRACT(MONTH FROM p_reference_date) <= 6 THEN
        period_start := DATE_TRUNC('year', p_reference_date)::DATE;
        period_end := (DATE_TRUNC('year', p_reference_date) + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      ELSE
        period_start := (DATE_TRUNC('year', p_reference_date) + INTERVAL '6 months')::DATE;
        period_end := (DATE_TRUNC('year', p_reference_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      END IF;
    
    WHEN 'yearly' THEN
      period_start := DATE_TRUNC('year', p_reference_date)::DATE;
      period_end := (DATE_TRUNC('year', p_reference_date) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    
    ELSE
      -- Default to monthly
      period_start := DATE_TRUNC('month', p_reference_date)::DATE;
      period_end := (DATE_TRUNC('month', p_reference_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  END CASE;
END;
$$;

-- ============================================================================
-- STEP 4: Function to generate period name
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_period_name_v2(
  p_start DATE,
  p_end DATE,
  p_pattern TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_name TEXT;
BEGIN
  CASE p_pattern
    WHEN 'monthly' THEN
      v_name := TO_CHAR(p_start, 'Month YYYY');
    
    WHEN 'quarterly' THEN
      v_name := 'Q' || TO_CHAR(p_start, 'Q YYYY');
    
    WHEN 'half_yearly' THEN
      IF EXTRACT(MONTH FROM p_start) <= 6 THEN
        v_name := 'H1 ' || TO_CHAR(p_start, 'YYYY');
      ELSE
        v_name := 'H2 ' || TO_CHAR(p_start, 'YYYY');
      END IF;
    
    WHEN 'yearly' THEN
      v_name := 'FY ' || TO_CHAR(p_start, 'YYYY-') || TO_CHAR(p_end, 'YY');
    
    ELSE
      v_name := TO_CHAR(p_start, 'Month YYYY');
  END CASE;
  
  RETURN TRIM(v_name);
END;
$$;

-- ============================================================================
-- STEP 5: Function to add interval to date based on pattern
-- ============================================================================

CREATE OR REPLACE FUNCTION add_period_interval(
  p_date DATE,
  p_pattern TEXT,
  p_count INTEGER DEFAULT 1
)
RETURNS DATE
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_pattern
    WHEN 'monthly' THEN
      RETURN p_date + (p_count || ' months')::INTERVAL;
    
    WHEN 'quarterly' THEN
      RETURN p_date + (p_count * 3 || ' months')::INTERVAL;
    
    WHEN 'half_yearly' THEN
      RETURN p_date + (p_count * 6 || ' months')::INTERVAL;
    
    WHEN 'yearly' THEN
      RETURN p_date + (p_count || ' years')::INTERVAL;
    
    ELSE
      RETURN p_date + (p_count || ' months')::INTERVAL;
  END CASE;
END;
$$;

-- ============================================================================
-- STEP 6: Main function to generate all missing periods
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_all_missing_periods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start_date DATE;
  v_current_date DATE;
  v_first_period_date DATE;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_loop_date DATE;
  v_new_period_id UUID;
  v_task_count INTEGER;
  v_periods_created INTEGER := 0;
  v_current_period_start DATE;
  v_current_period_end DATE;
BEGIN
  -- Only for new recurring works
  IF TG_OP != 'INSERT' OR NEW.is_recurring != TRUE OR NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  v_start_date := NEW.start_date;
  v_current_date := CURRENT_DATE;
  
  -- Determine the first period we need based on period_type
  CASE COALESCE(NEW.period_type, 'previous_period')
    WHEN 'previous_period' THEN
      -- If start date is 5-Aug-2025, we need July 2025 period
      v_first_period_date := add_period_interval(v_start_date, NEW.recurrence_pattern, -1);
    
    WHEN 'current_period' THEN
      -- If start date is 5-Aug-2025, we need August 2025 period
      v_first_period_date := v_start_date;
    
    WHEN 'next_period' THEN
      -- If start date is 5-Aug-2025, we need September 2025 period
      v_first_period_date := add_period_interval(v_start_date, NEW.recurrence_pattern, 1);
    
    ELSE
      v_first_period_date := add_period_interval(v_start_date, NEW.recurrence_pattern, -1);
  END CASE;

  -- Calculate the actual period boundaries for first period
  SELECT * INTO v_period_start, v_period_end
  FROM calculate_period_for_date(v_first_period_date, NEW.recurrence_pattern);

  -- Calculate current period boundaries for comparison
  SELECT * INTO v_current_period_start, v_current_period_end
  FROM calculate_period_for_date(v_current_date, NEW.recurrence_pattern);

  -- Loop through and create all periods up to current date
  v_loop_date := v_period_start;
  
  WHILE TRUE LOOP
    -- Get period boundaries for this iteration
    SELECT * INTO v_period_start, v_period_end
    FROM calculate_period_for_date(v_loop_date, NEW.recurrence_pattern);
    
    -- Stop condition based on period_type
    IF COALESCE(NEW.period_type, 'previous_period') = 'previous_period' THEN
      -- For "previous_period", stop before current period
      IF v_period_start >= v_current_period_start THEN
        EXIT;
      END IF;
    ELSIF NEW.period_type = 'current_period' THEN
      -- For "current_period", include current period but not future
      IF v_period_start > v_current_period_start THEN
        EXIT;
      END IF;
    ELSE
      -- For "next_period", include one period after current
      IF v_period_start > v_current_period_end THEN
        EXIT;
      END IF;
    END IF;

    -- Generate period name
    v_period_name := generate_period_name_v2(v_period_start, v_period_end, NEW.recurrence_pattern);

    -- Check if period already exists
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = NEW.id
      AND period_start_date = v_period_start
    ) THEN
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
        NEW.id,
        v_period_name,
        v_period_start,
        v_period_end,
        NEW.billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

      -- Copy tasks to period with correct due dates
      v_task_count := copy_tasks_to_period(
        v_new_period_id,
        NEW.service_id,
        v_period_end,
        NEW.assigned_to
      );

      -- Update task count
      UPDATE work_recurring_instances
      SET total_tasks = v_task_count
      WHERE id = v_new_period_id;

      -- Copy documents to period
      PERFORM copy_documents_to_period(v_new_period_id, NEW.id);

      v_periods_created := v_periods_created + 1;
    END IF;

    -- Move to next period
    v_loop_date := add_period_interval(v_loop_date, NEW.recurrence_pattern, 1);
    
    -- Safety check to prevent infinite loop
    IF v_periods_created > 100 THEN
      RAISE EXCEPTION 'Too many periods generated (>100). Check your date range.';
    END IF;
  END LOOP;

  RAISE NOTICE 'Generated % periods for work %', v_periods_created, NEW.id;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 7: Create trigger
-- ============================================================================

CREATE TRIGGER trigger_generate_all_missing_periods
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION generate_all_missing_periods();

-- ============================================================================
-- STEP 8: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION calculate_period_for_date TO authenticated;
GRANT EXECUTE ON FUNCTION generate_period_name_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION add_period_interval TO authenticated;
GRANT EXECUTE ON FUNCTION generate_all_missing_periods TO authenticated;
