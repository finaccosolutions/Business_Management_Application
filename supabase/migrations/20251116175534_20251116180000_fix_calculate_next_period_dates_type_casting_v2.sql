/*
  # Fix calculate_next_period_dates Type Casting

  ## Problem
  When creating recurring works, the trigger calls calculate_next_period_dates with timestamp types
  but the function expects date types. Also auto_generate_next_period_for_work uses wrong column names.

  ## Solution
  1. Fix handle_new_recurring_work trigger - cast start_date to DATE
  2. Fix auto_generate_next_period_for_work function - use correct output column names
  3. Fix backfill_missing_periods - drop and recreate with correct types
*/

-- Fix handle_new_recurring_work trigger to cast start_date to DATE
CREATE OR REPLACE FUNCTION handle_new_recurring_work()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id UUID;
  v_task_count INTEGER;
  v_period_dates RECORD;
  v_service_recurrence TEXT;
BEGIN
  -- Only process recurring works
  IF NOT NEW.is_recurring THEN
    RETURN NEW;
  END IF;

  -- Get service recurrence type
  SELECT recurrence_type INTO v_service_recurrence
  FROM services
  WHERE id = NEW.service_id;

  -- Calculate first period dates based on work start date
  -- Cast to DATE to match function parameter type
  SELECT * INTO v_period_dates
  FROM calculate_next_period_dates(
    (COALESCE(NEW.start_date, CURRENT_DATE))::DATE - INTERVAL '1 day',
    COALESCE(v_service_recurrence, NEW.recurrence_pattern)
  );

  -- Create first period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    status
  ) VALUES (
    NEW.id,
    v_period_dates.next_period_name,
    v_period_dates.next_start_date,
    v_period_dates.next_end_date,
    'pending'
  ) RETURNING id INTO v_period_id;

  -- Copy tasks using the updated function that only copies active service tasks
  IF NEW.service_id IS NOT NULL THEN
    v_task_count := copy_tasks_to_period_with_templates(
      v_period_id,
      NEW.id,
      NEW.service_id,
      v_period_dates.next_end_date,
      NEW.assigned_to
    );

    -- Update task count
    UPDATE work_recurring_instances
    SET total_tasks = v_task_count
    WHERE id = v_period_id;
  END IF;

  -- Copy documents
  PERFORM copy_documents_to_period(v_period_id, NEW.id);

  RETURN NEW;
END;
$$;

-- Fix auto_generate_next_period_for_work to use correct column names
CREATE OR REPLACE FUNCTION auto_generate_next_period_for_work(p_work_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_work RECORD;
v_latest_period RECORD;
v_next_start DATE;
v_next_end DATE;
v_next_name TEXT;
v_new_period_id UUID;
v_task_count INTEGER;
v_period_exists BOOLEAN;
BEGIN
SELECT * INTO v_work
FROM works
WHERE id = p_work_id
AND is_recurring = TRUE;

IF v_work IS NULL THEN
RETURN FALSE;
END IF;

SELECT * INTO v_latest_period
FROM work_recurring_instances
WHERE work_id = p_work_id
ORDER BY period_end_date DESC
LIMIT 1;

IF v_latest_period IS NULL THEN
PERFORM backfill_missing_periods(p_work_id);
RETURN TRUE;
END IF;

SELECT next_start_date, next_end_date, next_period_name
INTO v_next_start, v_next_end, v_next_name
FROM calculate_next_period_dates(
v_latest_period.period_end_date,
v_work.recurrence_pattern
);

-- Only create if end date has already passed (strict past check)
IF v_next_end >= CURRENT_DATE THEN
RETURN FALSE;
END IF;

SELECT EXISTS (
SELECT 1 FROM work_recurring_instances
WHERE work_id = p_work_id
AND period_start_date = v_next_start
) INTO v_period_exists;

IF v_period_exists THEN
RETURN FALSE;
END IF;

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
p_work_id,
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

IF v_work.service_id IS NOT NULL THEN
v_task_count := copy_tasks_to_period_with_templates(
v_new_period_id,
v_work.id,
v_work.service_id,
v_next_end,
v_work.assigned_to
);

UPDATE work_recurring_instances
SET total_tasks = v_task_count
WHERE id = v_new_period_id;
END IF;

PERFORM copy_documents_to_period(v_new_period_id, p_work_id);

RETURN TRUE;
END $function$;

-- Fix backfill_missing_periods
DROP FUNCTION IF EXISTS backfill_missing_periods(UUID);

CREATE OR REPLACE FUNCTION backfill_missing_periods(p_work_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_work RECORD;
  v_period_dates RECORD;
  v_period_id UUID;
  v_task_count INTEGER;
  v_current_period_start DATE;
  v_current_period_end DATE;
  v_recurrence_pattern TEXT;
BEGIN
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
  AND is_recurring = TRUE;

  IF v_work IS NULL THEN
    RETURN;
  END IF;

  -- Get recurrence pattern from work or service
  v_recurrence_pattern := COALESCE(
    (SELECT recurrence_type FROM services WHERE id = v_work.service_id),
    v_work.recurrence_pattern,
    'monthly'
  );

  -- Calculate first period dates based on work start date
  -- Cast to DATE to match function parameter type
  SELECT * INTO v_period_dates
  FROM calculate_next_period_dates(
    (COALESCE(v_work.start_date, CURRENT_DATE))::DATE - INTERVAL '1 day',
    v_recurrence_pattern
  );

  v_current_period_start := v_period_dates.next_start_date;
  v_current_period_end := v_period_dates.next_end_date;

  -- Generate all periods up to current date
  WHILE v_current_period_end <= CURRENT_DATE LOOP
    -- Check if period already exists
    IF NOT EXISTS (
      SELECT 1 FROM work_recurring_instances
      WHERE work_id = p_work_id
      AND period_start_date = v_current_period_start
    ) THEN
      -- Create period
      INSERT INTO work_recurring_instances (
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        status
      ) VALUES (
        p_work_id,
        generate_period_name(v_current_period_start, v_current_period_end, v_recurrence_pattern),
        v_current_period_start,
        v_current_period_end,
        CASE WHEN v_current_period_end < CURRENT_DATE THEN 'completed' ELSE 'pending' END
      ) RETURNING id INTO v_period_id;

      -- Copy tasks
      IF v_work.service_id IS NOT NULL THEN
        v_task_count := copy_tasks_to_period_with_templates(
          v_period_id,
          v_work.id,
          v_work.service_id,
          v_current_period_end,
          v_work.assigned_to
        );

        -- Update task count
        UPDATE work_recurring_instances
        SET total_tasks = v_task_count
        WHERE id = v_period_id;
      END IF;

      -- Copy documents
      PERFORM copy_documents_to_period(v_period_id, v_work.id);
    END IF;

    -- Calculate next period
    SELECT * INTO v_period_dates
    FROM calculate_next_period_dates(
      v_current_period_end,
      v_recurrence_pattern
    );

    v_current_period_start := v_period_dates.next_start_date;
    v_current_period_end := v_period_dates.next_end_date;
  END LOOP;
END $$;
