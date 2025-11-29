/*
  # Period Scheduler and Backfill Implementation

  ## Overview
  Implements automatic period creation and task addition scheduler.
  
  - Automatic period creation when first task last day elapses
  - Automatic task addition to existing periods when their due dates elapse
  - Backfill logic for existing recurring works
*/

-- ============================================
-- STEP 1: SCHEDULER FUNCTIONS
-- ============================================

-- Auto-create next period when applicable
CREATE OR REPLACE FUNCTION auto_create_next_period_on_schedule()
RETURNS TABLE(work_id UUID, period_id UUID, action TEXT) AS $$
DECLARE
  v_work RECORD;
  v_periods RECORD;
  v_period_id UUID;
BEGIN
  FOR v_work IN
    SELECT id FROM works
    WHERE is_recurring = TRUE AND is_active = TRUE
  LOOP
    FOR v_periods IN
      SELECT period_start_date, period_end_date, period_name
      FROM generate_periods_for_recurring_work(v_work.id)
      WHERE NOT EXISTS (
        SELECT 1 FROM work_recurring_instances
        WHERE work_id = v_work.id
          AND period_start_date = generate_periods_for_recurring_work.period_start_date
          AND period_end_date = generate_periods_for_recurring_work.period_end_date
      )
    LOOP
      v_period_id := create_period_with_first_tasks(
        v_work.id,
        v_periods.period_start_date,
        v_periods.period_end_date
      );
      
      RETURN QUERY SELECT v_work.id, v_period_id, 'created'::TEXT;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add tasks to period on due date
CREATE OR REPLACE FUNCTION add_tasks_to_period_on_due_date(
  p_work_id UUID,
  p_period_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_task RECORD;
  v_period_start_date DATE;
  v_period_end_date DATE;
  v_tasks_added INTEGER := 0;
BEGIN
  SELECT period_start_date, period_end_date 
  INTO v_period_start_date, v_period_end_date
  FROM work_recurring_instances WHERE id = p_period_id;

  IF v_period_start_date IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_task IN
    SELECT * FROM get_tasks_to_create_for_period(
      p_work_id, v_period_start_date, v_period_end_date, CURRENT_DATE
    ) WHERE is_first_task = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM recurring_period_tasks
        WHERE work_recurring_instance_id = p_period_id
          AND service_task_id = get_tasks_to_create_for_period.service_task_id
      )
  LOOP
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id, service_task_id, title, due_date,
      status, priority, created_at, updated_at
    ) VALUES (
      p_period_id, v_task.service_task_id, v_task.task_title, v_task.due_date,
      'pending', 'medium', now(), now()
    );
    
    v_tasks_added := v_tasks_added + 1;
  END LOOP;

  RETURN v_tasks_added;
END;
$$ LANGUAGE plpgsql;

-- Add tasks to existing periods when their due dates elapse
CREATE OR REPLACE FUNCTION auto_add_tasks_to_periods()
RETURNS TABLE(period_id UUID, tasks_added INTEGER) AS $$
DECLARE
  v_period RECORD;
  v_task_count INTEGER;
BEGIN
  FOR v_period IN
    SELECT id, work_id FROM work_recurring_instances
    WHERE status != 'completed'
  LOOP
    v_task_count := add_tasks_to_period_on_due_date(v_period.work_id, v_period.id);
    
    IF v_task_count > 0 THEN
      RETURN QUERY SELECT v_period.id, v_task_count;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 2: BACKFILL EXISTING RECURRING WORKS
-- ============================================

DO $$
DECLARE
  v_work_id UUID;
  v_period_start_date DATE;
  v_period_end_date DATE;
  v_period_name TEXT;
  v_period_id UUID;
  v_task_count INTEGER;
BEGIN
  -- Process all recurring active works
  FOR v_work_id IN
    SELECT id FROM works
    WHERE is_recurring = TRUE AND is_active = TRUE
  LOOP
    -- Generate all eligible periods from backfill
    FOR v_period_start_date, v_period_end_date, v_period_name IN
      SELECT period_start_date, period_end_date, period_name
      FROM generate_periods_for_recurring_work(v_work_id)
    LOOP
      -- Check if period already exists
      IF NOT EXISTS (
        SELECT 1 FROM work_recurring_instances
        WHERE work_id = v_work_id
          AND period_start_date = v_period_start_date
          AND period_end_date = v_period_end_date
      ) THEN
        -- Create period with first tasks
        v_period_id := create_period_with_first_tasks(
          v_work_id,
          v_period_start_date,
          v_period_end_date
        );
      END IF;
    END LOOP;

    -- Add tasks to existing periods where due dates have elapsed
    FOR v_period_id IN
      SELECT id FROM work_recurring_instances
      WHERE work_id = v_work_id AND status != 'completed'
    LOOP
      v_task_count := add_tasks_to_period_on_due_date(v_work_id, v_period_id);
    END LOOP;
  END LOOP;
END $$;
