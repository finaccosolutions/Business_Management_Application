/*
  # Fix Task Creation for Works and Recurring Period Recovery

  ## Problem
  1. When creating works, all tasks are being added instead of only service-defined tasks
  2. Recurring period tasks include unnecessary entries not defined in the service
  3. Previous migrations deleted periods, so we need to recover correct periods

  ## Solution
  1. Update copy_service_tasks_to_work() trigger to only copy active service tasks
  2. Update copy_tasks_to_period_with_templates() to use only active service tasks
  3. Remove all existing incorrect periods for recurring works
  4. Regenerate periods from work start_date to current date (only complete periods)

  ## Changes Made
  1. Fixed copy_service_tasks_to_work() - Only copies is_active=true tasks from service
  2. Fixed copy_tasks_to_period_with_templates() - Only uses active service task templates
  3. Removed all work_recurring_instances for recurring works
  4. Regenerated correct periods for all recurring works based on start_date

  ## Key Features
  - Non-recurring works: Only get tasks defined as active in the service
  - Recurring works: Each period gets only active service tasks
  - Work-level templates: Still supported but separate from service tasks
  - Data Recovery: Periods regenerated from work start_date to current date
*/

-- Drop and recreate copy_service_tasks_to_work with corrected logic
DROP FUNCTION IF EXISTS public.copy_service_tasks_to_work() CASCADE;
DROP TRIGGER IF EXISTS trigger_copy_service_tasks_to_work ON works;

CREATE OR REPLACE FUNCTION copy_service_tasks_to_work()
RETURNS TRIGGER AS $$
DECLARE
  v_task_record RECORD;
  v_task_count integer := 0;
BEGIN
  -- Only copy tasks for NON-recurring works that have a service
  IF NEW.is_recurring = false AND NEW.service_id IS NOT NULL THEN

    -- Copy only ACTIVE service tasks to work_tasks (ordered by display_order)
    FOR v_task_record IN
      SELECT *
      FROM service_tasks
      WHERE service_id = NEW.service_id
      AND is_active = TRUE
      ORDER BY display_order ASC
    LOOP
      INSERT INTO work_tasks (
        work_id,
        service_task_id,
        title,
        description,
        priority,
        estimated_hours,
        sort_order,
        status,
        remarks
      ) VALUES (
        NEW.id,
        v_task_record.id,
        v_task_record.title,
        v_task_record.description,
        v_task_record.priority,
        v_task_record.estimated_hours,
        v_task_count,
        'pending',
        v_task_record.notes
      );

      v_task_count := v_task_count + 1;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to copy service tasks when work is created
CREATE TRIGGER trigger_copy_service_tasks_to_work
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = false AND NEW.service_id IS NOT NULL)
  EXECUTE FUNCTION copy_service_tasks_to_work();

COMMENT ON FUNCTION copy_service_tasks_to_work IS 'Copies only active service tasks to non-recurring work';

-- ====================================================================
-- Fix copy_tasks_to_period_with_templates to use only active service tasks
-- ====================================================================

DROP FUNCTION IF EXISTS public.copy_tasks_to_period_with_templates(UUID, UUID, UUID, DATE, UUID) CASCADE;

CREATE OR REPLACE FUNCTION copy_tasks_to_period_with_templates(
  p_period_id UUID,
  p_work_id UUID,
  p_service_id UUID,
  p_period_end_date DATE,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_task RECORD;
  v_due_date DATE;
  v_total_tasks INTEGER := 0;
  v_sort_order INTEGER := 0;
BEGIN
  -- Copy only ACTIVE service template tasks first (ordered by display_order)
  FOR v_service_task IN
    SELECT st.*
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.display_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    v_due_date := p_period_end_date + COALESCE(v_service_task.due_date_offset_days, 10);

    -- Insert the task from service template
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      status,
      priority,
      assigned_to,
      estimated_hours,
      sort_order
    ) VALUES (
      p_period_id,
      v_service_task.id,
      v_service_task.title,
      v_service_task.description,
      v_due_date,
      'pending',
      v_service_task.priority,
      p_assigned_to,
      v_service_task.estimated_hours,
      v_sort_order
    );

    v_total_tasks := v_total_tasks + 1;
    v_sort_order := v_sort_order + 1;
  END LOOP;

  -- Then copy work-level task templates (if any exist)
  IF EXISTS (SELECT 1 FROM work_task_templates WHERE work_id = p_work_id LIMIT 1) THEN
    v_total_tasks := v_total_tasks + copy_work_templates_to_period(
      p_period_id,
      p_work_id,
      p_period_end_date
    );
  END IF;

  RETURN v_total_tasks;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_tasks_to_period_with_templates(UUID, UUID, UUID, DATE, UUID) TO authenticated;

-- ====================================================================
-- Fix initial recurring work period creation
-- ====================================================================

