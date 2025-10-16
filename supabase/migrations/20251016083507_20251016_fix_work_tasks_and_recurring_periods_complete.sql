/*
  # Complete Fix for Work Tasks and Recurring Periods

  ## Issues Fixed
  1. **Work tasks not showing**: Add trigger to copy service tasks to work_tasks when non-recurring work is created
  2. **Duplicate periods**: Ensure only ONE initial period is created, remove conflicting triggers
  3. **Auto-generate next period**: Add trigger on period completion to automatically create next period

  ## Changes
  1. New function: `copy_service_tasks_to_work()` - Copies service task templates to work_tasks for non-recurring works
  2. New trigger: `trigger_copy_service_tasks_to_work` - Runs after work creation
  3. Updated function: `check_period_tasks_completion()` - Triggers next period generation after completion
  4. Cleanup: Remove duplicate/conflicting period generation triggers
  5. New function: `auto_generate_next_recurring_period()` - Creates next period when current period completes

  ## Important Notes
  - Service task templates are copied to work_tasks for NON-recurring works only
  - Recurring works use recurring_period_tasks which are auto-generated per period
  - Only ONE period ahead is generated automatically
  - Periods are generated on work creation AND on period completion
*/

-- ============================================================================
-- 1. COPY SERVICE TASKS TO NON-RECURRING WORKS
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_service_tasks_to_work()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id uuid;
  v_task_record RECORD;
  v_task_count integer := 0;
BEGIN
  -- Only copy tasks for NON-recurring works that have a service
  IF NEW.is_recurring = false AND NEW.service_id IS NOT NULL THEN
    
    -- Copy all active service tasks to work_tasks
    FOR v_task_record IN
      SELECT *
      FROM service_tasks
      WHERE service_id = NEW.service_id
      AND is_active = true
      ORDER BY sort_order
    LOOP
      -- Insert work task
      INSERT INTO work_tasks (
        work_id,
        title,
        description,
        priority,
        status,
        estimated_hours,
        assigned_to,
        sort_order
      ) VALUES (
        NEW.id,
        v_task_record.title,
        v_task_record.description,
        v_task_record.priority,
        'pending',
        v_task_record.estimated_hours,
        v_task_record.default_assigned_to,
        v_task_record.sort_order
      );
      
      v_task_count := v_task_count + 1;
    END LOOP;

    RAISE NOTICE 'Copied % service tasks to work %', v_task_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_copy_service_tasks_to_work ON works;

-- Create trigger to copy service tasks when work is created
CREATE TRIGGER trigger_copy_service_tasks_to_work
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = false AND NEW.service_id IS NOT NULL)
  EXECUTE FUNCTION copy_service_tasks_to_work();

-- ============================================================================
-- 2. FIX DUPLICATE RECURRING PERIOD CREATION
-- ============================================================================

-- Clean up: Ensure the create_initial_recurring_period function checks for duplicates thoroughly
CREATE OR REPLACE FUNCTION create_initial_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_period_dates RECORD;
  v_period_id uuid;
  v_existing_count integer;
  v_duplicate_check integer;
BEGIN
  -- Only create period if this is a recurring work
  IF NEW.is_recurring = true AND NEW.recurrence_pattern IS NOT NULL THEN
    
    -- Check if periods already exist for this work (strict check)
    SELECT COUNT(*) INTO v_existing_count
    FROM work_recurring_instances
    WHERE work_id = NEW.id;
    
    -- Only create if absolutely NO periods exist
    IF v_existing_count = 0 THEN
      -- Calculate period dates based on work start date and recurrence pattern
      SELECT * INTO v_period_dates
      FROM calculate_period_dates(
        COALESCE(NEW.start_date, CURRENT_DATE),
        NEW.recurrence_pattern,
        0  -- First period (period number 0)
      );

      -- Double-check: Ensure no period exists with these exact dates (prevent race conditions)
      SELECT COUNT(*) INTO v_duplicate_check
      FROM work_recurring_instances
      WHERE work_id = NEW.id
      AND period_start_date = v_period_dates.period_start_date
      AND period_end_date = v_period_dates.period_end_date;

      IF v_duplicate_check = 0 THEN
        -- Create the first recurring period
        INSERT INTO work_recurring_instances (
          work_id,
          period_name,
          period_start_date,
          period_end_date,
          due_date,
          billing_amount,
          status,
          notes
        ) VALUES (
          NEW.id,
          v_period_dates.period_name,
          v_period_dates.period_start_date,
          v_period_dates.period_end_date,
          v_period_dates.due_date,
          NEW.billing_amount,
          'pending',
          'Auto-generated initial period'
        ) RETURNING id INTO v_period_id;

        RAISE NOTICE 'Created initial period % for recurring work %', v_period_id, NEW.id;
      ELSE
        RAISE NOTICE 'Skipped creating duplicate period for work % - period already exists', NEW.id;
      END IF;
    ELSE
      RAISE NOTICE 'Skipped creating period for work % - % period(s) already exist', NEW.id, v_existing_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. AUTO-GENERATE NEXT PERIOD WHEN CURRENT PERIOD COMPLETES
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_next_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_work_id uuid;
  v_has_next_period boolean;
  v_new_period_id uuid;
  v_work_active boolean;
