/*
  # Comprehensive Work Management System

  ## Overview
  This migration adds comprehensive work management features including staff management,
  work assignments with reassignment history, tasks/subtasks, recurring work instances,
  and time tracking.

  ## New Tables

  ### 1. staff_members
  - Staff/employee management with detailed profiles
  - Tracks availability, skills, roles, and employment details
  - Supports both active and inactive staff members

  ### 2. work_assignments
  - Tracks current and historical work assignments
  - Records who assigned work, when, and reassignment history
  - Maintains is_current flag for active assignments

  ### 3. work_tasks
  - Tasks/subtasks within works
  - Each task can be assigned to different staff
  - Tracks status, priority, estimated and actual hours

  ### 4. work_recurring_instances
  - Manages recurring work periods (for monthly GST filing, etc.)
  - Tracks each period's due date, completion status
  - Links back to parent work for easy management

  ### 5. time_logs
  - Time tracking for works and tasks
  - Records start/end times, duration, and billable status
  - Links to staff member who logged time

  ## Updates to Existing Tables

  ### works table additions:
  - is_recurring: flag for recurring works
  - recurrence_pattern: monthly, quarterly, etc.
  - next_due_date: for recurring works
  - assigned_date: when work was assigned
  - completion_date: when work was completed
  - billing_status, billing_amount: billing tracking
  - estimated_hours, actual_duration_hours: time tracking
  - is_recurring_instance, parent_service_id, instance_date: for recurring instances

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - All policies check auth.uid() = user_id

  ## Important Notes
  1. For recurring works: Create ONE work record with is_recurring=true
  2. Each recurrence period tracked in work_recurring_instances table
  3. Assignment history maintained in work_assignments table
  4. Tasks are optional subtasks within works
  5. Time logs track actual time spent by staff
*/

-- Create staff_members table
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  employee_id text,
  name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'staff',
  department text,
  joining_date date,
  employment_type text DEFAULT 'full_time',
  salary_method text DEFAULT 'monthly',
  salary_amount numeric(10, 2),
  hourly_rate numeric(10, 2),
  is_active boolean DEFAULT true,
  availability_status text DEFAULT 'available',
  skills text[],
  expertise_areas text[],
  education jsonb,
  emergency_contact jsonb,
  certifications jsonb[],
  address text,
  city text,
  state text,
  pincode text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own staff members"
  ON staff_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own staff members"
  ON staff_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own staff members"
  ON staff_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own staff members"
  ON staff_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add columns to works table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_recurring'
  ) THEN
    ALTER TABLE works ADD COLUMN is_recurring boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'recurrence_pattern'
  ) THEN
    ALTER TABLE works ADD COLUMN recurrence_pattern text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'recurrence_day'
  ) THEN
    ALTER TABLE works ADD COLUMN recurrence_day integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'next_due_date'
  ) THEN
    ALTER TABLE works ADD COLUMN next_due_date date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'assigned_date'
  ) THEN
    ALTER TABLE works ADD COLUMN assigned_date timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'completion_date'
  ) THEN
    ALTER TABLE works ADD COLUMN completion_date timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'billing_status'
  ) THEN
    ALTER TABLE works ADD COLUMN billing_status text DEFAULT 'not_billed';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'billing_amount'
  ) THEN
    ALTER TABLE works ADD COLUMN billing_amount numeric(10, 2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'estimated_hours'
  ) THEN
    ALTER TABLE works ADD COLUMN estimated_hours numeric(10, 2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'actual_duration_hours'
  ) THEN
    ALTER TABLE works ADD COLUMN actual_duration_hours numeric(10, 2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_recurring_instance'
  ) THEN
    ALTER TABLE works ADD COLUMN is_recurring_instance boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'parent_service_id'
  ) THEN
    ALTER TABLE works ADD COLUMN parent_service_id uuid REFERENCES services(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'instance_date'
  ) THEN
    ALTER TABLE works ADD COLUMN instance_date date;
  END IF;
END $$;

-- Update assigned_to to reference staff_members
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'assigned_to'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE works DROP CONSTRAINT IF EXISTS works_assigned_to_fkey;
    ALTER TABLE works ADD CONSTRAINT works_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES staff_members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create work_assignments table
CREATE TABLE IF NOT EXISTS work_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  reassigned_from uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  reassignment_reason text,
  status text DEFAULT 'assigned',
  is_current boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE work_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view work assignments"
  ON work_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_assignments.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert work assignments"
  ON work_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_assignments.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update work assignments"
  ON work_assignments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_assignments.work_id
      AND works.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_assignments.work_id
      AND works.user_id = auth.uid()
    )
  );

-- Create work_tasks table
CREATE TABLE IF NOT EXISTS work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  due_date date,
  estimated_hours numeric(10, 2),
  actual_hours numeric(10, 2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view work tasks"
  ON work_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_tasks.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert work tasks"
  ON work_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_tasks.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update work tasks"
  ON work_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_tasks.work_id
      AND works.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_tasks.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete work tasks"
  ON work_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_tasks.work_id
      AND works.user_id = auth.uid()
    )
  );

-- Create work_recurring_instances table
CREATE TABLE IF NOT EXISTS work_recurring_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  period_name text NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'pending',
  completed_at timestamptz,
  completed_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_recurring_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view work recurring instances"
  ON work_recurring_instances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_recurring_instances.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert work recurring instances"
  ON work_recurring_instances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_recurring_instances.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update work recurring instances"
  ON work_recurring_instances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_recurring_instances.work_id
      AND works.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_recurring_instances.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete work recurring instances"
  ON work_recurring_instances FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_recurring_instances.work_id
      AND works.user_id = auth.uid()
    )
  );

-- Create time_logs table
CREATE TABLE IF NOT EXISTS time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  work_id uuid REFERENCES works(id) ON DELETE CASCADE,
  work_task_id uuid REFERENCES work_tasks(id) ON DELETE CASCADE,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE CASCADE NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_hours numeric(10, 2),
  description text,
  is_billable boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own time logs"
  ON time_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own time logs"
  ON time_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time logs"
  ON time_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own time logs"
  ON time_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_staff_members_user_id ON staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_is_active ON staff_members(is_active);
CREATE INDEX IF NOT EXISTS idx_staff_members_availability_status ON staff_members(availability_status);

CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON work_assignments(work_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_staff_member_id ON work_assignments(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_is_current ON work_assignments(is_current);

CREATE INDEX IF NOT EXISTS idx_work_tasks_work_id ON work_tasks(work_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_assigned_to ON work_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_tasks_status ON work_tasks(status);

CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_work_id ON work_recurring_instances(work_id);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_status ON work_recurring_instances(status);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_due_date ON work_recurring_instances(due_date);

CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_work_id ON time_logs(work_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_staff_member_id ON time_logs(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_start_time ON time_logs(start_time DESC);

CREATE INDEX IF NOT EXISTS idx_works_is_recurring ON works(is_recurring);
CREATE INDEX IF NOT EXISTS idx_works_assigned_to ON works(assigned_to);
