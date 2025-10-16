/*
  # Add Manual Task Copy Function for Existing Works

  ## Purpose
  Provides a function to manually copy service task templates to existing works
  that may have been created before the automatic trigger was added.

  ## Changes
  1. Create function `copy_service_tasks_to_existing_work(work_id)` 
  2. Backfill any existing non-recurring works that are missing tasks

  ## Usage
  Call: SELECT copy_service_tasks_to_existing_work('work-id-here');
  Or backfill all: SELECT copy_service_tasks_to_existing_work(id) FROM works WHERE is_recurring = false;
*/

-- Function to manually copy service tasks to an existing work
CREATE OR REPLACE FUNCTION copy_service_tasks_to_existing_work(p_work_id uuid)
RETURNS integer AS $$
DECLARE
  v_work RECORD;
  v_task_record RECORD;
  v_task_count integer := 0;
  v_existing_tasks integer;
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id;
  
  IF v_work IS NULL THEN
    RAISE EXCEPTION 'Work not found: %', p_work_id;
  END IF;
  
  IF v_work.is_recurring = true THEN
    RAISE NOTICE 'Work % is recurring - tasks are managed per period, not copied', p_work_id;
    RETURN 0;
  END IF;
  
  IF v_work.service_id IS NULL THEN
    RAISE NOTICE 'Work % has no service - cannot copy tasks', p_work_id;
    RETURN 0;
  END IF;
  
  -- Check if tasks already exist
  SELECT COUNT(*) INTO v_existing_tasks
  FROM work_tasks
  WHERE work_id = p_work_id;
  
  IF v_existing_tasks > 0 THEN
    RAISE NOTICE 'Work % already has % tasks - skipping copy', p_work_id, v_existing_tasks;
    RETURN 0;
  END IF;
  
  -- Copy all active service tasks to work_tasks
  FOR v_task_record IN
    SELECT *
    FROM service_tasks
    WHERE service_id = v_work.service_id
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
      p_work_id,
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

  RAISE NOTICE 'Copied % service tasks to work %', v_task_count, p_work_id;
  RETURN v_task_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill tasks for any existing non-recurring works that are missing tasks
DO $$
DECLARE
  v_work_record RECORD;
  v_total_copied integer := 0;
  v_works_updated integer := 0;
  v_tasks_copied integer;
BEGIN
  FOR v_work_record IN
    SELECT w.id, w.title
    FROM works w
    LEFT JOIN work_tasks wt ON w.id = wt.work_id
    WHERE w.is_recurring = false
    AND w.service_id IS NOT NULL
    AND wt.id IS NULL
    GROUP BY w.id, w.title
  LOOP
    v_tasks_copied := copy_service_tasks_to_existing_work(v_work_record.id);
    
    IF v_tasks_copied > 0 THEN
      v_works_updated := v_works_updated + 1;
      v_total_copied := v_total_copied + v_tasks_copied;
      
      RAISE NOTICE 'Work "%": copied % tasks', v_work_record.title, v_tasks_copied;
    END IF;
  END LOOP;
  
  IF v_works_updated > 0 THEN
    RAISE NOTICE 'Backfill complete: Updated % works with % total tasks', v_works_updated, v_total_copied;
  ELSE
    RAISE NOTICE 'No works needed task backfill';
  END IF;
END $$;

COMMENT ON FUNCTION copy_service_tasks_to_existing_work(uuid) IS 'Manually copies service task templates to an existing non-recurring work';
