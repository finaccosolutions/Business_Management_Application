/*
  # Fix Duplicate Tasks and Correct Due Date Calculation

  ## Problems Found
  1. Duplicate tasks being created in periods (2x GSTR1, 2x GSTR3B instead of 1 each)
  2. Wrong due date calculation - using work.start_date instead of period_end_date
  3. Tasks not respecting the due_date_offset_days properly

  ## Root Cause
  The trigger `trigger_generate_period_tasks` is creating duplicate tasks because:
  - It's firing AFTER INSERT on work_recurring_instances
  - But the main trigger `handle_new_recurring_work_initial_period` already copies tasks
  - This causes DOUBLE task creation

  ## Solution
  1. DROP the duplicate task generation trigger
  2. Keep task creation ONLY in handle_new_recurring_work_initial_period
  3. Fix the due date calculation logic to use period_end_date correctly

  ## Due Date Logic
  For GST filing:
  - Period: Sep 1-30 (reporting period)
  - GSTR-1 due: Oct 10 (offset 10 days from period end)
  - GSTR-3B due: Oct 20 (offset 20 days from period end)
  
  Formula: due_date = period_end_date + offset_days
*/

-- Drop the duplicate task generation trigger
DROP TRIGGER IF EXISTS trigger_generate_period_tasks ON work_recurring_instances;

-- Drop the function that creates duplicate tasks
DROP FUNCTION IF EXISTS generate_period_tasks_for_instance();

-- Now fix the main function to calculate due dates correctly
CREATE OR REPLACE FUNCTION handle_new_recurring_work_initial_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_new_period_id UUID;
  v_task RECORD;
  v_calculated_due_date DATE;
BEGIN
  -- Only proceed if this is a new recurring work
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;

  -- Calculate first period dates
  v_period_start := NEW.start_date;

  -- Use recurrence_pattern (not recurring_frequency)
  CASE NEW.recurrence_pattern
    WHEN 'monthly' THEN
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
    WHEN 'quarterly' THEN
      v_period_end := (v_period_start + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'Q' || TO_CHAR(v_period_start, 'Q YYYY');
    WHEN 'half_yearly' THEN
      v_period_end := (v_period_start + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      v_period_name := 'H' || CEIL(EXTRACT(MONTH FROM v_period_start) / 6.0)::TEXT || ' ' || TO_CHAR(v_period_start, 'YYYY');
    WHEN 'yearly' THEN
      v_period_end := (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      v_period_name := 'FY ' || TO_CHAR(v_period_start, 'YYYY-') || TO_CHAR(v_period_start + INTERVAL '1 year', 'YY');
    ELSE
      -- Default to monthly
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  END CASE;

  -- Create initial recurring period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    billing_amount,
    status,
    is_billed,
    total_tasks,
    completed_tasks,
    all_tasks_completed
  ) VALUES (
    NEW.id,
    v_period_name,
    v_period_start,
    v_period_end,
    NEW.billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks for the new period with CORRECT due date calculation
  FOR v_task IN 
    SELECT st.* 
    FROM service_tasks st
    WHERE st.service_id = NEW.service_id 
    AND st.is_active = true
    ORDER BY st.sort_order
  LOOP
    -- Calculate due date: period_end_date + offset_days
    v_calculated_due_date := NULL;

    IF v_task.due_date_offset_days IS NOT NULL THEN
      -- Correct formula: period end + offset days
      v_calculated_due_date := v_period_end + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSIF v_task.due_day_of_month IS NOT NULL THEN
      -- Calculate based on specific day of month after period ends
      v_calculated_due_date := make_date(
        EXTRACT(YEAR FROM v_period_end)::INTEGER,
        EXTRACT(MONTH FROM v_period_end)::INTEGER,
        LEAST(v_task.due_day_of_month, 
          EXTRACT(DAY FROM (date_trunc('month', v_period_end) + interval '1 month' - interval '1 day'))::INTEGER
        )
      );
    ELSE
      -- Default: 10 days after period ends
      v_calculated_due_date := v_period_end + INTERVAL '10 days';
    END IF;

    -- Insert recurring period task (only once, no duplicates)
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      due_date,
      assigned_to,
      status
    ) VALUES (
      v_new_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_calculated_due_date,
      v_task.default_assigned_to,
      'pending'
    );
  END LOOP;

  -- Update task counts
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks 
    WHERE work_recurring_instance_id = v_new_period_id
  )
  WHERE id = v_new_period_id;

  RETURN NEW;
END;
$$;
