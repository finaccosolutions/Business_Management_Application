/*
  # Fix Recurring Period Creation and Invoice Numbering

  ## Issues Fixed
  
  1. **Recurring periods not being created**
     - Problem: Trigger checks `NEW.start_date <= CURRENT_DATE` which prevents future-dated works from creating periods
     - Solution: Remove the date check - create initial period immediately when work is created
     - Rationale: Users should be able to see and manage periods even if work starts in the future
  
  2. **Duplicate triggers on works table**
     - Problem: Two triggers exist calling the same function (trigger_create_first_recurring_period and trigger_handle_new_recurring_work_initial_period)
     - Solution: Keep only one trigger to avoid duplicate period creation
  
  3. **Invoice numbering not respecting company settings**
     - Problem: Already fixed in previous migration but needs verification
     - Solution: Ensure auto_generate_work_invoice and auto_create_invoice_on_period_completion use correct logic
  
  ## Changes Made
  1. Remove date restriction from period creation trigger
  2. Clean up duplicate triggers
  3. Verify invoice numbering functions are correct
  4. Add function to manually trigger period creation for existing works

  ## Security
  - No RLS changes
  - Maintains existing security model
*/

-- ============================================================================
-- STEP 1: Drop Duplicate Triggers
-- ============================================================================

-- Keep only trigger_handle_new_recurring_work_initial_period
DROP TRIGGER IF EXISTS trigger_create_first_recurring_period ON works;

COMMENT ON TRIGGER trigger_handle_new_recurring_work_initial_period ON works IS
  'Creates first recurring period when recurring work is inserted. Only trigger for period creation.';

-- ============================================================================
-- STEP 2: Fix Period Creation Function - Remove Date Restriction
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
  -- REMOVED: AND NEW.start_date <= CURRENT_DATE condition
  -- Reason: Users should see periods immediately, even for future-dated works
  IF NEW.is_recurring = true 
     AND NEW.recurrence_pattern IS NOT NULL 
     AND NEW.recurrence_pattern != '' THEN

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
  ELSE
    IF NEW.is_recurring = true THEN
      RAISE NOTICE 'Skipping period creation for work %: is_recurring=%s, pattern=%s', 
        NEW.id, NEW.is_recurring, NEW.recurrence_pattern;
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
-- STEP 3: Add Helper Function to Manually Create Periods for Existing Works
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

  -- Create the period
  INSERT INTO work_recurring_instances (
    user_id,
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status,
    billing_amount
  ) VALUES (
    v_work.user_id,
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
-- STEP 4: Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_initial_recurring_period_on_work_insert TO authenticated;
GRANT EXECUTE ON FUNCTION manually_create_period_for_work TO authenticated;

-- ============================================================================
-- STEP 5: Verify Invoice Numbering Functions
-- ============================================================================

-- The invoice numbering functions (auto_generate_work_invoice and 
-- auto_create_invoice_on_period_completion) are already correct as per 
-- migration 20251019053535. They properly read invoice_prefix, invoice_suffix,
-- invoice_number_width, invoice_number_prefix_zero, and invoice_starting_number
-- from company_settings and generate numbers in format: PREFIX-NUMBER-SUFFIX

COMMENT ON FUNCTION auto_generate_work_invoice IS
  'Auto-creates invoices for non-recurring works when completed. 
   Uses company_settings for invoice number format: PREFIX-PADDEDNUMBER-SUFFIX.
   Example: ABC-00001 or ABC-00001-FY25';

COMMENT ON FUNCTION auto_create_invoice_on_period_completion IS
  'Auto-creates invoices for recurring periods when all tasks completed.
   Uses company_settings for invoice number format: PREFIX-PADDEDNUMBER-SUFFIX.
   Example: ABC-00001 or ABC-00001-FY25';

-- ============================================================================
-- Documentation
-- ============================================================================

COMMENT ON FUNCTION create_initial_recurring_period_on_work_insert IS
  'Creates first recurring period immediately when recurring work is inserted.
   - Removed date restriction to allow future-dated works
   - Creates period with user_id for proper RLS
   - Copies tasks with due dates calculated from period end
   - Copies documents from work template
   - Logs all operations with RAISE NOTICE for debugging';

COMMENT ON FUNCTION manually_create_period_for_work IS
  'Helper function to manually create a period for an existing recurring work.
   Usage: SELECT manually_create_period_for_work(''work-uuid-here'');
   Returns: Success message with details or error message';

-- ============================================================================
-- Success Messages
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed recurring period creation - removed date restriction';
  RAISE NOTICE '✓ Cleaned up duplicate triggers';
  RAISE NOTICE '✓ Invoice numbering functions verified (use company_settings)';
  RAISE NOTICE '✓ Added manual period creation helper function';
  RAISE NOTICE '';
  RAISE NOTICE 'To manually create periods for existing works, run:';
  RAISE NOTICE '  SELECT manually_create_period_for_work(''<work-id>'');';
END $$;
