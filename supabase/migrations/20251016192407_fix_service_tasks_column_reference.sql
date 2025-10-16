/*
  # Fix service_tasks column reference in trigger functions

  This migration fixes the column reference error where functions were trying to use
  `st.task_name` but the actual column name is `st.title` in the service_tasks table.

  ## Changes Made
  1. Drop and recreate `create_initial_recurring_period_on_work_insert` function with correct column name
  2. Drop and recreate `generate_next_recurring_periods` function with correct column name
  
  Both functions now correctly reference `st.title` instead of `st.task_name`.
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
      
      -- Copy tasks from service template (using 'title' column, not 'task_name')
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        task_name,
        description,
        due_date_offset_days,
        due_date,
        status,
        display_order
      )
      SELECT 
        v_new_period_id,
        st.title,  -- FIXED: was st.task_name
        st.description,
        st.due_date_offset_days,
        v_period_dates.period_end_date + st.due_date_offset_days,
        'pending',
        st.sort_order  -- FIXED: was st.display_order
      FROM service_tasks st
      WHERE st.service_id = NEW.service_id
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
        
        -- Copy tasks from service template (using 'title' column, not 'task_name')
        INSERT INTO recurring_period_tasks (
          work_recurring_instance_id,
          task_name,
          description,
          due_date_offset_days,
          due_date,
          status,
          display_order
        )
        SELECT 
          v_new_period_id,
          st.title,  -- FIXED: was st.task_name
          st.description,
          st.due_date_offset_days,
          v_period_dates.period_end_date + st.due_date_offset_days,
          'pending',
          st.sort_order  -- FIXED: was st.display_order
        FROM service_tasks st
        WHERE st.service_id = v_work.service_id
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
