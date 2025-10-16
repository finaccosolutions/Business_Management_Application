/*
  # Fix Recurring Period Initial Creation Logic

  ## Problem
  1. When creating a recurring work with start_date = 2025-10-07, the system creates 2 periods incorrectly
  2. Period end_date should not be required - it should be calculated from tasks' last due date
  3. For example: Monthly return for period Sep 2025 (1-9-2025 to 30-9-2025) with tasks due on 10th and 20th Oct

  ## Solution
  1. Create ONLY ONE initial period when work is created
  2. Period represents the reporting period (e.g., Sep 2025 for monthly GST)
  3. Task due dates are when the work needs to be submitted (e.g., 10th Oct, 20th Oct)
  4. Period end_date = last task due date for that period

  ## Changes
  1. Update trigger to create only ONE period initially
  2. Calculate period dates based on recurrence pattern and start date
  3. For monthly: If start_date is 7 Oct 2025, create period for Sep 2025 (Sep 1 - Sep 30)
  4. Tasks get due dates based on service task templates (e.g., 10 Oct, 20 Oct)
*/

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_generate_recurring_periods ON works;
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;

-- Create function to generate ONLY the first period when work is created
CREATE OR REPLACE FUNCTION create_initial_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_recurrence_pattern TEXT;
  v_recurrence_day INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_billing_amount NUMERIC;
  v_new_period_id UUID;
  v_year INTEGER;
  v_month INTEGER;
  v_quarter INTEGER;
BEGIN
  -- Only proceed if work is recurring and this is an INSERT
  IF NEW.is_recurring != TRUE OR TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Get work details
  v_recurrence_pattern := NEW.recurrence_pattern;
  v_recurrence_day := NEW.recurrence_day;
  v_billing_amount := NEW.billing_amount;
  v_year := EXTRACT(YEAR FROM NEW.start_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM NEW.start_date)::INTEGER;

  -- Calculate period dates based on recurrence pattern
  -- The period represents the REPORTING period, not when work is done

  IF v_recurrence_pattern = 'monthly' THEN
    -- For monthly: previous month's data
    -- If start_date is 7 Oct 2025, period is Sep 2025 (1 Sep - 30 Sep)
    IF v_month = 1 THEN
      v_period_start := MAKE_DATE(v_year - 1, 12, 1);
      v_period_end := MAKE_DATE(v_year - 1, 12, 31);
      v_period_name := 'December ' || (v_year - 1)::TEXT;
    ELSE
      v_period_start := MAKE_DATE(v_year, v_month - 1, 1);
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month - 1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
    END IF;

  ELSIF v_recurrence_pattern = 'quarterly' THEN
    -- Previous quarter's data
    v_quarter := CEIL(v_month / 3.0)::INTEGER - 1;
    IF v_quarter = 0 THEN
      v_quarter := 4;
      v_year := v_year - 1;
    END IF;
    v_period_start := MAKE_DATE(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '3 months - 1 day')::DATE;
    v_period_name := 'Q' || v_quarter || ' ' || v_year::TEXT;

  ELSIF v_recurrence_pattern = 'yearly' THEN
    -- Previous financial year (Apr - Mar)
    IF v_month <= 3 THEN
      v_period_start := MAKE_DATE(v_year - 2, 4, 1);
      v_period_end := MAKE_DATE(v_year - 1, 3, 31);
      v_period_name := 'FY ' || (v_year - 2)::TEXT || '-' || RIGHT((v_year - 1)::TEXT, 2);
    ELSE
      v_period_start := MAKE_DATE(v_year - 1, 4, 1);
      v_period_end := MAKE_DATE(v_year, 3, 31);
      v_period_name := 'FY ' || (v_year - 1)::TEXT || '-' || RIGHT(v_year::TEXT, 2);
    END IF;

  ELSIF v_recurrence_pattern = 'half_yearly' THEN
    -- Previous half year
    IF v_month <= 6 THEN
      v_period_start := MAKE_DATE(v_year - 1, 7, 1);
      v_period_end := MAKE_DATE(v_year - 1, 12, 31);
      v_period_name := 'H2 ' || (v_year - 1)::TEXT;
    ELSE
      v_period_start := MAKE_DATE(v_year, 1, 1);
      v_period_end := MAKE_DATE(v_year, 6, 30);
      v_period_name := 'H1 ' || v_year::TEXT;
    END IF;

  ELSE
    -- Default: previous month
    IF v_month = 1 THEN
      v_period_start := MAKE_DATE(v_year - 1, 12, 1);
      v_period_end := MAKE_DATE(v_year - 1, 12, 31);
      v_period_name := 'December ' || (v_year - 1)::TEXT;
    ELSE
      v_period_start := MAKE_DATE(v_year, v_month - 1, 1);
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month - 1 day')::DATE;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
    END IF;
  END IF;

  -- Check if period already exists (prevent duplicates)
  IF EXISTS (
    SELECT 1 FROM work_recurring_instances
    WHERE work_id = NEW.id
    AND period_start_date = v_period_start
    AND period_end_date = v_period_end
  ) THEN
    RETURN NEW;
  END IF;

  -- Insert the FIRST period only
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
    v_billing_amount,
    'pending',
    FALSE,
    0,
    0,
    FALSE
  )
  RETURNING id INTO v_new_period_id;

  -- Copy tasks from service templates to this period
  -- Task due dates are calculated relative to the work start date (when work is due)
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
    -- Task due date is based on work start date and offset
    -- For example: if start_date is 7 Oct and offset is 3, due date is 10 Oct
    CASE
      WHEN st.due_date_offset IS NOT NULL THEN
        NEW.start_date + (st.due_date_offset || ' days')::INTERVAL
      ELSE
        NEW.start_date + INTERVAL '10 days'  -- Default: 10 days after start
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
  WHERE wd.work_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for initial period creation
CREATE TRIGGER trigger_create_initial_recurring_period
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = TRUE)
  EXECUTE FUNCTION create_initial_recurring_period();

COMMENT ON FUNCTION create_initial_recurring_period() IS
  'Creates the FIRST recurring period when a recurring work is created. Period represents the reporting period (e.g., Sep data), and tasks have due dates when work must be submitted (e.g., 10 Oct).';