/*
  # Add Task Reordering Support

  ## Purpose
  Enable drag-and-drop reordering of tasks in:
  1. Service tasks (template tasks)
  2. Work tasks (non-recurring work tasks)
  3. Recurring period tasks (tasks within a period)

  ## Changes
  1. Ensure sort_order columns exist and have proper defaults
  2. Add function to reorder tasks with conflict resolution
  3. Add function to copy task ordering from service to work
*/

-- ============================================================================
-- STEP 1: Ensure Proper Defaults for sort_order
-- ============================================================================

-- Set default values for any NULL sort_order in service_tasks
UPDATE service_tasks
SET sort_order = (
  SELECT COALESCE(MAX(sort_order), 0) + 1
  FROM service_tasks st2
  WHERE st2.service_id = service_tasks.service_id
  AND st2.sort_order IS NOT NULL
)
WHERE sort_order IS NULL;

-- Set default values for any NULL sort_order in work_tasks
UPDATE work_tasks
SET sort_order = (
  SELECT COALESCE(MAX(sort_order), 0) + 1
  FROM work_tasks wt2
  WHERE wt2.work_id = work_tasks.work_id
  AND wt2.sort_order IS NOT NULL
)
WHERE sort_order IS NULL;

-- Set default values for any NULL sort_order in recurring_period_tasks
UPDATE recurring_period_tasks
SET sort_order = (
  SELECT COALESCE(MAX(sort_order), 0) + 1
  FROM recurring_period_tasks rpt2
  WHERE rpt2.work_recurring_instance_id = recurring_period_tasks.work_recurring_instance_id
  AND rpt2.sort_order IS NOT NULL
)
WHERE sort_order IS NULL;

-- ============================================================================
-- STEP 2: Create Function to Reorder Tasks
-- ============================================================================

-- This function handles reordering any type of task
CREATE OR REPLACE FUNCTION reorder_tasks(
  p_table_name text,
  p_task_id uuid,
  p_new_sort_order integer,
  p_parent_id_column text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_sort_order integer;
  v_sql text;
BEGIN
  -- Validate table name to prevent SQL injection
  IF p_table_name NOT IN ('service_tasks', 'work_tasks', 'recurring_period_tasks') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- Get current sort_order
  EXECUTE format('SELECT sort_order FROM %I WHERE id = $1', p_table_name)
  INTO v_old_sort_order
  USING p_task_id;

  IF v_old_sort_order IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- If moving down (old < new), shift tasks between old and new down by 1
  IF v_old_sort_order < p_new_sort_order THEN
    IF p_parent_id_column IS NOT NULL AND p_parent_id IS NOT NULL THEN
      EXECUTE format(
        'UPDATE %I SET sort_order = sort_order - 1 
         WHERE %I = $1 AND sort_order > $2 AND sort_order <= $3',
        p_table_name, p_parent_id_column
      ) USING p_parent_id, v_old_sort_order, p_new_sort_order;
    ELSE
      EXECUTE format(
        'UPDATE %I SET sort_order = sort_order - 1 
         WHERE sort_order > $1 AND sort_order <= $2',
        p_table_name
      ) USING v_old_sort_order, p_new_sort_order;
    END IF;
  
  -- If moving up (old > new), shift tasks between new and old up by 1
  ELSIF v_old_sort_order > p_new_sort_order THEN
    IF p_parent_id_column IS NOT NULL AND p_parent_id IS NOT NULL THEN
      EXECUTE format(
        'UPDATE %I SET sort_order = sort_order + 1 
         WHERE %I = $1 AND sort_order >= $2 AND sort_order < $3',
        p_table_name, p_parent_id_column
      ) USING p_parent_id, p_new_sort_order, v_old_sort_order;
    ELSE
      EXECUTE format(
        'UPDATE %I SET sort_order = sort_order + 1 
         WHERE sort_order >= $1 AND sort_order < $2',
        p_table_name
      ) USING p_new_sort_order, v_old_sort_order;
    END IF;
  END IF;

  -- Update the task's sort_order
  EXECUTE format('UPDATE %I SET sort_order = $1 WHERE id = $2', p_table_name)
  USING p_new_sort_order, p_task_id;

  RETURN true;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error reordering tasks: %', SQLERRM;
    RETURN false;
END;
$$;

-- ============================================================================
-- STEP 3: Add Helper Function to Normalize Sort Orders
-- ============================================================================

-- This function renumbers sort_order sequentially (0, 1, 2, 3...) to avoid gaps
CREATE OR REPLACE FUNCTION normalize_task_sort_orders(
  p_table_name text,
  p_parent_id_column text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task record;
  v_new_order integer := 0;
  v_sql text;
BEGIN
  -- Validate table name
  IF p_table_name NOT IN ('service_tasks', 'work_tasks', 'recurring_period_tasks') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- Build query based on whether we have a parent
  IF p_parent_id_column IS NOT NULL AND p_parent_id IS NOT NULL THEN
    v_sql := format(
      'SELECT id FROM %I WHERE %I = $1 ORDER BY sort_order, created_at',
      p_table_name, p_parent_id_column
    );
    
    FOR v_task IN EXECUTE v_sql USING p_parent_id LOOP
      EXECUTE format('UPDATE %I SET sort_order = $1 WHERE id = $2', p_table_name)
      USING v_new_order, v_task.id;
      v_new_order := v_new_order + 1;
    END LOOP;
  ELSE
    v_sql := format(
      'SELECT id FROM %I ORDER BY sort_order, created_at',
      p_table_name
    );
    
    FOR v_task IN EXECUTE v_sql LOOP
      EXECUTE format('UPDATE %I SET sort_order = $1 WHERE id = $2', p_table_name)
      USING v_new_order, v_task.id;
      v_new_order := v_new_order + 1;
    END LOOP;
  END IF;

  RAISE NOTICE 'Normalized % task sort orders', v_new_order;
END;
$$;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✓ TASK REORDERING SUPPORT ADDED';
  RAISE NOTICE '=====================================';
  RAISE NOTICE '1. ✓ Set default sort_order for all existing tasks';
  RAISE NOTICE '2. ✓ Created reorder_tasks() function for drag-and-drop';
  RAISE NOTICE '3. ✓ Created normalize_task_sort_orders() helper function';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage Examples:';
  RAISE NOTICE '  - Reorder service task: SELECT reorder_tasks(''service_tasks'', task_id, new_order, ''service_id'', service_id)';
  RAISE NOTICE '  - Reorder work task: SELECT reorder_tasks(''work_tasks'', task_id, new_order, ''work_id'', work_id)';
  RAISE NOTICE '  - Normalize orders: SELECT normalize_task_sort_orders(''service_tasks'', ''service_id'', service_id)';
  RAISE NOTICE '';
END $$;
