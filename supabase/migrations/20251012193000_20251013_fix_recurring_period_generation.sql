/*
  # Fix Recurring Period Generation Logic

  ## Problem
  The `generate_next_recurring_period` function was creating:
  - Incorrect number of periods (3 instead of 2)
  - Wrong due dates (9th instead of 10th)
  - Incorrect period boundaries

  ## Solution
  1. Fix the period calculation logic to properly generate periods from work start date
  2. Ensure due dates match the configured recurrence_day
  3. Generate only past due and current period
  4. Correct period start/end date calculations for monthly recurrence

  ## Example
  - Work created: 07-10-2025
  - Current date: 13-10-2025
  - Recurrence: Monthly, day 10

  Should generate:
  - October 2025: 01/10/2025 - 31/10/2025, Due: 10/10/2025 (overdue)
  - November 2025: 01/11/2025 - 30/11/2025, Due: 10/11/2025 (upcoming)
*/

-- Drop and recreate the function with correct logic
DROP FUNCTION IF EXISTS generate_next_recurring_period(uuid);

CREATE OR REPLACE FUNCTION generate_next_recurring_period(p_work_id uuid)
RETURNS uuid AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_new_period_id uuid;
  v_period_start_date date;
  v_period_end_date date;
  v_due_date date;
  v_period_name text;
