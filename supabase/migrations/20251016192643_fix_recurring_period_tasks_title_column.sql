/*
  # Fix recurring_period_tasks title column mapping

  The trigger functions were inserting into 'task_name' column, but the table
  requires 'title' to be NOT NULL. This migration updates the functions to
  insert into the 'title' column instead.

  ## Changes
  1. Update create_initial_recurring_period_on_work_insert to use 'title' column
  2. Update generate_next_recurring_periods to use 'title' column
  3. Use 'sort_order' instead of 'display_order' to match table structure
*/

-- Fix the create_initial_recurring_period_on_work_insert function
CREATE OR REPLACE FUNCTION create_initial_recurring_period_on_work_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_period_dates RECORD;
  v_new_period_id UUID;
  v_period_type TEXT;
BEGIN
  -- Only create period if work has recurrence pattern and start date is in the past
  IF NEW.recurrence_pattern IS NOT NULL 
     AND NEW.recurrence_pattern != ''
     AND NEW.start_date <= CURRENT_DATE THEN
    
    -- Use period_calculation_type if available, default to 'previous_period'
    v_period_type := COALESCE(NEW.period_calculation_type, 'previous_period');
    
    -- Calculate period dates based on pattern and type
    SELECT * INTO v_period_dates
    FROM calculate_period_dates(NEW.recurrence_pattern, v_period_type, CURRENT_DATE);
    
    -- Check if this period already exists
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = NEW.id
        AND period_start_date = v_period_dates.period_start_date
        AND period_end_date = v_period_dates.period_end_date
    ) THEN
      -- Create the period
      INSERT INTO work_recurring_instances (
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        status,
        billing_amount
      ) VALUES (
        NEW.id,
        v_period_dates.period_name,
        v_period_dates.period_start_date,
        v_period_dates.period_end_date,
        'pending',
        NEW.billing_amount
      )
      RETURNING id INTO v_new_period_id;
      
      -- Copy tasks from service template
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,  -- FIXED: insert into 'title', not 'task_name'
        description,
        due_date_offset_days,
        due_date,
        status,
        sort_order  -- FIXED: use 'sort_order', not 'display_order'
      )
      SELECT 
        v_new_period_id,
        st.id,
        st.title,
        st.description,
        st.due_date_offset_days,
        v_period_dates.period_end_date + st.due_date_offset_days,
        'pending',
        st.sort_order
      FROM service_tasks st
      WHERE st.service_id = NEW.service_id
        AND st.is_active = true
      ORDER BY st.sort_order;
      
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
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix the generate_next_recurring_periods function
CREATE OR REPLACE FUNCTION generate_next_recurring_periods()
RETURNS TABLE(work_id UUID, period_name TEXT, period_start_date DATE, period_end_date DATE) AS $$
DECLARE
  v_work RECORD;
  v_latest_period RECORD;
  v_period_dates RECORD;
  v_new_period_id UUID;
  v_should_generate BOOLEAN;
  v_period_type TEXT;
BEGIN
  -- Loop through all active recurring works
  FOR v_work IN 
    SELECT w.id, w.service_id, w.recurrence_pattern, w.period_calculation_type, w.billing_amount, w.start_date
    FROM works w
    WHERE w.recurrence_pattern IS NOT NULL 
      AND w.recurrence_pattern != ''
      AND w.status != 'completed'
      AND w.start_date <= CURRENT_DATE
  LOOP
    -- Get the latest period for this work
    SELECT wri.*
    INTO v_latest_period
    FROM work_recurring_instances wri
    WHERE wri.work_id = v_work.id
    ORDER BY wri.period_end_date DESC
    LIMIT 1;
    
    v_should_generate := FALSE;
    
    -- Determine if we should generate a new period
    IF v_latest_period IS NULL THEN
      -- No periods exist, create the first one
      v_should_generate := TRUE;
    ELSIF v_latest_period.period_end_date < CURRENT_DATE THEN
      -- Latest period has ended, create next one
      v_should_generate := TRUE;
    END IF;
    
    IF v_should_generate THEN
      v_period_type := COALESCE(v_work.period_calculation_type, 'previous_period');
      
      -- Calculate the next period dates
      SELECT * INTO v_period_dates
      FROM calculate_period_dates(v_work.recurrence_pattern, v_period_type, CURRENT_DATE);
      
      -- Check if this period already exists (avoid duplicates)
      IF NOT EXISTS (
        SELECT 1 FROM work_recurring_instances
        WHERE work_id = v_work.id
          AND period_start_date = v_period_dates.period_start_date
          AND period_end_date = v_period_dates.period_end_date
      ) THEN
        -- Create the new period
        INSERT INTO work_recurring_instances (
          work_id,
          period_name,
          period_start_date,
          period_end_date,
          status,
          billing_amount
        ) VALUES (
          v_work.id,
          v_period_dates.period_name,
          v_period_dates.period_start_date,
          v_period_dates.period_end_date,
          'pending',
          v_work.billing_amount
        )
        RETURNING id INTO v_new_period_id;
        
        -- Copy tasks from service template
        INSERT INTO recurring_period_tasks (
          work_recurring_instance_id,
          service_task_id,
          title,  -- FIXED: insert into 'title', not 'task_name'
          description,
          due_date_offset_days,
          due_date,
          status,
          sort_order  -- FIXED: use 'sort_order', not 'display_order'
        )
        SELECT 
          v_new_period_id,
          st.id,
          st.title,
          st.description,
          st.due_date_offset_days,
          v_period_dates.period_end_date + st.due_date_offset_days,
          'pending',
          st.sort_order
        FROM service_tasks st
        WHERE st.service_id = v_work.service_id
          AND st.is_active = true
        ORDER BY st.sort_order;
        
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
        WHERE wd.work_id = v_work.id;
        
        -- Return the generated period info
        work_id := v_work.id;
        period_name := v_period_dates.period_name;
        period_start_date := v_period_dates.period_start_date;
        period_end_date := v_period_dates.period_end_date;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;
