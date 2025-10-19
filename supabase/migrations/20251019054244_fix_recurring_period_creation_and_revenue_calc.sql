/*
  # Fix Recurring Period Creation and Invoice Revenue Display

  ## Issues Fixed
  1. **Recurring periods not being created after work insert**
     - The create_initial_recurring_period_on_work_insert function calls calculate_period_dates with wrong parameters
     - There are TWO calculate_period_dates functions with different signatures
     - Need to use the correct 3-parameter version: (pattern, period_type, reference_date)
     
  2. **Total Revenue showing wrong amount**
     - Frontend displays total_amount (subtotal + tax) instead of just subtotal
     - Will be fixed in frontend code separately

  ## Changes
  1. Fix create_initial_recurring_period_on_work_insert to properly call calculate_period_dates
  2. Add comprehensive error logging
  3. Ensure period creation works for all recurrence patterns
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
     AND NEW.recurrence_pattern != ''
     AND NEW.start_date <= CURRENT_DATE THEN

    -- Use period_calculation_type if available, default to 'previous_period'
    v_period_type := COALESCE(NEW.period_calculation_type, 'previous_period');

    RAISE NOTICE 'Creating initial period for work % with pattern % and type %', NEW.id, NEW.recurrence_pattern, v_period_type;

    -- Calculate period dates based on pattern and type using the 3-parameter version
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
      -- Create the period with user_id
      INSERT INTO work_recurring_instances (
        user_id,
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        status,
        billing_amount
      ) VALUES (
        NEW.user_id,
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
        v_period_end + st.due_date_offset_days,
        'pending',
        st.sort_order
      FROM service_tasks st
      WHERE st.service_id = NEW.service_id
      AND st.is_active = true
      ORDER BY st.sort_order;

      RAISE NOTICE 'Copied tasks from service % to period %', NEW.service_id, v_new_period_id;

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

      RAISE NOTICE 'Created initial period "%s" for recurring work "%s"', v_period_name, NEW.title;
    ELSE
      RAISE NOTICE 'Period already exists for work %', NEW.id;
    END IF;
  ELSE
    IF NEW.is_recurring = true THEN
      RAISE NOTICE 'Skipping period creation for work %: is_recurring=%s, pattern=%s, start_date=%s, current_date=%s', 
        NEW.id, NEW.is_recurring, NEW.recurrence_pattern, NEW.start_date, CURRENT_DATE;
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
-- Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_initial_recurring_period_on_work_insert TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION create_initial_recurring_period_on_work_insert IS
  'Creates first recurring period when recurring work is inserted. 
   - Only triggers for is_recurring = true works with start_date <= today
   - Uses calculate_period_dates(pattern, period_type, reference_date) function
   - Creates period with user_id for proper RLS
   - Copies tasks and documents from templates
   - Adds comprehensive logging for debugging';
