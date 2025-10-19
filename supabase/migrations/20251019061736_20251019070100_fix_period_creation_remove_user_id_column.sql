/*
  # Fix Period Creation Functions - Remove user_id Column Reference

  ## Issue
  The work_recurring_instances table does not have a user_id column.
  RLS is handled through the work_id foreign key relationship to works table.

  ## Changes
  1. Update create_initial_recurring_period_on_work_insert function to remove user_id
  2. Update manually_create_period_for_work function to remove user_id
  3. Both functions now only insert required columns

  ## Security
  - RLS is maintained through work_id relationship
  - Users can only access periods for their own works via the works table RLS
*/

-- ============================================================================
-- Fix create_initial_recurring_period_on_work_insert Function
-- ============================================================================

CREATE OR REPLACE FUNCTION create_initial_recurring_period_on_work_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_new_period_id UUID;
  v_period_type TEXT;
BEGIN
  -- Only create period if work has recurrence pattern and is marked as recurring
  IF NEW.is_recurring = true 
     AND NEW.recurrence_pattern IS NOT NULL 
     AND NEW.recurrence_pattern != '' THEN

    -- Use period_calculation_type if available, default to 'previous_period'
    v_period_type := COALESCE(NEW.period_calculation_type, 'previous_period');

    RAISE NOTICE 'Creating initial period for work % with pattern % and type %', NEW.id, NEW.recurrence_pattern, v_period_type;

    -- Calculate period dates based on pattern and type
    SELECT period_start_date, period_end_date, period_name
    INTO v_period_start, v_period_end, v_period_name
    FROM calculate_period_dates(NEW.recurrence_pattern, v_period_type, CURRENT_DATE);

    IF v_period_start IS NULL OR v_period_end IS NULL THEN
      RAISE WARNING 'Failed to calculate period dates for work %', NEW.id;
      RETURN NEW;
    END IF;

    RAISE NOTICE 'Calculated period: % (% to %)', v_period_name, v_period_start, v_period_end;

    -- Check if this period already exists
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = NEW.id
      AND period_start_date = v_period_start
      AND period_end_date = v_period_end
    ) THEN
      -- Create the period (NO user_id column - RLS via work_id)
      INSERT INTO work_recurring_instances (
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        status,
        billing_amount
      ) VALUES (
        NEW.id,
        v_period_name,
        v_period_start,
        v_period_end,
        'pending',
        NEW.billing_amount
      )
      RETURNING id INTO v_new_period_id;

      RAISE NOTICE 'Created period % for work %', v_new_period_id, NEW.id;

      -- Copy tasks from service template
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,
        description,
        due_date_offset_days,
        due_date,
        status,
        sort_order
      )
      SELECT 
        v_new_period_id,
        st.id,
        st.title,
        st.description,
        st.due_date_offset_days,
        v_period_end + COALESCE(st.due_date_offset_days, 0),
        'pending',
        st.sort_order
      FROM service_tasks st
      WHERE st.service_id = NEW.service_id
      AND st.is_active = true
      ORDER BY st.sort_order;

      RAISE NOTICE 'Copied % tasks from service % to period %', 
        (SELECT COUNT(*) FROM service_tasks WHERE service_id = NEW.service_id AND is_active = true),
        NEW.service_id, v_new_period_id;

      -- Copy documents from work template
      INSERT INTO work_recurring_period_documents (
        work_recurring_instance_id,
        work_document_id,
        is_collected
      )
      SELECT 
        v_new_period_id,
        wd.id,
        false
      FROM work_documents wd
      WHERE wd.work_id = NEW.id;

      RAISE NOTICE 'Copied % documents to period %',
        (SELECT COUNT(*) FROM work_documents WHERE work_id = NEW.id),
        v_new_period_id;

      RAISE NOTICE '✓ Created initial period "%s" for recurring work "%s"', v_period_name, NEW.title;
    ELSE
      RAISE NOTICE 'Period already exists for work %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating initial recurring period for work %: % - %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Fix manually_create_period_for_work Function
-- ============================================================================

CREATE OR REPLACE FUNCTION manually_create_period_for_work(p_work_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_work RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_new_period_id UUID;
  v_period_type TEXT;
  v_task_count INT;
  v_doc_count INT;
BEGIN
  -- Get work details
  SELECT * INTO v_work FROM works WHERE id = p_work_id;
  
  IF NOT FOUND THEN
    RETURN 'ERROR: Work not found';
  END IF;
  
  IF v_work.is_recurring != true THEN
    RETURN 'ERROR: Work is not marked as recurring';
  END IF;
  
  IF v_work.recurrence_pattern IS NULL OR v_work.recurrence_pattern = '' THEN
    RETURN 'ERROR: Work has no recurrence pattern';
  END IF;

  -- Use period_calculation_type if available
  v_period_type := COALESCE(v_work.period_calculation_type, 'previous_period');

  -- Calculate period dates
  SELECT period_start_date, period_end_date, period_name
  INTO v_period_start, v_period_end, v_period_name
  FROM calculate_period_dates(v_work.recurrence_pattern, v_period_type, CURRENT_DATE);

  IF v_period_start IS NULL OR v_period_end IS NULL THEN
    RETURN 'ERROR: Failed to calculate period dates';
  END IF;

  -- Check if period already exists
  IF EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = p_work_id
    AND period_start_date = v_period_start
    AND period_end_date = v_period_end
  ) THEN
    RETURN 'INFO: Period already exists for these dates';
  END IF;

  -- Create the period (NO user_id column)
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status,
    billing_amount
  ) VALUES (
    v_work.id,
    v_period_name,
    v_period_start,
    v_period_end,
    'pending',
    v_work.billing_amount
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks
  INSERT INTO recurring_period_tasks (
    work_recurring_instance_id,
    service_task_id,
    title,
    description,
    due_date_offset_days,
    due_date,
    status,
    sort_order
  )
  SELECT 
    v_new_period_id,
    st.id,
    st.title,
    st.description,
    st.due_date_offset_days,
    v_period_end + COALESCE(st.due_date_offset_days, 0),
    'pending',
    st.sort_order
  FROM service_tasks st
  WHERE st.service_id = v_work.service_id
  AND st.is_active = true
  ORDER BY st.sort_order;

  GET DIAGNOSTICS v_task_count = ROW_COUNT;

  -- Copy documents
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected
  )
  SELECT 
    v_new_period_id,
    wd.id,
    false
  FROM work_documents wd
  WHERE wd.work_id = p_work_id;

  GET DIAGNOSTICS v_doc_count = ROW_COUNT;

  RETURN FORMAT('SUCCESS: Created period "%s" (%s to %s) with %s tasks and %s documents', 
    v_period_name, v_period_start, v_period_end, v_task_count, v_doc_count);
    
EXCEPTION
  WHEN OTHERS THEN
    RETURN FORMAT('ERROR: %s - %s', SQLERRM, SQLSTATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_initial_recurring_period_on_work_insert TO authenticated;
GRANT EXECUTE ON FUNCTION manually_create_period_for_work TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION create_initial_recurring_period_on_work_insert IS
  'Creates first recurring period immediately when recurring work is inserted.
   - No user_id column (RLS handled via work_id foreign key)
   - Creates period with tasks and documents
   - Logs all operations for debugging';

COMMENT ON FUNCTION manually_create_period_for_work IS
  'Helper function to manually create a period for an existing recurring work.
   Usage: SELECT manually_create_period_for_work(''work-uuid-here'');
   Returns: Success message with details or error message';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed period creation functions - removed user_id column references';
  RAISE NOTICE '✓ RLS security maintained through work_id foreign key';
END $$;
