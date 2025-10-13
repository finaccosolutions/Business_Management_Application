/*
  # Fix Recurring Period Generation - Final Correct Version
  
  ## Problem
  The generate_next_recurring_period function has incorrect logic for:
  1. Calculating the first due date when no periods exist
  2. Setting period start/end dates incorrectly
  3. The period_end_date formula causes wrong calculations (due_date - 1 day)
  
  ## Expected Behavior
  For a work with:
  - Start date: 07-10-2025
  - Current date: 13-10-2025  
  - Recurrence: Monthly on day 10
  
  Should generate:
  1. October 2025: Period 01-10-2025 to 31-10-2025, Due 10-10-2025 (OVERDUE)
  2. November 2025: Period 01-11-2025 to 30-11-2025, Due 10-11-2025 (upcoming)
  
  ## Solution
  - Calculate first due date correctly based on start_date and recurrence_day
  - Set period_start_date as first day of the month containing the due date
  - Set period_end_date as last day of the month containing the due date
  - For subsequent periods, calculate from the previous due date
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
BEGIN
  SELECT * INTO v_work
  FROM works
  WHERE id = p_work_id
    AND is_recurring = true;

  IF v_work IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_last_period
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  ORDER BY due_date DESC
  LIMIT 1;

  IF v_last_period IS NULL THEN
    -- FIRST PERIOD: Calculate based on start_date and recurrence_day
    v_start_date := COALESCE(v_work.start_date, CURRENT_DATE);
    
    CASE v_work.recurrence_pattern
      WHEN 'monthly' THEN
        -- Find the due date for the month of the start date
        v_due_date := date_trunc('month', v_start_date)::date + (v_work.recurrence_day - 1);
        
        -- If that due date is before start date, move to next month
        IF v_due_date < v_start_date THEN
          v_due_date := (date_trunc('month', v_start_date) + INTERVAL '1 month')::date + (v_work.recurrence_day - 1);
        END IF;
        
        -- Period is the FULL MONTH containing the due date
        v_period_start_date := date_trunc('month', v_due_date)::date;
        v_period_end_date := (date_trunc('month', v_due_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        
      WHEN 'quarterly' THEN
        v_due_date := date_trunc('quarter', v_start_date)::date + (v_work.recurrence_day - 1);
        IF v_due_date < v_start_date THEN
          v_due_date := (date_trunc('quarter', v_start_date) + INTERVAL '3 months')::date + (v_work.recurrence_day - 1);
        END IF;
        v_period_start_date := date_trunc('quarter', v_due_date)::date;
        v_period_end_date := (date_trunc('quarter', v_due_date) + INTERVAL '3 months' - INTERVAL '1 day')::date;
        
      WHEN 'half-yearly' THEN
        IF EXTRACT(MONTH FROM v_start_date) <= 6 THEN
          v_due_date := date_trunc('year', v_start_date)::date + (v_work.recurrence_day - 1);
        ELSE
          v_due_date := (date_trunc('year', v_start_date)::date + INTERVAL '6 months') + (v_work.recurrence_day - 1);
        END IF;
        IF v_due_date < v_start_date THEN
          v_due_date := v_due_date + INTERVAL '6 months';
        END IF;
        IF EXTRACT(MONTH FROM v_due_date) <= 6 THEN
          v_period_start_date := date_trunc('year', v_due_date)::date;
          v_period_end_date := (date_trunc('year', v_due_date)::date + INTERVAL '6 months' - INTERVAL '1 day');
        ELSE
          v_period_start_date := (date_trunc('year', v_due_date)::date + INTERVAL '6 months');
          v_period_end_date := (date_trunc('year', v_due_date) + INTERVAL '1 year' - INTERVAL '1 day')::date;
        END IF;
        
      WHEN 'yearly' THEN
        v_due_date := date_trunc('year', v_start_date)::date + (v_work.recurrence_day - 1);
        IF v_due_date < v_start_date THEN
          v_due_date := v_due_date + INTERVAL '1 year';
        END IF;
        v_period_start_date := date_trunc('year', v_due_date)::date;
        v_period_end_date := (date_trunc('year', v_due_date) + INTERVAL '1 year' - INTERVAL '1 day')::date;
        
      ELSE
        v_due_date := v_start_date + INTERVAL '7 days';
        v_period_start_date := v_start_date;
        v_period_end_date := v_due_date;
    END CASE;
    
  ELSE
    -- SUBSEQUENT PERIODS: Calculate from the previous due date
    CASE v_work.recurrence_pattern
      WHEN 'monthly' THEN
        -- Next due date is same day next month
        v_due_date := (v_last_period.due_date + INTERVAL '1 month')::date;
        
        -- Handle month-end edge cases (e.g., Jan 31 -> Feb 28)
        IF EXTRACT(DAY FROM v_due_date) != v_work.recurrence_day THEN
          v_due_date := date_trunc('month', v_last_period.due_date + INTERVAL '1 month')::date + (v_work.recurrence_day - 1);
        END IF;
        
        -- Period is the FULL MONTH containing the new due date
        v_period_start_date := date_trunc('month', v_due_date)::date;
        v_period_end_date := (date_trunc('month', v_due_date) + INTERVAL '1 month' - INTERVAL '1 day')::date;
        
      WHEN 'quarterly' THEN
        v_due_date := (v_last_period.due_date + INTERVAL '3 months')::date;
        IF EXTRACT(DAY FROM v_due_date) != v_work.recurrence_day THEN
          v_due_date := date_trunc('month', v_last_period.due_date + INTERVAL '3 months')::date + (v_work.recurrence_day - 1);
        END IF;
        v_period_start_date := date_trunc('quarter', v_due_date)::date;
        v_period_end_date := (date_trunc('quarter', v_due_date) + INTERVAL '3 months' - INTERVAL '1 day')::date;
        
      WHEN 'half-yearly' THEN
        v_due_date := (v_last_period.due_date + INTERVAL '6 months')::date;
        IF EXTRACT(DAY FROM v_due_date) != v_work.recurrence_day THEN
          v_due_date := date_trunc('month', v_last_period.due_date + INTERVAL '6 months')::date + (v_work.recurrence_day - 1);
        END IF;
        IF EXTRACT(MONTH FROM v_due_date) <= 6 THEN
          v_period_start_date := date_trunc('year', v_due_date)::date;
          v_period_end_date := (date_trunc('year', v_due_date)::date + INTERVAL '6 months' - INTERVAL '1 day');
        ELSE
          v_period_start_date := (date_trunc('year', v_due_date)::date + INTERVAL '6 months');
          v_period_end_date := (date_trunc('year', v_due_date) + INTERVAL '1 year' - INTERVAL '1 day')::date;
        END IF;
        
      WHEN 'yearly' THEN
        v_due_date := (v_last_period.due_date + INTERVAL '1 year')::date;
        IF EXTRACT(DAY FROM v_due_date) != v_work.recurrence_day THEN
          v_due_date := date_trunc('month', v_last_period.due_date + INTERVAL '1 year')::date + (v_work.recurrence_day - 1);
        END IF;
        v_period_start_date := date_trunc('year', v_due_date)::date;
        v_period_end_date := (date_trunc('year', v_due_date) + INTERVAL '1 year' - INTERVAL '1 day')::date;
        
      ELSE
        v_due_date := v_last_period.due_date + INTERVAL '7 days';
        v_period_start_date := v_last_period.period_end_date + INTERVAL '1 day';
        v_period_end_date := v_due_date;
    END CASE;
  END IF;

  -- Generate period name
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
    'pending',
    v_work.billing_amount,
    false,
    'Auto-generated period'
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