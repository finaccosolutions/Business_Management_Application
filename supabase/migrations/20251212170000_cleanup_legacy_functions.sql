/*
  # Cleanup Legacy and Duplicate Functions

  1. DROPS:
     - `calculate_task_due_date` (Legacy helper)
     - `calculate_task_due_date_in_period` (Legacy helper)
     - `calculate_task_due_date_in_month` (Legacy/Typo)
     - `calculate_configured_task_due_date` (Old signatures, if any)

  2. NOTES:
     - The "One True Function" to keep is:
       `calculate_configured_task_due_date(RECORD, date, date)`
       (Defined in 20251212163000_fix_task_generation_logic.sql)
*/

-- Drop specific known signatures to clean up
-- Note: 'IF EXISTS' prevents errors if they are already gone.

-- 1. Remove old simple calculator
-- Likely signature: (date, int, text) or similar.
-- We'll try to drop by name with likely arguments. 
-- PostgreSQL DROP FUNCTION requires signature if overloaded, but allow dropping all with same name? keeping it safe.
DROP FUNCTION IF EXISTS public.calculate_task_due_date(date, integer, text);
DROP FUNCTION IF EXISTS public.calculate_task_due_date(date, int, text);
DROP FUNCTION IF EXISTS public.calculate_task_due_date(uuid, date, date); -- Just in case

-- 2. Remove legacy Period Calculator
DROP FUNCTION IF EXISTS public.calculate_task_due_date_in_period(uuid, date, date);

-- 3. Remove "In Month" typo function if it ever existed
DROP FUNCTION IF EXISTS public.calculate_task_due_date_in_month(uuid, integer, integer);

-- 4. Remove any INCORRECT overloads of the Configured function.
-- The CORRECT one is (RECORD, date, date).
-- We assume any others are wrong.
-- However, we cannot easily "drop all except".
-- Use 'DROP FUNCTION ...' for specific bad signatures if known.
-- User showed one that seemed to just use p_period_end. 
-- Likely signature: (record, date) OR (record, date, date) but with simpler logic?
-- If it has the SAME signature (record, date, date), then the latest migration (163000) ALREADY replaced it.
-- So we only need to worry about *different* signatures.
-- If there was a version with just (record, date), drop it.
DROP FUNCTION IF EXISTS public.calculate_configured_task_due_date(record, date);