DROP FUNCTION IF EXISTS public.handle_new_recurring_work() CASCADE;
DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work ON works;

CREATE OR REPLACE FUNCTION handle_new_recurring_work()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id UUID;
  v_task_count INTEGER;
  v_period_dates RECORD;
  v_service_recurrence TEXT;
BEGIN
  -- Only process recurring works
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;

  -- Get service recurrence type
  SELECT recurrence_type INTO v_service_recurrence
  FROM services
  WHERE id = NEW.service_id;

  -- Calculate first period dates based on work start date
  SELECT * INTO v_period_dates
  FROM calculate_next_period_dates(
    NEW.start_date - INTERVAL '1 day',
    COALESCE(v_service_recurrence, NEW.recurrence_pattern)
  );

  -- Create first period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status
  ) VALUES (
    NEW.id,
    v_period_dates.next_period_name,
    v_period_dates.next_start_date,
    v_period_dates.next_end_date,
    'pending'
  ) RETURNING id INTO v_period_id;

  -- Copy tasks using the updated function that only copies active service tasks
  v_task_count := copy_tasks_to_period_with_templates(
    v_period_id,
    NEW.id,
    NEW.service_id,
    v_period_dates.next_end_date,
    NEW.assigned_to
  );

  -- Update task count
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_period_id;

  -- Copy documents
  PERFORM copy_documents_to_period(v_period_id, NEW.id);

  RETURN NEW;
END;
$$;

-- Create trigger for new recurring works
CREATE TRIGGER trigger_handle_new_recurring_work
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = TRUE AND NEW.service_id IS NOT NULL)
  EXECUTE FUNCTION handle_new_recurring_work();

COMMENT ON FUNCTION handle_new_recurring_work IS 'Creates initial period with only active service tasks when new recurring work is created';

-- ====================================================================
-- RECOVERY: Remove all existing periods and regenerate correct ones
-- ====================================================================

-- Step 1: Remove all existing periods (they have incorrect tasks)
DELETE FROM work_recurring_instances
WHERE work_id IN (
  SELECT id FROM works WHERE is_recurring = TRUE
);

-- Step 2: Regenerate correct periods for all recurring works from start_date to current date
DO $$
DECLARE
  v_work RECORD;
  v_period_dates RECORD;
  v_period_id UUID;
  v_task_count INTEGER;
  v_current_period_start DATE;
  v_current_period_end DATE;
  v_recurrence_pattern TEXT;
  v_periods_count INTEGER := 0;
BEGIN
  FOR v_work IN
    SELECT w.* FROM works w
    WHERE w.is_recurring = TRUE
    AND w.start_date IS NOT NULL
    AND w.service_id IS NOT NULL
    ORDER BY w.created_at
  LOOP
    BEGIN
      -- Get recurrence pattern from work or service
      v_recurrence_pattern := COALESCE(
        (SELECT recurrence_type FROM services WHERE id = v_work.service_id),
        v_work.recurrence_pattern,
        'monthly'
      );

      -- Calculate first period dates based on work start date
      SELECT * INTO v_period_dates
      FROM calculate_next_period_dates(
        v_work.start_date - INTERVAL '1 day',
        v_recurrence_pattern
      );

      v_current_period_start := v_period_dates.next_start_date;
      v_current_period_end := v_period_dates.next_end_date;

      -- Generate all periods up to current date
      WHILE v_current_period_end <= CURRENT_DATE LOOP
        -- Create period with correct name
        INSERT INTO work_recurring_instances (
          work_id,
          period_name,
          period_start_date,
          period_end_date,
          status
        ) VALUES (
          v_work.id,
          generate_period_name(v_current_period_start, v_current_period_end, v_recurrence_pattern),
          v_current_period_start,
          v_current_period_end,
          CASE WHEN v_current_period_end < CURRENT_DATE THEN 'completed' ELSE 'pending' END
        ) RETURNING id INTO v_period_id;

        -- Copy only active service tasks to this period
        v_task_count := copy_tasks_to_period_with_templates(
          v_period_id,
          v_work.id,
          v_work.service_id,
          v_current_period_end,
          v_work.assigned_to
        );

        -- Update task count
        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_period_id;

        -- Copy documents
        PERFORM copy_documents_to_period(v_period_id, v_work.id);

        v_periods_count := v_periods_count + 1;

        -- Calculate next period
        SELECT * INTO v_period_dates
        FROM calculate_next_period_dates(
          v_current_period_end,
          v_recurrence_pattern
        );

        v_current_period_start := v_period_dates.next_start_date;
        v_current_period_end := v_period_dates.next_end_date;
      END LOOP;

      RAISE NOTICE 'Regenerated % periods for recurring work %', v_periods_count, v_work.id;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error regenerating periods for work %: %', v_work.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Period recovery completed. Total periods regenerated: %', v_periods_count;
END $$;
