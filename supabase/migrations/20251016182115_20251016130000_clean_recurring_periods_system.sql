/*
  # Clean Recurring Periods System

  ## Concept
  This implements a simple, predictable recurring period system:

  1. **Manual Period Creation**
     - User creates first period manually with start/end dates
     - System copies tasks and documents to the period
     - Tasks get due dates based on period_end_date + offset_days

  2. **Automatic Next Period Generation**
     - When a period's end date has elapsed, system creates next period
     - Next period starts the day after previous period ends
     - Period length matches the recurrence pattern (monthly, quarterly, etc.)

  3. **No Duplicates**
     - Only ONE trigger handles period creation on work insert
     - Clear, simple logic with duplicate prevention

  ## Tables
  - work_recurring_instances: stores each period
  - recurring_period_tasks: tasks for each period
  - work_recurring_period_documents: documents for each period
*/

-- ============================================================================
-- STEP 1: Clean up all existing triggers and functions
-- ============================================================================

-- Drop all existing triggers
DROP TRIGGER IF EXISTS trigger_handle_new_recurring_work_initial_period ON works;
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;
DROP TRIGGER IF EXISTS trigger_generate_period_tasks ON work_recurring_instances;
DROP TRIGGER IF EXISTS trigger_copy_period_documents ON work_recurring_instances;

-- Drop all existing functions
DROP FUNCTION IF EXISTS handle_new_recurring_work_initial_period() CASCADE;
DROP FUNCTION IF EXISTS create_initial_recurring_period() CASCADE;
DROP FUNCTION IF EXISTS generate_period_tasks_for_instance() CASCADE;
DROP FUNCTION IF EXISTS copy_documents_for_period() CASCADE;

