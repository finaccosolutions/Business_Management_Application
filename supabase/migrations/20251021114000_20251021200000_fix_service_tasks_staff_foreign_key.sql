/*
  # Fix service_tasks foreign key constraint

  1. Changes
    - Drop the incorrect foreign key constraint on service_tasks.default_assigned_to that references staff(id)
    - Add the correct foreign key constraint that references staff_members(id)

  2. Details
    - The table is named staff_members, not staff
    - This was causing insert failures when creating service tasks with assigned staff
*/

-- Drop the incorrect foreign key constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_tasks_default_assigned_to_fkey'
    AND table_name = 'service_tasks'
  ) THEN
    ALTER TABLE service_tasks DROP CONSTRAINT service_tasks_default_assigned_to_fkey;
  END IF;
END $$;

-- Add the correct foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_tasks_default_assigned_to_staff_members_fkey'
    AND table_name = 'service_tasks'
  ) THEN
    ALTER TABLE service_tasks
    ADD CONSTRAINT service_tasks_default_assigned_to_staff_members_fkey
    FOREIGN KEY (default_assigned_to)
    REFERENCES staff_members(id)
    ON DELETE SET NULL;
  END IF;
END $$;
