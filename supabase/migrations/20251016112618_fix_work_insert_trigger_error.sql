/*
  # Fix Work Insert Trigger Error

  1. Problem
    - The trigger function `generate_next_recurring_period()` that returns TRIGGER is trying to access `NEW.work_id`
    - But when inserting into `works` table, the NEW record has `id`, not `work_id`
    - This causes error: "record 'new' has no field 'work_id'"

  2. Solution
    - Drop the incorrect trigger function (the one that returns TRIGGER)
    - Keep only the correct one that takes p_work_id as parameter
    - Drop the trigger `trigger_generate_recurring_periods` on works table
    - The `trigger_create_initial_recurring_period` already handles recurring work creation properly

  3. Changes
    - Remove duplicate/incorrect trigger function
    - Remove problematic trigger from works table
*/

-- Drop the problematic trigger first
DROP TRIGGER IF EXISTS trigger_generate_recurring_periods ON works;

-- Drop the incorrect trigger function (the one that returns TRIGGER and tries to access NEW.work_id)
-- This function was incorrectly accessing NEW.work_id when it should access NEW.id
DROP FUNCTION IF EXISTS generate_next_recurring_period() CASCADE;

-- The correct function generate_next_recurring_period(p_work_id uuid) is still there and working
-- It's used by other parts of the system that pass work_id as a parameter

-- Verify the remaining triggers on works table are correct
-- These should remain:
-- 1. trigger_copy_service_tasks_to_work - uses NEW.id ✓
-- 2. trigger_create_initial_recurring_period - uses NEW.id ✓
-- 3. log_work_created - uses NEW.id ✓
-- 4. log_work_status_change - uses NEW.id ✓
-- 5. trigger_auto_generate_work_invoice - uses NEW.id ✓
-- 6. trigger_copy_service_documents_to_work - uses NEW.id ✓

COMMENT ON FUNCTION generate_next_recurring_period(uuid) IS 
  'Generates the next recurring period for a work. Takes work_id as parameter. Used by period completion triggers.';
