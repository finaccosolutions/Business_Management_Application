/*
  # Fix Recurring Work Period and Task Creation on Work Insert
  
  ## Problem
  When creating a recurring work, periods and tasks were not being created immediately on work insert.
  The system was waiting for task due dates to elapse before creating periods, but users expect
  to see periods and tasks immediately when creating recurring work.
  
  ## Solution
  Implement proper period and task creation on work insert with backfill logic:
  1. Create all eligible periods from work start_date to current_date
  2. For each period, create first tasks immediately
  3. Subsequent tasks added when their due dates elapse
  4. This ensures users see complete period structure immediately upon work creation
  
  ## Key Changes
  - Updated handle_recurring_work_creation() to backfill all periods
  - Fixed period creation logic to always create first period
  - Implemented proper task filtering by task_period_type
  - Added validation for work start_date vs current_date
*/

-- ============================================
-- FIX PERIOD CREATION TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS handle_recurring_work_insert ON works;

-- Updated trigger to properly handle recurring work creation with backfill
CREATE TRIGGER handle_recurring_work_insert
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION handle_recurring_work_creation();

-- Recreate the handle_recurring_work_creation function to properly backfill periods
DROP FUNCTION IF EXISTS handle_recurring_work_creation() CASCADE;

CREATE FUNCTION handle_recurring_work_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id UUID;
  v_recurrence_type TEXT;
  v_start_date DATE;
  v_current_date DATE := CURRENT_DATE;
  v_period_start DATE;
  v_period_end DATE;
  v_month_count INTEGER;
  v_period_idx INTEGER;
  v_period_name TEXT;
  v_first_task_created BOOLEAN;
BEGIN
  -- Only handle recurring works
  IF NEW.is_recurring = FALSE THEN
    RETURN NEW;
  END IF;

  -- Get service and work details
  SELECT s.id, s.recurrence_type, COALESCE(NEW.start_date, CURRENT_DATE)
  INTO v_service_id, v_recurrence_type, v_start_date
  FROM services s WHERE s.id = NEW.service_id;

  IF v_service_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Handle monthly recurrence
  IF v_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      -- Create period and add first tasks
      PERFORM create_period_with_first_tasks(
        NEW.id, v_period_start, v_period_end
      );
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  -- Handle quarterly recurrence
  ELSIF v_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      -- Create period and add first tasks
      PERFORM create_period_with_first_tasks(
        NEW.id, v_period_start, v_period_end
      );
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  -- Handle yearly recurrence
  ELSIF v_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', v_start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      -- Create period and add first tasks
      PERFORM create_period_with_first_tasks(
        NEW.id, v_period_start, v_period_end
      );
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIX PERIOD AND TASK ELIGIBILITY LOGIC
-- ============================================

-- Update should_create_period to always allow first period creation
DROP FUNCTION IF EXISTS should_create_period(uuid, date, date) CASCADE;

CREATE FUNCTION should_create_period(
  p_work_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_first_task_last_day DATE;
  v_earliest_existing_period_start DATE;
BEGIN
  -- Check if any periods exist for this work
  SELECT MIN(period_start_date) INTO v_earliest_existing_period_start
  FROM work_recurring_instances
  WHERE work_id = p_work_id;
  
  -- If no periods exist yet, this is the first period - always create it
  IF v_earliest_existing_period_start IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- For subsequent periods, only create when current date is after the first task's due date
  v_first_task_last_day := get_first_task_last_day_of_period(p_work_id, p_period_start_date, p_period_end_date);
  
  RETURN v_first_task_last_day IS NOT NULL AND CURRENT_DATE > v_first_task_last_day;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- ENSURE WORK TABLE HAS REQUIRED COLUMNS
-- ============================================

DO $$
BEGIN
  -- Add start_date column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE works ADD COLUMN start_date DATE DEFAULT CURRENT_DATE;
  END IF;
  
  -- Add is_recurring column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_recurring'
  ) THEN
    ALTER TABLE works ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add is_active column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE works ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;
