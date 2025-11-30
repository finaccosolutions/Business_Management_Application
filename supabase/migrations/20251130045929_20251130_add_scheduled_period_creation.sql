/*
  # Add Scheduled Period Creation for Recurring Works
  
  ## Purpose
  Create a function to handle automatic period creation when task due dates are reached.
  This function should be called daily or at regular intervals to check and create periods
  for recurring works that now have eligible due dates.
  
  ## How It Works
  1. Find all recurring works that don't have periods created for eligible dates
  2. For each work, check all possible periods based on recurrence type
  3. Create periods and tasks where last task due date has been reached
*/

-- Function to process period creation for all recurring works
CREATE OR REPLACE FUNCTION process_recurring_work_periods()
RETURNS TABLE(work_id UUID, periods_created INT) AS $$
DECLARE
  v_work RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_current_date DATE;
  v_periods_created INT;
  v_service_id UUID;
  v_recurrence_type TEXT;
BEGIN
  v_current_date := CURRENT_DATE;
  
  -- Iterate through all recurring works
  FOR v_work IN
    SELECT w.id, w.service_id, w.recurrence_pattern, w.start_date
    FROM works w
    WHERE w.is_recurring = TRUE
    ORDER BY w.created_at DESC
  LOOP
    v_periods_created := 0;
    v_service_id := v_work.service_id;
    v_recurrence_type := COALESCE(v_work.recurrence_pattern, 'monthly');
    
    -- Handle monthly recurrence
    IF v_recurrence_type = 'monthly' THEN
      v_period_start := DATE_TRUNC('month', v_work.start_date)::DATE;
      
      -- Check periods up to current date
      WHILE v_period_start <= v_current_date LOOP
        v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        
        -- Try to create period if eligible
        IF create_period_with_all_tasks(v_work.id, v_period_start, v_period_end, 'monthly', v_current_date) THEN
          v_periods_created := v_periods_created + 1;
        END IF;
        
        v_period_start := v_period_start + INTERVAL '1 month';
      END LOOP;
    
    -- Handle quarterly recurrence
    ELSIF v_recurrence_type = 'quarterly' THEN
      v_period_start := DATE_TRUNC('quarter', v_work.start_date)::DATE;
      
      WHILE v_period_start <= v_current_date LOOP
        v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
        
        IF create_period_with_all_tasks(v_work.id, v_period_start, v_period_end, 'quarterly', v_current_date) THEN
          v_periods_created := v_periods_created + 1;
        END IF;
        
        v_period_start := v_period_start + INTERVAL '3 months';
      END LOOP;
    
    -- Handle yearly recurrence
    ELSIF v_recurrence_type = 'yearly' THEN
      v_period_start := DATE_TRUNC('year', v_work.start_date)::DATE;
      
      WHILE v_period_start <= v_current_date LOOP
        v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
        
        IF create_period_with_all_tasks(v_work.id, v_period_start, v_period_end, 'yearly', v_current_date) THEN
          v_periods_created := v_periods_created + 1;
        END IF;
        
        v_period_start := v_period_start + INTERVAL '1 year';
      END LOOP;
    END IF;
    
    -- Return results
    work_id := v_work.id;
    periods_created := v_periods_created;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to manually trigger period creation for a specific work
CREATE OR REPLACE FUNCTION create_pending_periods_for_work(p_work_id UUID)
RETURNS INT AS $$
DECLARE
  v_work RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_current_date DATE;
  v_periods_created INT := 0;
  v_service_id UUID;
  v_recurrence_type TEXT;
BEGIN
  v_current_date := CURRENT_DATE;
  
  SELECT id, service_id, recurrence_pattern, start_date
  INTO v_work
  FROM works
  WHERE id = p_work_id AND is_recurring = TRUE;
  
  IF v_work IS NULL THEN
    RETURN 0;
  END IF;
  
  v_service_id := v_work.service_id;
  v_recurrence_type := COALESCE(v_work.recurrence_pattern, 'monthly');
  
  -- Handle monthly recurrence
  IF v_recurrence_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_work.start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      
      IF create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'monthly', v_current_date) THEN
        v_periods_created := v_periods_created + 1;
      END IF;
      
      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;
  
  -- Handle quarterly recurrence
  ELSIF v_recurrence_type = 'quarterly' THEN
    v_period_start := DATE_TRUNC('quarter', v_work.start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      
      IF create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'quarterly', v_current_date) THEN
        v_periods_created := v_periods_created + 1;
      END IF;
      
      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;
  
  -- Handle yearly recurrence
  ELSIF v_recurrence_type = 'yearly' THEN
    v_period_start := DATE_TRUNC('year', v_work.start_date)::DATE;
    
    WHILE v_period_start <= v_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      
      IF create_period_with_all_tasks(p_work_id, v_period_start, v_period_end, 'yearly', v_current_date) THEN
        v_periods_created := v_periods_created + 1;
      END IF;
      
      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
  
  RETURN v_periods_created;
END;
$$ LANGUAGE plpgsql;
