/*
  # Fix Recurring Period Auto-Generation on Work Creation

  ## Overview
  This migration fixes the recurring work flow by automatically generating the first period
  when a recurring work is created. This ensures that:
  1. When a recurring work is created, the first period is automatically generated
  2. Period tasks are automatically created from service task templates
  3. Period documents are automatically created from work document templates
  4. Users don't need to manually create periods in the Recurring Periods tab

  ## Problem Being Solved
  Currently, when a recurring work is created:
  - No periods are generated automatically
  - Users must manually go to "Recurring Periods" tab and create periods
  - This is confusing and error-prone
  - Service tasks with individual due dates are not being utilized

  ## Solution
  Create a trigger that runs after a recurring work is inserted and automatically:
  1. Generates the first period based on recurrence pattern
  2. Calculates proper period dates (start, end, due date)
  3. Triggers existing cascading logic for tasks and documents

  ## Modified Tables
  No schema changes needed - only adding trigger logic

  ## New Functions
  1. `create_initial_recurring_period()` - Generates first period when recurring work is created
  2. `calculate_period_dates()` - Helper to calculate period start/end/due dates

  ## Features
  - Supports all recurrence patterns: monthly, quarterly, half_yearly, yearly
  - Properly calculates period dates based on work start date
  - Automatically triggers task generation (via existing trigger)
  - Automatically triggers document generation (via existing trigger)
  - Only runs for works with is_recurring = true

  ## Important Notes
  1. This only creates the FIRST period - subsequent periods created manually or via scheduler
  2. Existing works without periods will NOT be affected (trigger only on INSERT)
  3. All existing triggers for tasks and documents remain unchanged
  4. Period tasks inherit due dates from service_tasks configuration
*/

-- Function to calculate period dates based on recurrence pattern
CREATE OR REPLACE FUNCTION calculate_period_dates(
  p_start_date date,
  p_pattern text,
  p_period_number integer DEFAULT 0
)
RETURNS TABLE(
  period_start_date date,
  period_end_date date,
  due_date date,
  period_name text
) AS $$
DECLARE
  v_period_start date;
  v_period_end date;
  v_due_date date;
  v_period_name text;
BEGIN
  -- Calculate period start based on pattern and period number
  CASE p_pattern
    WHEN 'monthly' THEN
      v_period_start := DATE_TRUNC('month', p_start_date)::date + (p_period_number || ' months')::interval;
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
      v_due_date := v_period_end;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
      
    WHEN 'quarterly' THEN
      v_period_start := DATE_TRUNC('quarter', p_start_date)::date + (p_period_number * 3 || ' months')::interval;
      v_period_end := (v_period_start + INTERVAL '3 months' - INTERVAL '1 day')::date;
      v_due_date := v_period_end;
      v_period_name := 'Q' || EXTRACT(QUARTER FROM v_period_start)::text || ' ' || EXTRACT(YEAR FROM v_period_start)::text;
      
    WHEN 'half_yearly' THEN
      v_period_start := DATE_TRUNC('year', p_start_date)::date + (p_period_number * 6 || ' months')::interval;
      v_period_end := (v_period_start + INTERVAL '6 months' - INTERVAL '1 day')::date;
      v_due_date := v_period_end;
      v_period_name := 'H' || ((EXTRACT(MONTH FROM v_period_start)::integer - 1) / 6 + 1)::text || ' ' || EXTRACT(YEAR FROM v_period_start)::text;
      
    WHEN 'yearly' THEN
      v_period_start := DATE_TRUNC('year', p_start_date)::date + (p_period_number || ' years')::interval;
      v_period_end := (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
      v_due_date := v_period_end;
      v_period_name := 'FY ' || EXTRACT(YEAR FROM v_period_start)::text || '-' || EXTRACT(YEAR FROM v_period_end)::text;
      
    ELSE
      -- Default to monthly
      v_period_start := DATE_TRUNC('month', p_start_date)::date + (p_period_number || ' months')::interval;
      v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
      v_due_date := v_period_end;
      v_period_name := TO_CHAR(v_period_start, 'Month YYYY');
  END CASE;

  RETURN QUERY SELECT v_period_start, v_period_end, v_due_date, v_period_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to create initial recurring period when work is created
CREATE OR REPLACE FUNCTION create_initial_recurring_period()
RETURNS TRIGGER AS $$
DECLARE
  v_period_dates RECORD;
  v_period_id uuid;
BEGIN
  -- Only create period if this is a recurring work
  IF NEW.is_recurring = true AND NEW.recurrence_pattern IS NOT NULL THEN
    
    -- Calculate period dates based on work start date and recurrence pattern
    SELECT * INTO v_period_dates
    FROM calculate_period_dates(
      COALESCE(NEW.start_date, CURRENT_DATE),
      NEW.recurrence_pattern,
      0  -- First period (period number 0)
    );

    -- Create the first recurring period
    INSERT INTO work_recurring_instances (
      work_id,
      period_name,
      period_start_date,
      period_end_date,
      due_date,
      billing_amount,
      status,
      notes
    ) VALUES (
      NEW.id,
      v_period_dates.period_name,
      v_period_dates.period_start_date,
      v_period_dates.period_end_date,
      v_period_dates.due_date,
      NEW.billing_amount,
      'pending',
      'Auto-generated initial period'
    ) RETURNING id INTO v_period_id;

    -- The following will be automatically handled by existing triggers:
    -- 1. Period tasks will be created from service_tasks (trigger_generate_period_tasks)
    -- 2. Period documents will be created from work_documents (trigger on work_recurring_instances)
    
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;

-- Create trigger to auto-generate first period when recurring work is created
CREATE TRIGGER trigger_create_initial_recurring_period
  AFTER INSERT ON works
  FOR EACH ROW
  WHEN (NEW.is_recurring = true)
  EXECUTE FUNCTION create_initial_recurring_period();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_work_id_status ON work_recurring_instances(work_id, status);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_due_date ON work_recurring_instances(due_date) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_recurring_period_tasks_due_date_status ON recurring_period_tasks(due_date, status) WHERE status != 'completed';

-- Add helpful comments
COMMENT ON FUNCTION create_initial_recurring_period() IS 'Automatically creates the first period when a recurring work is inserted';
COMMENT ON FUNCTION calculate_period_dates(date, text, integer) IS 'Calculates period start, end, due dates and name based on recurrence pattern';
