/*
  # Fix Dynamic Period Generation - Remove Duplicate Triggers
  
  ## Problem
  Two triggers are running and creating duplicate periods:
  1. trigger_auto_generate_recurring_periods (new, correct one)
  2. trigger_generate_all_missing_periods (old, uses period_type)
  
  ## Solution
  - Drop the old duplicate trigger and function
  - Ensure only ONE period generation system exists
  - Period generation based ONLY on elapsed time between start_date and current_date
  
  ## Logic for ALL recurrence patterns (monthly, quarterly, half_yearly, yearly)
  - Start date Oct 16, Current date Oct 17 → 1 period (same period)
  - Start date Aug 5, Current date Oct 16 → 3 monthly periods (Aug, Sep, Oct)
  - Start date Q1 2025, Current date Q3 2025 → 3 quarterly periods (Q1, Q2, Q3)
  - Start date H1 2024, Current date H2 2025 → 3 half-yearly periods (H1-24, H2-24, H1-25)
*/

-- ============================================================================
-- Drop duplicate trigger and its function
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_generate_all_missing_periods ON works;
DROP FUNCTION IF EXISTS generate_all_missing_periods() CASCADE;

-- Also drop any other old period-related functions that might interfere
DROP FUNCTION IF EXISTS add_period_interval(DATE, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS calculate_period_for_date(DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS generate_period_name_v2(DATE, DATE, TEXT) CASCADE;

-- ============================================================================
-- Ensure the correct trigger exists (recreate to be safe)
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_auto_generate_recurring_periods ON works;

CREATE TRIGGER trigger_auto_generate_recurring_periods
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_recurring_periods();

-- ============================================================================
-- Clean up any duplicate periods in existing data
-- ============================================================================
DELETE FROM work_recurring_instances wri1
WHERE EXISTS (
  SELECT 1 FROM work_recurring_instances wri2
  WHERE wri1.work_id = wri2.work_id
  AND wri1.period_start_date = wri2.period_start_date
  AND wri1.id > wri2.id
);