BEGIN
  -- Only proceed when period status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    v_work_id := NEW.work_id;
    
    -- Check if work is still active
    SELECT is_recurring AND status NOT IN ('completed', 'cancelled')
    INTO v_work_active
    FROM works
    WHERE id = v_work_id;
    
    IF v_work_active THEN
      -- Check if there's already a future period (due date > today)
      SELECT EXISTS (
        SELECT 1
        FROM work_recurring_instances
        WHERE work_id = v_work_id
        AND due_date > CURRENT_DATE
        AND status IN ('pending', 'in_progress')
      ) INTO v_has_next_period;
      
      -- Only create next period if NO future period exists
      IF NOT v_has_next_period THEN
        -- Generate the next recurring period
        v_new_period_id := generate_next_recurring_period(v_work_id);
        
        IF v_new_period_id IS NOT NULL THEN
          RAISE NOTICE 'Auto-generated next period % for work % after period % completion', 
            v_new_period_id, v_work_id, NEW.id;
          
          -- Log activity
          BEGIN
            PERFORM log_work_activity(
              v_work_id,
              'period_auto_generated',
              'Next Period Auto-Generated',
              'Next recurring period automatically created after ' || NEW.period_name || ' completion',
              jsonb_build_object(
                'completed_period_id', NEW.id,
                'completed_period_name', NEW.period_name,
                'new_period_id', v_new_period_id
              )
            );
          EXCEPTION
            WHEN OTHERS THEN
              NULL; -- Ignore logging errors
          END;
        ELSE
          RAISE NOTICE 'Failed to generate next period for work %', v_work_id;
        END IF;
      ELSE
        RAISE NOTICE 'Skipped generating next period for work % - future period already exists', v_work_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_generate_next_period ON work_recurring_instances;

-- Create trigger to auto-generate next period on completion
CREATE TRIGGER trigger_auto_generate_next_period
  AFTER UPDATE OF status ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION auto_generate_next_recurring_period();

-- ============================================================================
-- 4. UPDATE PERIOD COMPLETION CHECK TO HANDLE NEXT PERIOD GENERATION
-- ============================================================================

-- Update the period completion check to work smoothly with next period generation
CREATE OR REPLACE FUNCTION check_period_tasks_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_total_tasks integer;
  v_completed_tasks integer;
  v_all_completed boolean;
  v_current_status text;
BEGIN
  -- Count total and completed tasks for this period
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_tasks, v_completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = NEW.work_recurring_instance_id;

  -- Get current status
  SELECT status INTO v_current_status
  FROM work_recurring_instances
  WHERE id = NEW.work_recurring_instance_id;

  -- Determine if all tasks are completed
  v_all_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

  -- Update the period instance
  UPDATE work_recurring_instances
  SET 
    all_tasks_completed = v_all_completed,
    total_tasks = v_total_tasks,
    completed_tasks = v_completed_tasks,
    status = CASE 
      WHEN v_all_completed THEN 'completed'
      WHEN v_completed_tasks > 0 THEN 'in_progress'
      ELSE 'pending'
    END,
    completed_at = CASE 
      WHEN v_all_completed AND completed_at IS NULL THEN now()
      WHEN NOT v_all_completed THEN NULL
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = NEW.work_recurring_instance_id;

  -- If period just became completed, the trigger_auto_generate_next_period will handle next period creation
  IF v_all_completed AND v_current_status != 'completed' THEN
    RAISE NOTICE 'Period % completed - next period will be auto-generated by trigger', NEW.work_recurring_instance_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CLEANUP: Remove any conflicting or duplicate period generation logic
-- ============================================================================

-- Ensure we only have ONE trigger creating initial periods
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_periods ON works;
DROP TRIGGER IF EXISTS trigger_initialize_recurring_periods ON works;

-- Keep only the main trigger
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;
CREATE TRIGGER trigger_create_initial_recurring_period
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = true AND NEW.recurrence_pattern IS NOT NULL)
  EXECUTE FUNCTION create_initial_recurring_period();

-- ============================================================================
-- 6. ADD HELPFUL COMMENTS
-- ============================================================================

COMMENT ON FUNCTION copy_service_tasks_to_work() IS 'Copies service task templates to work_tasks table for non-recurring works';
COMMENT ON FUNCTION auto_generate_next_recurring_period() IS 'Automatically creates the next recurring period when current period is completed';
COMMENT ON TRIGGER trigger_copy_service_tasks_to_work ON works IS 'Copies service tasks to work_tasks for non-recurring works on creation';
COMMENT ON TRIGGER trigger_auto_generate_next_period ON work_recurring_instances IS 'Auto-generates next period when current period completes';

-- ============================================================================
-- 7. VERIFICATION QUERIES (for debugging)
-- ============================================================================

-- Check for any works missing tasks
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM works w
  LEFT JOIN work_tasks wt ON w.id = wt.work_id
  WHERE w.is_recurring = false 
  AND w.service_id IS NOT NULL
  AND wt.id IS NULL;
  
  IF v_count > 0 THEN
    RAISE NOTICE '% non-recurring works found without tasks - tasks should be added manually or via service task copy', v_count;
  END IF;
END $$;

-- Check for duplicate periods
DO $$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT COUNT(*) INTO v_duplicates
  FROM (
    SELECT work_id, period_start_date, period_end_date, COUNT(*) as cnt
    FROM work_recurring_instances
    GROUP BY work_id, period_start_date, period_end_date
    HAVING COUNT(*) > 1
  ) dups;
  
  IF v_duplicates > 0 THEN
    RAISE WARNING '% duplicate period date ranges detected - manual cleanup may be required', v_duplicates;
  END IF;
END $$;
