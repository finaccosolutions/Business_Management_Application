/*
  # Fix Recurring Period Generation Logic - Correct Version

  ## Problem
  The `check_and_generate_recurring_periods` function generates periods up to
  CURRENT_DATE + 1 month, which creates too many periods. It should only generate:
  1. All overdue periods (from start date until today)
  2. Exactly ONE upcoming period (next due date after today)

  ## Example
  - Work start: 07-10-2025
  - Current date: 13-10-2025
  - Recurrence: Monthly, day 10

  Should generate ONLY:
  - October 2025: Due 10-10-2025 (overdue - because 10th has passed)
  - November 2025: Due 10-11-2025 (upcoming - next period after today)

  NOT:
  - December 2025 or any other future months
*/

-- Drop and recreate with correct logic
DROP FUNCTION IF EXISTS check_and_generate_recurring_periods();

CREATE OR REPLACE FUNCTION check_and_generate_recurring_periods()
RETURNS TABLE(work_id uuid, new_period_id uuid, period_name text, action text) AS $$
DECLARE
  v_work RECORD;
  v_last_period RECORD;
  v_new_period_id uuid;
  v_next_expected_due date;
  v_has_upcoming_period boolean;
  v_start_date date;
  v_current_due date;
  v_periods_created int;
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
      -- No periods exist - generate from start date to first upcoming period
      v_start_date := COALESCE(v_work.start_date, CURRENT_DATE);
      v_periods_created := 0;

      -- Calculate first due date
      CASE v_work.recurrence_pattern
        WHEN 'monthly' THEN
          v_current_due := date_trunc('month', v_start_date)::date + (v_work.recurrence_day - 1);
          IF v_current_due < v_start_date THEN
            v_current_due := (date_trunc('month', v_start_date) + INTERVAL '1 month')::date + (v_work.recurrence_day - 1);
          END IF;
        WHEN 'quarterly' THEN
          v_current_due := date_trunc('quarter', v_start_date)::date + (v_work.recurrence_day - 1);
          IF v_current_due < v_start_date THEN
            v_current_due := (date_trunc('quarter', v_start_date) + INTERVAL '3 months')::date + (v_work.recurrence_day - 1);
          END IF;
        WHEN 'half-yearly' THEN
          IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
            v_current_due := date_trunc('year', v_start_date)::date + (v_work.recurrence_day - 1);
          ELSE
            v_current_due := (date_trunc('year', v_start_date)::date + INTERVAL '6 months') + (v_work.recurrence_day - 1);
          END IF;
          IF v_current_due < v_start_date THEN
            v_current_due := v_current_due + INTERVAL '6 months';
          END IF;
        WHEN 'yearly' THEN
          v_current_due := date_trunc('year', v_start_date)::date + (v_work.recurrence_day - 1);
          IF v_current_due < v_start_date THEN
            v_current_due := v_current_due + INTERVAL '1 year';
          END IF;
        ELSE
          v_current_due := v_start_date + INTERVAL '7 days';
      END CASE;

      -- Generate periods: all past/today due dates + exactly 1 upcoming period
      -- Loop while due date is on or before today, OR we haven't created any upcoming period yet
      WHILE v_periods_created < 100 LOOP
        -- Check if we already have one future period
        IF v_current_due > CURRENT_DATE AND v_periods_created > 0 THEN
          -- Check if the last created period was already in the future
          SELECT COUNT(*) INTO v_periods_created
          FROM work_recurring_instances
          WHERE work_id = v_work.id
            AND due_date > CURRENT_DATE;

          -- If we already have at least one future period, stop
          IF v_periods_created >= 1 THEN
            EXIT;
          END IF;
        END IF;

        -- Generate the period
        v_new_period_id := generate_next_recurring_period(v_work.id);

        IF v_new_period_id IS NOT NULL THEN
          SELECT wri.period_name, wri.due_date INTO period_name, v_current_due
          FROM work_recurring_instances wri
          WHERE wri.id = v_new_period_id;

          work_id := v_work.id;
          new_period_id := v_new_period_id;
          action := CASE
            WHEN v_periods_created = 0 THEN 'created_first_period'
            WHEN v_current_due <= CURRENT_DATE THEN 'created_catchup_period'
            ELSE 'created_upcoming_period'
          END;
          RETURN NEXT;

          v_periods_created := v_periods_created + 1;

          -- If this period is in the future, we're done
          IF v_current_due > CURRENT_DATE THEN
            EXIT;
          END IF;
        ELSE
          EXIT;
        END IF;

        -- Calculate next due date
        v_current_due := calculate_next_due_date(v_current_due, v_work.recurrence_pattern, v_work.recurrence_day);
      END LOOP;

    ELSIF v_last_period.status = 'completed' OR v_last_period.due_date < CURRENT_DATE THEN
      -- Last period is completed or overdue - check if we need next period
      v_next_expected_due := calculate_next_due_date(
        v_last_period.due_date,
        v_work.recurrence_pattern,
        v_work.recurrence_day
      );

      -- Check if there's already an upcoming period
      SELECT EXISTS (
        SELECT 1 FROM work_recurring_instances wri
        WHERE wri.work_id = v_work.id
          AND wri.due_date > CURRENT_DATE
          AND wri.status NOT IN ('completed', 'cancelled')
      ) INTO v_has_upcoming_period;

      -- Only create next period if we don't have any upcoming period
      IF NOT v_has_upcoming_period THEN
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

-- Update the initialize function with same logic
DROP FUNCTION IF EXISTS initialize_recurring_periods_for_work(uuid);

CREATE OR REPLACE FUNCTION initialize_recurring_periods_for_work(p_work_id uuid)
RETURNS TABLE(period_id uuid, period_name text, due_date date, status text) AS $$
DECLARE
  v_work RECORD;
  v_start_date date;
  v_current_due date;
  v_period_id uuid;
  v_periods_created int := 0;
  v_future_periods int := 0;
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
    WHEN 'quarterly' THEN
      v_current_due := date_trunc('quarter', v_start_date)::date + (v_work.recurrence_day - 1);
      IF v_current_due < v_start_date THEN
        v_current_due := (date_trunc('quarter', v_start_date) + INTERVAL '3 months')::date + (v_work.recurrence_day - 1);
      END IF;
    WHEN 'half-yearly' THEN
      IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
        v_current_due := date_trunc('year', v_start_date)::date + (v_work.recurrence_day - 1);
      ELSE
        v_current_due := (date_trunc('year', v_start_date)::date + INTERVAL '6 months') + (v_work.recurrence_day - 1);
      END IF;
      IF v_current_due < v_start_date THEN
        v_current_due := v_current_due + INTERVAL '6 months';
      END IF;
    WHEN 'yearly' THEN
      v_current_due := date_trunc('year', v_start_date)::date + (v_work.recurrence_day - 1);
      IF v_current_due < v_start_date THEN
        v_current_due := v_current_due + INTERVAL '1 year';
      END IF;
    ELSE
      v_current_due := v_start_date + INTERVAL '7 days';
  END CASE;

  -- Generate periods: all overdue/current + exactly 1 future period
  WHILE v_periods_created < 100 LOOP
    -- Stop if we already have a future period
    IF v_future_periods >= 1 THEN
      EXIT;
    END IF;

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

      -- Track if this period is in the future
      IF due_date > CURRENT_DATE THEN
        v_future_periods := v_future_periods + 1;
      END IF;
    ELSE
      EXIT;
    END IF;

    v_current_due := calculate_next_due_date(v_current_due, v_work.recurrence_pattern, v_work.recurrence_day);
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
