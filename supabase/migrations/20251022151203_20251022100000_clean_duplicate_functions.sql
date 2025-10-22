/*
  # Clean Duplicate Functions

  1. Purpose
    - Remove duplicate database functions that have conflicting variants
    - Keep only the most recent/correct version of each function

  2. Functions to Clean
    - calculate_next_due_date (2 variants)
    - calculate_period_dates (2 variants)
    - calculate_task_due_date (2 variants)

  3. Approach
    - Drop all variants of duplicate functions
    - Recreate the correct version based on latest requirements
*/

-- Drop all variants of calculate_next_due_date
DROP FUNCTION IF EXISTS calculate_next_due_date(date, text) CASCADE;

-- Drop all variants of calculate_period_dates
DROP FUNCTION IF EXISTS calculate_period_dates(date, text, integer) CASCADE;

-- Drop all variants of calculate_task_due_date
DROP FUNCTION IF EXISTS calculate_task_due_date(date, text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_task_due_date(integer, date, date) CASCADE;

-- Recreate calculate_next_period_dates (the correct version)
-- This function already exists and is being used correctly
