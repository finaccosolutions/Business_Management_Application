/*
  # Fix period creation backfill logic for all recurrence types

  ISSUE: When creating a recurring work with start date 8-11-2025 and current date 29-11-2025,
  periods were being created for November instead of October.

  ROOT CAUSE: The backfill logic was starting from the truncated start date (Nov 1) instead of
  creating periods from one period BEFORE the start date. Periods should only exist when their
  first task's last due date has elapsed.

  FIX: Modify backfill_recurring_work_periods to:
  1. Calculate the period BEFORE the start date
  2. Only include that pre-period and all periods up to current date
  3. Ensure periods are created in chronological order with proper eligibility checks

  This ensures:
  - For start date Nov 8, 2025: First period is Oct 1-31, 2025 (when Oct tasks' last due date <= Nov 29)
  - For start date Nov 15: First period is Sep 1-30, 2025 (when Sep tasks' last due date <= Nov 29)
  - Works consistently for monthly, quarterly, yearly recurrences
*/

DROP FUNCTION IF EXISTS public.backfill_recurring_work_periods(uuid, date, text, date);

CREATE OR REPLACE FUNCTION public.backfill_recurring_work_periods(
  p_work_id uuid,
  p_start_date date,
  p_recurrence_type text,
  p_current_date date
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_calculation_start DATE;
BEGIN
  -- Determine where to start calculating periods
  -- We need to go ONE period BEFORE the start date to ensure first period tasks can be due
  
  IF p_recurrence_type = 'monthly' THEN
    -- Start from one month before the start date
    v_calculation_start := (DATE_TRUNC('month', p_start_date) - INTERVAL '1 month')::DATE;
    v_period_start := DATE_TRUNC('month', v_calculation_start)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'monthly', p_current_date
      );

      v_period_start := v_period_start + INTERVAL '1 month';
    END LOOP;

  ELSIF p_recurrence_type = 'quarterly' THEN
    -- Start from one quarter before the start date
    v_calculation_start := (DATE_TRUNC('quarter', p_start_date) - INTERVAL '3 months')::DATE;
    v_period_start := DATE_TRUNC('quarter', v_calculation_start)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('quarter', v_period_start) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'quarterly', p_current_date
      );

      v_period_start := v_period_start + INTERVAL '3 months';
    END LOOP;

  ELSIF p_recurrence_type = 'half_yearly' THEN
    -- Start from one half-year before the start date
    v_calculation_start := (DATE_TRUNC('year', p_start_date) - INTERVAL '6 months')::DATE;
    
    -- Determine if we're in first or second half of year
    IF EXTRACT(MONTH FROM p_calculation_start) <= 6 THEN
      v_period_start := DATE_TRUNC('year', v_calculation_start)::DATE;
    ELSE
      v_period_start := (DATE_TRUNC('year', v_calculation_start) + INTERVAL '6 months')::DATE;
    END IF;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (v_period_start + INTERVAL '6 months' - INTERVAL '1 day')::DATE;

      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'half_yearly', p_current_date
      );

      v_period_start := v_period_start + INTERVAL '6 months';
    END LOOP;

  ELSIF p_recurrence_type = 'yearly' THEN
    -- Start from one year before the start date
    v_calculation_start := (DATE_TRUNC('year', p_start_date) - INTERVAL '1 year')::DATE;
    v_period_start := DATE_TRUNC('year', v_calculation_start)::DATE;

    WHILE v_period_start <= p_current_date LOOP
      v_period_end := (DATE_TRUNC('year', v_period_start) + INTERVAL '1 year' - INTERVAL '1 day')::DATE;

      -- Try to create period with all applicable tasks
      PERFORM create_period_with_all_applicable_tasks(
        p_work_id, v_period_start, v_period_end, 'yearly', p_current_date
      );

      v_period_start := v_period_start + INTERVAL '1 year';
    END LOOP;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.should_create_period(uuid, date, date, text, date);

CREATE OR REPLACE FUNCTION public.should_create_period(
  p_service_id uuid,
  p_period_start_date date,
  p_period_end_date date,
  p_period_type text,
  p_current_date date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_last_task_due_date DATE;
BEGIN
  -- Get the last task due date for this period
  v_last_task_due_date := calculate_last_task_due_date_for_period(
    p_service_id,
    p_period_start_date,
    p_period_end_date,
    p_period_type
  );

  -- Period should be created ONLY if:
  -- 1. Last task due date is calculated (exists)
  -- 2. Current date is AFTER or ON the last task due date
  IF v_last_task_due_date IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN p_current_date >= v_last_task_due_date;
END;
$function$;
