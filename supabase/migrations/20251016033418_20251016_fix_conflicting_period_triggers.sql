/*
  # Fix Conflicting Period Task Triggers

  ## Overview
  Fixes conflicts in trigger functions that create period tasks. There were multiple
  functions trying to do similar things with conflicting logic.

  ## Problems Fixed
  1. Duplicate triggers trying to create period tasks
  2. Ambiguous column references in trigger functions
  3. Conflicting function names and logic

  ## Solution
  - Keep the working `generate_period_tasks_for_instance()` function from 20251015 migration
  - Drop conflicting `auto_create_period_tasks()` function
  - Drop conflicting `update_period_tasks_completion()` function  
  - Ensure only one trigger creates period tasks

  ## Important
  This migration only drops duplicate/conflicting functions, does not modify working ones
*/

-- Drop conflicting trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_create_period_tasks ON work_recurring_instances;

-- Drop conflicting functions that cause ambiguous column references
DROP FUNCTION IF EXISTS auto_create_period_tasks() CASCADE;
DROP FUNCTION IF EXISTS update_period_tasks_completion() CASCADE;

-- Ensure the correct trigger exists (from 20251015 migration)
-- This is idempotent - if it already exists, it will be recreated
DROP TRIGGER IF EXISTS trigger_generate_period_tasks ON work_recurring_instances;
CREATE TRIGGER trigger_generate_period_tasks
  AFTER INSERT ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION generate_period_tasks_for_instance();

-- Ensure period completion check trigger exists
DROP TRIGGER IF EXISTS trigger_check_period_completion ON recurring_period_tasks;
CREATE TRIGGER trigger_check_period_completion
  AFTER INSERT OR UPDATE OF status ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_period_tasks_completion();
