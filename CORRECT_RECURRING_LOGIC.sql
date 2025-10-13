/*
  # Fix Recurring Period Generation - Correct Implementation

  ## Problem Analysis
  User provides:
  - Start date: 07-10-2025 (DD-MM-YYYY format = October 7, 2025)
  - Current date: 13-10-2025 (October 13, 2025)
  - Recurrence: Monthly on day 10

  Expected periods (only 2 should exist):
  1. October 2025: Period 01-10-2025 to 31-10-2025, Due 10-10-2025 (OVERDUE - past due)
  2. November 2025: Period 01-11-2025 to 30-11-2025, Due 10-11-2025 (upcoming)

  ## Root Cause
  The current function incorrectly uses:
  - `date_trunc('month', v_start_date)::date + (v_work.recurrence_day - 1)`

  This should use make_date() for clarity:
  - `make_date(EXTRACT(YEAR FROM v_start_date)::int, EXTRACT(MONTH FROM v_start_date)::int, v_work.recurrence_day)`

  ## Solution
  1. For the FIRST period when work is created on 07-10-2025 with due day = 10:
     - Calculate due date for October: 10-10-2025
     - Since 10-10-2025 >= 07-10-2025 (start date), use October
     - Period: 01-10-2025 to 31-10-2025, Due: 10-10-2025

  2. For SUBSEQUENT periods, calculate from last period's due date:
     - Add 1 month to 10-10-2025 = 10-11-2025
     - Period: 01-11-2025 to 30-11-2025, Due: 10-11-2025

  3. ONLY generate periods up to current date or slightly ahead (not all future periods)
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
  v_start_date date;
  v_year int;
  v_month int;
  v_day int;
BEGIN
  -- Get work details
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
    AND is_recurring = true;

  IF v_work IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get last period if exists
  SELECT * INTO v_last_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY due_date DESC
  LIMIT 1;

  IF v_last_period IS NULL THEN
    -- ===== FIRST PERIOD =====
    -- Calculate based on start_date and recurrence_day
    v_start_date := COALESCE(v_work.start_date, CURRENT_DATE);
    v_day := v_work.recurrence_day;

    CASE v_work.recurrence_pattern
      WHEN 'monthly' THEN
        -- Get year and month from start date
        v_year := EXTRACT(YEAR FROM v_start_date)::int;
        v_month := EXTRACT(MONTH FROM v_start_date)::int;

        -- Try to create due date in the same month as start date
        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          -- If day doesn't exist in this month (e.g., Feb 31), use last day of month
          v_due_date := (date_trunc('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        END;

        -- If the due date is before start date, move to next month
        IF v_due_date < v_start_date THEN
          v_month := v_month + 1;
          IF v_month > 12 THEN
            v_month := 1;
            v_year := v_year + 1;
          END IF;

          BEGIN
            v_due_date := make_date(v_year, v_month, v_day);
          EXCEPTION WHEN OTHERS THEN
            -- Use last day of next month if day doesn't exist
            v_due_date := (make_date(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
          END;
        END IF;

        -- Period is the FULL MONTH containing the due date
        v_period_start_date := date_trunc('month', v_due_date)::date;
        v_period_end_date := (date_trunc('month', v_due_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;

      WHEN 'quarterly' THEN
        -- Similar logic for quarterly
        v_year := EXTRACT(YEAR FROM v_start_date)::int;
        v_month := EXTRACT(MONTH FROM date_trunc('quarter', v_start_date))::int;

        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := (date_trunc('quarter', v_start_date) + INTERVAL '3 months' - INTERVAL '1 day')::date;
        END;

        IF v_due_date < v_start_date THEN
          BEGIN
            v_due_date := (date_trunc('quarter', v_start_date) + INTERVAL '3 months')::date + (v_day - 1);
          EXCEPTION WHEN OTHERS THEN
            v_due_date := (date_trunc('quarter', v_start_date) + INTERVAL '6 months' - INTERVAL '1 day')::date;
          END;
        END IF;

        v_period_start_date := date_trunc('quarter', v_due_date)::date;
        v_period_end_date := (date_trunc('quarter', v_due_date) + INTERVAL '3 months' - INTERVAL '1 day')::date;

      WHEN 'half-yearly' THEN
        -- Half-yearly logic
        v_year := EXTRACT(YEAR FROM v_start_date)::int;
        IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
          v_month := 1;
        ELSE
          v_month := 7;
        END IF;

        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := make_date(v_year, v_month, 1) + INTERVAL '6 months' - INTERVAL '1 day';
        END;

        IF v_due_date < v_start_date THEN
          v_month := v_month + 6;
          IF v_month > 12 THEN
            v_month := v_month - 12;
            v_year := v_year + 1;
          END IF;

          BEGIN
            v_due_date := make_date(v_year, v_month, v_day);
          EXCEPTION WHEN OTHERS THEN
            v_due_date := make_date(v_year, v_month, 1) + INTERVAL '6 months' - INTERVAL '1 day';
          END;
        END IF;

        -- Set period to correct half of year
        IF EXTRACT(MONTH FROM v_due_date) <= 6 THEN
          v_period_start_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 1, 1);
          v_period_end_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 6, 30);
        ELSE
          v_period_start_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 7, 1);
          v_period_end_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 12, 31);
        END IF;

      WHEN 'yearly' THEN
        v_year := EXTRACT(YEAR FROM v_start_date)::int;

        BEGIN
          v_due_date := make_date(v_year, 1, v_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := make_date(v_year, 12, 31);
        END;

        IF v_due_date < v_start_date THEN
          v_year := v_year + 1;
          BEGIN
            v_due_date := make_date(v_year, 1, v_day);
          EXCEPTION WHEN OTHERS THEN
            v_due_date := make_date(v_year, 12, 31);
          END;
        END IF;

        v_period_start_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 1, 1);
        v_period_end_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 12, 31);

      ELSE
        -- Default: weekly
        v_due_date := v_start_date + INTERVAL '7 days';
        v_period_start_date := v_start_date;
        v_period_end_date := v_due_date;
    END CASE;

  ELSE
    -- ===== SUBSEQUENT PERIODS =====
    -- Calculate from the previous due date
    v_day := v_work.recurrence_day;

    CASE v_work.recurrence_pattern
      WHEN 'monthly' THEN
        -- Get next month
        v_year := EXTRACT(YEAR FROM v_last_period.due_date)::int;
        v_month := EXTRACT(MONTH FROM v_last_period.due_date)::int + 1;

        IF v_month > 12 THEN
          v_month := 1;
          v_year := v_year + 1;
        END IF;

        -- Try to create due date with same day number
        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          -- If day doesn't exist (e.g., Feb 31), use last day of month
          v_due_date := (make_date(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        END;

        -- Period is the FULL MONTH containing the new due date
        v_period_start_date := date_trunc('month', v_due_date)::date;
        v_period_end_date := (date_trunc('month', v_due_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;

      WHEN 'quarterly' THEN
        v_due_date := (v_last_period.due_date + INTERVAL '3 months')::date;

        -- Adjust to correct day if needed
        v_year := EXTRACT(YEAR FROM v_due_date)::int;
        v_month := EXTRACT(MONTH FROM v_due_date)::int;

        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := (make_date(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        END;

        v_period_start_date := date_trunc('quarter', v_due_date)::date;
        v_period_end_date := (date_trunc('quarter', v_due_date) + INTERVAL '3 months' - INTERVAL '1 day')::date;

      WHEN 'half-yearly' THEN
        v_due_date := (v_last_period.due_date + INTERVAL '6 months')::date;

        v_year := EXTRACT(YEAR FROM v_due_date)::int;
        v_month := EXTRACT(MONTH FROM v_due_date)::int;

        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := (make_date(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        END;

        IF EXTRACT(MONTH FROM v_due_date) <= 6 THEN
          v_period_start_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 1, 1);
          v_period_end_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 6, 30);
        ELSE
          v_period_start_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 7, 1);
          v_period_end_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 12, 31);
        END IF;

      WHEN 'yearly' THEN
        v_year := EXTRACT(YEAR FROM v_last_period.due_date)::int + 1;
        v_month := EXTRACT(MONTH FROM v_last_period.due_date)::int;

        BEGIN
          v_due_date := make_date(v_year, v_month, v_day);
        EXCEPTION WHEN OTHERS THEN
          v_due_date := (make_date(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        END;

        v_period_start_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 1, 1);
        v_period_end_date := make_date(EXTRACT(YEAR FROM v_due_date)::int, 12, 31);

      ELSE
        v_due_date := v_last_period.due_date + INTERVAL '7 days';
        v_period_start_date := v_last_period.period_end_date + INTERVAL '1 day';
        v_period_end_date := v_due_date;
    END CASE;
  END IF;

  -- Generate period name based on the period dates
  v_period_name := generate_period_name(v_period_start_date, v_period_end_date, v_work.recurrence_pattern);

  -- Insert new period
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
    'Auto-generated recurring period'
  )
  RETURNING id INTO v_new_period_id;

  -- Copy work documents to this period
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
  WHERE wd.work_id = p_work_id;

  RETURN v_new_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update the trigger to only generate periods up to current date + 1 period ahead
-- This prevents generating too many future periods
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_periods ON works;

CREATE OR REPLACE FUNCTION create_initial_recurring_periods()
RETURNS TRIGGER AS $$
DECLARE
  v_period_id uuid;
  v_current_due_date date;
  v_generated_count int := 0;
  v_max_periods int := 2; -- Only generate current + 1 future period
  v_last_period RECORD;
BEGIN
  -- Only run for recurring works
  IF NEW.is_recurring = true AND NEW.recurrence_pattern IS NOT NULL AND NEW.recurrence_day IS NOT NULL THEN

    -- Generate initial periods (only up to 2: current and next)
    LOOP
      -- Check if we've reached the limit
      EXIT WHEN v_generated_count >= v_max_periods;

      -- Get the last generated period
      SELECT * INTO v_last_period
      FROM work_recurring_instances
      WHERE work_id = NEW.id
      ORDER BY due_date DESC
      LIMIT 1;

      -- If we have a period and it's too far in the future, stop
      IF v_last_period IS NOT NULL THEN
        IF v_last_period.due_date > CURRENT_DATE + INTERVAL '1 month' THEN
          EXIT;
        END IF;
      END IF;

      -- Generate next period
      v_period_id := generate_next_recurring_period(NEW.id);

      -- Exit if generation failed
      EXIT WHEN v_period_id IS NULL;

      v_generated_count := v_generated_count + 1;
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_initial_recurring_periods
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION create_initial_recurring_periods();