-- ============================================================================
-- STEP 2: Ensure work_recurring_instances table has correct structure
-- ============================================================================

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add total_tasks column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances'
    AND column_name = 'total_tasks'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN total_tasks INTEGER DEFAULT 0;
  END IF;

  -- Add completed_tasks column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances'
    AND column_name = 'completed_tasks'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN completed_tasks INTEGER DEFAULT 0;
  END IF;

  -- Add all_tasks_completed column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances'
    AND column_name = 'all_tasks_completed'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN all_tasks_completed BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Create simple function to calculate next period dates
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_next_period_dates(
  p_current_end_date DATE,
  p_recurrence_pattern TEXT,
  OUT next_start_date DATE,
  OUT next_end_date DATE,
  OUT next_period_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Next period starts day after current period ends
  next_start_date := p_current_end_date + INTERVAL '1 day';

  -- Calculate end date based on recurrence pattern
  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      next_end_date := (next_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      next_period_name := TO_CHAR(next_start_date, 'Month YYYY');

    WHEN 'quarterly' THEN
      next_end_date := (next_start_date + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
      next_period_name := 'Q' || TO_CHAR(next_start_date, 'Q YYYY');

    WHEN 'half_yearly' THEN
      next_end_date := (next_start_date + INTERVAL '6 months' - INTERVAL '1 day')::DATE;
      next_period_name := 'H' || CEIL(EXTRACT(MONTH FROM next_start_date) / 6.0)::TEXT || ' ' || TO_CHAR(next_start_date, 'YYYY');

    WHEN 'yearly' THEN
      next_end_date := (next_start_date + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
      next_period_name := 'FY ' || TO_CHAR(next_start_date, 'YYYY-') || TO_CHAR(next_start_date + INTERVAL '1 year', 'YY');

    ELSE
      -- Default to monthly
      next_end_date := (next_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      next_period_name := TO_CHAR(next_start_date, 'Month YYYY');
  END CASE;
END;
$$;

-- ============================================================================
-- STEP 4: Function to copy tasks to a period with correct due dates
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_tasks_to_period(
  p_period_id UUID,
  p_service_id UUID,
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
BEGIN
  -- Copy all active service tasks to this period
  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Calculate due date based on period end date + offset
    IF v_task.due_date_offset_days IS NOT NULL THEN
      v_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSE
      -- Default: 10 days after period ends
      v_due_date := p_period_end_date + INTERVAL '10 days';
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

  RETURN v_task_count;
END;
$$;

-- ============================================================================
-- STEP 5: Function to copy documents to a period
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_documents_to_period(
  p_period_id UUID,
  p_work_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_doc_count INTEGER := 0;
BEGIN
  -- Copy all work documents to this period
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    notes
  )
  SELECT
    p_period_id,
    wd.id,
    FALSE,
    NULL
  FROM work_documents wd
  WHERE wd.work_id = p_work_id;

  GET DIAGNOSTICS v_doc_count = ROW_COUNT;
  RETURN v_doc_count;
END;
$$;

-- ============================================================================
-- STEP 6: Main function to create first period when work is created
-- ============================================================================

CREATE OR REPLACE FUNCTION create_first_recurring_period()
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
  v_task_count INTEGER;
BEGIN
  -- Only for new recurring works
  IF TG_OP != 'INSERT' OR NEW.is_recurring != TRUE THEN
    RETURN NEW;
  END IF;

  -- Calculate first period (use work start date as period start)
  v_period_start := NEW.start_date;

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
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  END CASE;

  -- Check if first period already exists (prevent duplicates)
  IF EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = NEW.id
    AND period_start_date = v_period_start
  ) THEN
    RETURN NEW;
  END IF;

  -- Create first period
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

  -- Copy tasks to period
  v_task_count := copy_tasks_to_period(
    v_new_period_id,
    NEW.service_id,
    v_period_end,
    NEW.assigned_to
  );

  -- Update task count
  UPDATE work_recurring_instances
  SET total_tasks = v_task_count
  WHERE id = v_new_period_id;

  -- Copy documents to period
  PERFORM copy_documents_to_period(v_new_period_id, NEW.id);

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 7: Function to generate next period (called manually or by cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_next_recurring_periods()
RETURNS TABLE (
  work_id UUID,
  work_name TEXT,
  new_period_id UUID,
  new_period_name TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_work RECORD;
  v_latest_period RECORD;
  v_next_start DATE;
  v_next_end DATE;
  v_next_name TEXT;
  v_new_period_id UUID;
  v_task_count INTEGER;
BEGIN
  -- Find all recurring works with elapsed periods
  FOR v_work IN
    SELECT DISTINCT w.*
    FROM works w
    WHERE w.is_recurring = TRUE
    AND w.status = 'active'
  LOOP
    -- Get latest period for this work
    SELECT * INTO v_latest_period
    FROM work_recurring_instances
    WHERE work_id = v_work.id
    ORDER BY period_end_date DESC
    LIMIT 1;

    -- Skip if no period exists or period hasn't elapsed
    IF v_latest_period IS NULL OR v_latest_period.period_end_date >= CURRENT_DATE THEN
      CONTINUE;
    END IF;

    -- Calculate next period dates
    SELECT * INTO v_next_start, v_next_end, v_next_name
    FROM calculate_next_period_dates(
      v_latest_period.period_end_date,
      v_work.recurrence_pattern
    );

    -- Check if next period already exists
    IF EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = v_work.id
      AND period_start_date = v_next_start
    ) THEN
      CONTINUE;
    END IF;

    -- Create next period
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
      v_work.id,
      v_next_name,
      v_next_start,
      v_next_end,
      v_work.billing_amount,
      'pending',
      FALSE,
      0,
      0,
      FALSE
    )
    RETURNING id INTO v_new_period_id;

    -- Copy tasks
    v_task_count := copy_tasks_to_period(
      v_new_period_id,
      v_work.service_id,
      v_next_end,
      v_work.assigned_to
    );

    -- Update task count
    UPDATE work_recurring_instances
    SET total_tasks = v_task_count
    WHERE id = v_new_period_id;

    -- Copy documents
    PERFORM copy_documents_to_period(v_new_period_id, v_work.id);

    -- Return result
    work_id := v_work.id;
    work_name := v_work.title;
    new_period_id := v_new_period_id;
    new_period_name := v_next_name;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ============================================================================
-- STEP 8: Create trigger for automatic first period creation
-- ============================================================================

CREATE TRIGGER trigger_create_first_recurring_period
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION create_first_recurring_period();

-- ============================================================================
-- STEP 9: Update task completion tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION update_period_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
BEGIN
  -- Count total and completed tasks for the period
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);

  -- Update period
  UPDATE work_recurring_instances
  SET
    total_tasks = v_total,
    completed_tasks = v_completed,
    all_tasks_completed = (v_total > 0 AND v_total = v_completed),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.work_recurring_instance_id, OLD.work_recurring_instance_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_update_period_task_completion ON recurring_period_tasks;

-- Create trigger for task completion tracking
CREATE TRIGGER trigger_update_period_task_completion
  AFTER INSERT OR UPDATE OR DELETE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_period_task_completion();

-- ============================================================================
-- DONE
-- ============================================================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_next_period_dates TO authenticated;
GRANT EXECUTE ON FUNCTION copy_tasks_to_period TO authenticated;
GRANT EXECUTE ON FUNCTION copy_documents_to_period TO authenticated;
GRANT EXECUTE ON FUNCTION generate_next_recurring_periods TO authenticated;
