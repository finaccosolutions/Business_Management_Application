/*
  # Refactor Recurring Periods - Remove Period Due Date

  ## Changes Made

  1. **Remove due_date from work_recurring_instances**
     - Drop the due_date column (periods don't need due dates, only tasks do)
     - Remove related indexes on due_date

  2. **Task Due Dates**
     - recurring_period_tasks already has due_date column
     - Each task has individual due dates for tracking

  3. **Update Period Generation Trigger**
     - Only create new periods when current date has elapsed the previous period's end date
     - For monthly: create new period only after the last day of month has passed
     - For yearly: create new period only after financial year end date (March 31) has passed
     - For quarterly: create new period only after quarter end date has passed

  4. **Update Helper Columns**
     - Remove next_task_due_date from work_recurring_instances
     - Keep all_tasks_completed and task counts for status tracking

  ## Rationale
  
  - Periods represent time ranges (start_date to end_date)
  - Tasks within periods have individual due dates
  - Period status is determined by task completion
  - New periods should only be created when the current period's end date has been reached
*/

-- Drop due_date related indexes
DROP INDEX IF EXISTS idx_work_recurring_instances_due_date;

-- Remove due_date and next_task_due_date columns from work_recurring_instances
ALTER TABLE work_recurring_instances 
DROP COLUMN IF EXISTS due_date,
DROP COLUMN IF EXISTS next_task_due_date;

-- Update the period generation trigger to only create periods after the previous period ends
CREATE OR REPLACE FUNCTION generate_next_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_recurrence_pattern TEXT;
  v_recurrence_day INTEGER;
  v_last_period_end DATE;
  v_new_period_start DATE;
  v_new_period_end DATE;
  v_new_period_name TEXT;
  v_billing_amount NUMERIC;
  v_new_period_id UUID;