BEGIN
  -- Get the work details
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
    AND is_recurring = true;

  IF v_work IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get the most recent period
  SELECT * INTO v_last_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY due_date DESC
  LIMIT 1;

  -- Calculate period dates based on recurrence pattern
  IF v_last_period IS NULL THEN
    -- First period: Calculate based on work start date and recurrence_day
    DECLARE
      v_start_date date;
      v_first_due date;
    BEGIN
      v_start_date := COALESCE(v_work.start_date, CURRENT_DATE);

      CASE v_work.recurrence_pattern
        WHEN 'monthly' THEN
          -- Calculate the due date for the month of start date
          v_first_due := date_trunc('month', v_start_date)::date + (v_work.recurrence_day - 1);

          -- If the due date is before the start date, move to next month
          IF v_first_due < v_start_date THEN
            v_first_due := (date_trunc('month', v_start_date) + INTERVAL '1 month')::date + (v_work.recurrence_day - 1);
          END IF;

          -- Period is the full month containing the due date
          v_period_start_date := date_trunc('month', v_first_due)::date;
          v_period_end_date := (date_trunc('month', v_first_due) + INTERVAL '1 month' - INTERVAL '1 day')::date;
          v_due_date := v_first_due;

        WHEN 'quarterly' THEN
          v_first_due := date_trunc('quarter', v_start_date)::date + (v_work.recurrence_day - 1);
          IF v_first_due < v_start_date THEN
            v_first_due := (date_trunc('quarter', v_start_date) + INTERVAL '3 months')::date + (v_work.recurrence_day - 1);
          END IF;
          v_period_start_date := date_trunc('quarter', v_first_due)::date;
          v_period_end_date := (date_trunc('quarter', v_first_due) + INTERVAL '3 months' - INTERVAL '1 day')::date;
          v_due_date := v_first_due;

        WHEN 'half-yearly' THEN
          -- Calculate which half (1-6 or 7-12)
          IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
            v_period_start_date := date_trunc('year', v_start_date)::date;
            v_period_end_date := date_trunc('year', v_start_date)::date + INTERVAL '6 months' - INTERVAL '1 day';
          ELSE
            v_period_start_date := date_trunc('year', v_start_date)::date + INTERVAL '6 months';
            v_period_end_date := date_trunc('year', v_start_date)::date + INTERVAL '1 year' - INTERVAL '1 day';
          END IF;
          v_due_date := v_period_start_date + (v_work.recurrence_day - 1);

        WHEN 'yearly' THEN
          v_period_start_date := date_trunc('year', v_start_date)::date;
          v_period_end_date := (date_trunc('year', v_start_date) + INTERVAL '1 year' - INTERVAL '1 day')::date;
          v_due_date := v_period_start_date + (v_work.recurrence_day - 1);

        ELSE -- weekly or daily
          v_period_start_date := v_start_date;
          v_period_end_date := v_start_date + INTERVAL '7 days';
          v_due_date := v_start_date + INTERVAL '7 days';
      END CASE;
    END;
  ELSE
    -- Next period: Calculate based on last period's due date
    v_due_date := calculate_next_due_date(v_last_period.due_date, v_work.recurrence_pattern, v_work.recurrence_day);

    CASE v_work.recurrence_pattern
      WHEN 'monthly' THEN
        v_period_start_date := date_trunc('month', v_due_date)::date;
        v_period_end_date := (date_trunc('month', v_due_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;

      WHEN 'quarterly' THEN
        v_period_start_date := date_trunc('quarter', v_due_date)::date;
        v_period_end_date := (date_trunc('quarter', v_due_date) + INTERVAL '3 months' - INTERVAL '1 day')::date;

      WHEN 'half-yearly' THEN
        IF EXTRACT(MONTH FROM v_due_date) <= 6 THEN
          v_period_start_date := date_trunc('year', v_due_date)::date;
          v_period_end_date := date_trunc('year', v_due_date)::date + INTERVAL '6 months' - INTERVAL '1 day';
        ELSE
          v_period_start_date := date_trunc('year', v_due_date)::date + INTERVAL '6 months';
          v_period_end_date := date_trunc('year', v_due_date)::date + INTERVAL '1 year' - INTERVAL '1 day';
        END IF;

      WHEN 'yearly' THEN
        v_period_start_date := date_trunc('year', v_due_date)::date;
        v_period_end_date := (date_trunc('year', v_due_date) + INTERVAL '1 year' - INTERVAL '1 day')::date;

      ELSE
        v_period_start_date := v_last_period.period_end_date + INTERVAL '1 day';
        v_period_end_date := v_period_start_date + INTERVAL '7 days';
    END CASE;
  END IF;

  -- Generate period name
  v_period_name := generate_period_name(v_period_start_date, v_period_end_date, v_work.recurrence_pattern);

  -- Insert the new period
  INSERT INTO work_recurring_instances (
    work_id,
    period_name,
    period_start_date,
    period_end_date,
    due_date,
    status,
    billing_amount,
    is_billed,
    notes
  ) VALUES (
    p_work_id,
    v_period_name,
    v_period_start_date,
    v_period_end_date,
    v_due_date,
    CASE
      WHEN v_due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'pending'
    END,
    v_work.billing_amount,
    false,
    'Auto-generated period'
  )
  RETURNING id INTO v_new_period_id;

  RETURN v_new_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the batch generation function to create initial periods correctly
DROP FUNCTION IF EXISTS check_and_generate_recurring_periods();

CREATE OR REPLACE FUNCTION check_and_generate_recurring_periods()
RETURNS TABLE(work_id uuid, new_period_id uuid, period_name text, action text) AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_new_period_id uuid;
  v_next_expected_due date;
  v_has_upcoming_period boolean;
  v_periods_to_create int;
  v_start_date date;
  v_current_due date;
BEGIN
  FOR v_work IN
    SELECT w.id, w.recurrence_pattern, w.recurrence_day, w.billing_amount, w.title, w.start_date
    FROM works w
    WHERE w.is_recurring = true
      AND w.status NOT IN ('completed', 'cancelled')
  LOOP
    SELECT * INTO v_last_period
    FROM work_recurring_instances wri
    WHERE wri.work_id = v_work.id
    ORDER BY due_date DESC
    LIMIT 1;

    IF v_last_period IS NULL THEN
      -- No periods exist - generate all periods from start date to current date + next period
      v_start_date := COALESCE(v_work.start_date, CURRENT_DATE);

      -- Calculate first due date
      CASE v_work.recurrence_pattern
        WHEN 'monthly' THEN
          v_current_due := date_trunc('month', v_start_date)::date + (v_work.recurrence_day - 1);
          IF v_current_due < v_start_date THEN
            v_current_due := (date_trunc('month', v_start_date) + INTERVAL '1 month')::date + (v_work.recurrence_day - 1);
          END IF;
        ELSE
          v_current_due := v_start_date;
      END CASE;

      -- Generate periods until we have one future period
      v_periods_to_create := 0;
      WHILE v_current_due <= CURRENT_DATE + INTERVAL '1 month' AND v_periods_to_create < 100 LOOP
        v_new_period_id := generate_next_recurring_period(v_work.id);

        IF v_new_period_id IS NOT NULL THEN
          SELECT wri.period_name INTO period_name
          FROM work_recurring_instances wri
          WHERE wri.id = v_new_period_id;

          work_id := v_work.id;
          new_period_id := v_new_period_id;
          action := CASE
            WHEN v_periods_to_create = 0 THEN 'created_first_period'
            ELSE 'created_catchup_period'
          END;
          RETURN NEXT;

          v_periods_to_create := v_periods_to_create + 1;
        ELSE
          EXIT;
        END IF;

        v_current_due := calculate_next_due_date(v_current_due, v_work.recurrence_pattern, v_work.recurrence_day);
      END LOOP;

    ELSIF v_last_period.status = 'completed' OR v_last_period.due_date < CURRENT_DATE THEN
      -- Last period is completed or overdue - check if we need next period
      v_next_expected_due := calculate_next_due_date(
        v_last_period.due_date,
        v_work.recurrence_pattern,
        v_work.recurrence_day
      );

      SELECT EXISTS (
        SELECT 1 FROM work_recurring_instances wri
        WHERE wri.work_id = v_work.id
          AND wri.due_date >= v_next_expected_due
          AND wri.id != v_last_period.id
      ) INTO v_has_upcoming_period;

      IF NOT v_has_upcoming_period AND v_next_expected_due <= (CURRENT_DATE + INTERVAL '60 days') THEN
        v_new_period_id := generate_next_recurring_period(v_work.id);

        IF v_new_period_id IS NOT NULL THEN
          SELECT wri.period_name INTO period_name
          FROM work_recurring_instances wri
          WHERE wri.id = v_new_period_id;

          work_id := v_work.id;
          new_period_id := v_new_period_id;
          action := 'created_next_period';
          RETURN NEXT;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to initialize periods for an existing work
CREATE OR REPLACE FUNCTION initialize_recurring_periods_for_work(p_work_id uuid)
RETURNS TABLE(period_id uuid, period_name text, due_date date, status text) AS $$
DECLARE
  v_work RECORD;
  v_start_date date;
  v_current_due date;
  v_period_id uuid;
  v_max_periods int := 100;
  v_periods_created int := 0;
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id AND is_recurring = true;

  IF v_work IS NULL THEN
    RAISE EXCEPTION 'Work not found or not recurring';
  END IF;

  -- Delete any existing periods (clean slate)
  DELETE FROM work_recurring_instances WHERE work_id = p_work_id;

  v_start_date := COALESCE(v_work.start_date, CURRENT_DATE);

  -- Calculate first due date based on pattern
  CASE v_work.recurrence_pattern
    WHEN 'monthly' THEN
      v_current_due := date_trunc('month', v_start_date)::date + (v_work.recurrence_day - 1);
      IF v_current_due < v_start_date THEN
        v_current_due := (date_trunc('month', v_start_date) + INTERVAL '1 month')::date + (v_work.recurrence_day - 1);
      END IF;
    ELSE
      v_current_due := v_start_date;
  END CASE;

  -- Generate periods: all overdue/current + 1 future
  WHILE v_current_due <= CURRENT_DATE + INTERVAL '1 month' AND v_periods_created < v_max_periods LOOP
    v_period_id := generate_next_recurring_period(p_work_id);

    IF v_period_id IS NOT NULL THEN
      SELECT
        wri.id,
        wri.period_name,
        wri.due_date,
        wri.status::text
      INTO period_id, period_name, due_date, status
      FROM work_recurring_instances wri
      WHERE wri.id = v_period_id;

      RETURN NEXT;
      v_periods_created := v_periods_created + 1;
    ELSE
      EXIT;
    END IF;

    v_current_due := calculate_next_due_date(v_current_due, v_work.recurrence_pattern, v_work.recurrence_day);
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
