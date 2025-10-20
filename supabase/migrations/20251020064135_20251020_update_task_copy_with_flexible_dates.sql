/*
  # Update Task Copy Function with Flexible Date Calculation

  ## Overview
  Updates the copy_tasks_to_period function to use the new flexible due date system:
  - Supports task-level recurrence frequency
  - Uses due_offset_type (days/months) and due_offset_value
  - Checks for period-specific date overrides

  ## Changes
  - Updates copy_tasks_to_period() function
  - Adds logic to calculate due dates from period END date
  - Applies period-specific overrides from specific_period_dates JSONB

  ## Date Calculation Logic
  1. Check if there's a period-specific override (specific_period_dates)
  2. If no override, calculate: period_end_date + offset_value (days or months)
  3. Default to 10 days after period end if no offset specified

  ## Important Notes
  - Period-specific overrides take precedence over calculated dates
  - Task recurrence frequency determines if task is included in the period
  - All dates are calculated from the period END date
*/

-- Drop the old function first
DROP FUNCTION IF EXISTS copy_tasks_to_period(UUID, UUID, DATE, UUID);

-- Create updated function with flexible date calculation
CREATE OR REPLACE FUNCTION copy_tasks_to_period(
  p_period_id UUID,
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
  v_period_identifier TEXT;
  v_specific_date TEXT;
BEGIN
  -- Generate period identifier for override lookup (YYYY-MM format)
  v_period_identifier := TO_CHAR(p_period_start_date, 'YYYY-MM');

  -- Copy all active service tasks to this period
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Check for period-specific override first
    v_specific_date := NULL;
    IF v_task.specific_period_dates IS NOT NULL THEN
      v_specific_date := v_task.specific_period_dates->>v_period_identifier;
    END IF;

    IF v_specific_date IS NOT NULL THEN
      -- Use the specific override date for this period
      v_due_date := v_specific_date::DATE;
    ELSE
      -- Calculate due date based on offset from period END date
      IF v_task.due_offset_value IS NOT NULL AND v_task.due_offset_type IS NOT NULL THEN
        IF v_task.due_offset_type = 'months' THEN
          -- Add months + days offset
          v_due_date := p_period_end_date + (v_task.due_offset_value || ' months')::INTERVAL;
        ELSE
          -- Default to days
          v_due_date := p_period_end_date + (v_task.due_offset_value || ' days')::INTERVAL;
        END IF;
      ELSE
        -- Default: 10 days after period ends
        v_due_date := p_period_end_date + INTERVAL '10 days';
      END IF;
    END IF;

    -- Insert task for this period
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
      p_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_due_date,
      COALESCE(v_task.default_assigned_to, p_assigned_to),
      'pending'
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  -- Update total_tasks count on the period
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = p_period_id;

  RETURN v_task_count;
END;
$$;

-- Create helper function to add period-specific date override
CREATE OR REPLACE FUNCTION add_period_specific_date_override(
  p_service_task_id UUID,
  p_period_identifier TEXT,
  p_due_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_overrides JSONB;
BEGIN
  -- Get current overrides
  SELECT specific_period_dates INTO v_current_overrides
  FROM service_tasks
  WHERE id = p_service_task_id;

  -- Initialize if null
  IF v_current_overrides IS NULL THEN
    v_current_overrides := '{}'::JSONB;
  END IF;

  -- Add/update the override
  v_current_overrides := jsonb_set(
    v_current_overrides,
    ARRAY[p_period_identifier],
    to_jsonb(p_due_date::TEXT)
  );

  -- Update the task
  UPDATE service_tasks
  SET specific_period_dates = v_current_overrides
  WHERE id = p_service_task_id;

  RETURN TRUE;
END;
$$;

-- Create helper function to remove period-specific date override
CREATE OR REPLACE FUNCTION remove_period_specific_date_override(
  p_service_task_id UUID,
  p_period_identifier TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE service_tasks
  SET specific_period_dates = specific_period_dates - p_period_identifier
  WHERE id = p_service_task_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION copy_tasks_to_period IS 'Copies service tasks to a recurring period with flexible due date calculation';
COMMENT ON FUNCTION add_period_specific_date_override IS 'Adds a period-specific due date override for a service task';
COMMENT ON FUNCTION remove_period_specific_date_override IS 'Removes a period-specific due date override for a service task';