BEGIN
  -- Only proceed if work is recurring
  IF NEW.is_recurring != TRUE THEN
    RETURN NEW;
  END IF;

  -- Get work details
  SELECT recurrence_pattern, recurrence_day, billing_amount
  INTO v_recurrence_pattern, v_recurrence_day, v_billing_amount
  FROM works
  WHERE id = NEW.work_id;

  -- Get the last period's end date
  SELECT period_end_date
  INTO v_last_period_end
  FROM work_recurring_instances
  WHERE work_id = NEW.work_id
  ORDER BY period_end_date DESC
  LIMIT 1;

  -- Only generate new period if:
  -- 1. Current date has passed the last period's end date
  -- 2. OR there are no periods yet
  IF v_last_period_end IS NULL OR CURRENT_DATE > v_last_period_end THEN
    
    -- Calculate next period dates based on pattern
    IF v_last_period_end IS NULL THEN
      -- First period: use work start date
      v_new_period_start := NEW.start_date;
    ELSE
      -- Next period: start the day after previous period ends
      v_new_period_start := v_last_period_end + INTERVAL '1 day';
    END IF;

    -- Calculate period end date based on recurrence pattern
    IF v_recurrence_pattern = 'monthly' THEN
      -- End of month
      v_new_period_end := (DATE_TRUNC('month', v_new_period_start) + INTERVAL '1 month - 1 day')::DATE;
      v_new_period_name := TO_CHAR(v_new_period_start, 'Month YYYY');
      
    ELSIF v_recurrence_pattern = 'quarterly' THEN
      -- End of quarter (3 months)
      v_new_period_end := (DATE_TRUNC('month', v_new_period_start) + INTERVAL '3 months - 1 day')::DATE;
      v_new_period_name := 'Q' || TO_CHAR(v_new_period_start, 'Q YYYY');
      
    ELSIF v_recurrence_pattern = 'yearly' THEN
      -- Financial year end: March 31
      IF EXTRACT(MONTH FROM v_new_period_start) <= 3 THEN
        v_new_period_end := MAKE_DATE(EXTRACT(YEAR FROM v_new_period_start)::INT, 3, 31);
      ELSE
        v_new_period_end := MAKE_DATE((EXTRACT(YEAR FROM v_new_period_start) + 1)::INT, 3, 31);
      END IF;
      v_new_period_name := 'FY ' || TO_CHAR(v_new_period_start, 'YYYY-') || TO_CHAR(v_new_period_end, 'YY');
      
    ELSIF v_recurrence_pattern = 'half_yearly' THEN
      -- 6 months
      v_new_period_end := (DATE_TRUNC('month', v_new_period_start) + INTERVAL '6 months - 1 day')::DATE;
      v_new_period_name := 'H' || CEIL(EXTRACT(MONTH FROM v_new_period_start) / 6.0)::TEXT || ' ' || TO_CHAR(v_new_period_start, 'YYYY');
      
    ELSE
      -- Default: 1 month
      v_new_period_end := (DATE_TRUNC('month', v_new_period_start) + INTERVAL '1 month - 1 day')::DATE;
      v_new_period_name := TO_CHAR(v_new_period_start, 'Month YYYY');
    END IF;

    -- Only create period if we don't already have one for this date range
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = NEW.work_id
      AND period_start_date = v_new_period_start
      AND period_end_date = v_new_period_end
    ) THEN
      -- Insert new period
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
        NEW.work_id,
        v_new_period_name,
        v_new_period_start,
        v_new_period_end,
        v_billing_amount,
        'pending',
        FALSE,
        0,
        0,
        FALSE
      )
      RETURNING id INTO v_new_period_id;

      -- Copy tasks from service templates to this period
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        title,
        description,
        assigned_to,
        status,
        priority,
        estimated_hours,
        sort_order,
        due_date
      )
      SELECT
        v_new_period_id,
        st.title,
        st.description,
        NEW.assigned_to,
        'pending',
        st.priority,
        st.estimated_hours,
        st.sort_order,
        -- Set task due date relative to period end
        CASE 
          WHEN st.due_date_offset IS NOT NULL THEN v_new_period_end - (st.due_date_offset || ' days')::INTERVAL
          ELSE v_new_period_end
        END
      FROM service_tasks st
      WHERE st.service_id = NEW.service_id
      ORDER BY st.sort_order;

      -- Update task counts
      UPDATE work_recurring_instances
      SET total_tasks = (
        SELECT COUNT(*) FROM recurring_period_tasks 
        WHERE work_recurring_instance_id = v_new_period_id
      )
      WHERE id = v_new_period_id;

      -- Copy documents from work to this period
      INSERT INTO work_recurring_period_documents (
        work_recurring_instance_id,
        work_document_id,
        is_collected,
        notes
      )
      SELECT
        v_new_period_id,
        wd.id,
        FALSE,
        NULL
      FROM work_documents wd
      WHERE wd.work_id = NEW.work_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_generate_recurring_periods ON works;
CREATE TRIGGER trigger_generate_recurring_periods
  AFTER INSERT OR UPDATE OF is_recurring, start_date, service_id
  ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = TRUE)
  EXECUTE FUNCTION generate_next_recurring_period();

-- Update task completion tracking
CREATE OR REPLACE FUNCTION update_period_task_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_total_tasks INTEGER;
  v_completed_tasks INTEGER;
  v_all_completed BOOLEAN;
BEGIN
  -- Count tasks
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_tasks, v_completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);

  v_all_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

  -- Update period
  UPDATE work_recurring_instances
  SET 
    total_tasks = v_total_tasks,
    completed_tasks = v_completed_tasks,
    all_tasks_completed = v_all_completed,
    status = CASE 
      WHEN v_all_completed THEN 'completed'
      WHEN v_completed_tasks > 0 THEN 'in_progress'
      ELSE status
    END,
    completed_at = CASE
      WHEN v_all_completed AND completed_at IS NULL THEN NOW()
      WHEN NOT v_all_completed THEN NULL
      ELSE completed_at
    END,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_update_period_task_completion ON recurring_period_tasks;
CREATE TRIGGER trigger_update_period_task_completion
  AFTER INSERT OR UPDATE OR DELETE
  ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_period_task_completion();
