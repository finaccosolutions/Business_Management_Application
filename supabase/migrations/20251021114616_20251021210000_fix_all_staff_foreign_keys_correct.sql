/*
  # Fix all foreign key constraints referencing staff table

  1. Changes
    - Drop all incorrect foreign key constraints that reference staff(id)
    - Add correct foreign key constraints that reference staff_members(id)

  2. Affected Tables
    - recurring_period_tasks (assigned_to, completed_by)
    - work_tasks (assigned_to only - no completed_by column)
    - work_recurring_instances (completed_by)

  3. Details
    - The table is named staff_members, not staff
    - This was causing insert failures when creating works and tasks with assigned staff
*/

-- Fix recurring_period_tasks.assigned_to
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recurring_period_tasks_assigned_to_fkey'
    AND table_name = 'recurring_period_tasks'
  ) THEN
    ALTER TABLE recurring_period_tasks DROP CONSTRAINT recurring_period_tasks_assigned_to_fkey;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recurring_period_tasks_assigned_to_staff_members_fkey'
    AND table_name = 'recurring_period_tasks'
  ) THEN
    ALTER TABLE recurring_period_tasks
    ADD CONSTRAINT recurring_period_tasks_assigned_to_staff_members_fkey
    FOREIGN KEY (assigned_to)
    REFERENCES staff_members(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Fix recurring_period_tasks.completed_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recurring_period_tasks_completed_by_fkey'
    AND table_name = 'recurring_period_tasks'
  ) THEN
    ALTER TABLE recurring_period_tasks DROP CONSTRAINT recurring_period_tasks_completed_by_fkey;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recurring_period_tasks_completed_by_staff_members_fkey'
    AND table_name = 'recurring_period_tasks'
  ) THEN
    ALTER TABLE recurring_period_tasks
    ADD CONSTRAINT recurring_period_tasks_completed_by_staff_members_fkey
    FOREIGN KEY (completed_by)
    REFERENCES staff_members(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Fix work_tasks.assigned_to
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_tasks_assigned_to_fkey'
    AND table_name = 'work_tasks'
  ) THEN
    ALTER TABLE work_tasks DROP CONSTRAINT work_tasks_assigned_to_fkey;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_tasks_assigned_to_staff_members_fkey'
    AND table_name = 'work_tasks'
  ) THEN
    ALTER TABLE work_tasks
    ADD CONSTRAINT work_tasks_assigned_to_staff_members_fkey
    FOREIGN KEY (assigned_to)
    REFERENCES staff_members(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Fix work_recurring_instances.completed_by
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_recurring_instances_completed_by_fkey'
    AND table_name = 'work_recurring_instances'
  ) THEN
    ALTER TABLE work_recurring_instances DROP CONSTRAINT work_recurring_instances_completed_by_fkey;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_recurring_instances_completed_by_staff_members_fkey'
    AND table_name = 'work_recurring_instances'
  ) THEN
    ALTER TABLE work_recurring_instances
    ADD CONSTRAINT work_recurring_instances_completed_by_staff_members_fkey
    FOREIGN KEY (completed_by)
    REFERENCES staff_members(id)
    ON DELETE SET NULL;
  END IF;
END $$;
