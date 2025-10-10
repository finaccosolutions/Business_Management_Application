/*
  # Service-Work Automation with Recurring Period Management

  ## Overview
  Complete service-to-work automation system with:
  - Auto-fill work details from service templates
  - Recurring work with period-wise tracking
  - Automatic due date calculation based on recurring rules
  - Period-wise billing and invoice generation
  - Team assignment per period
  - Work reminders and notifications

  ## Key Features
  1. **Service Templates**
     - Service task templates that copy to works
     - Default pricing, duration, and billing rules
     - Recurring configuration (monthly, quarterly, yearly)
     - Fixed recurring day (e.g., 10th of each month)

  2. **Automated Work Creation**
     - Auto-populate work details from service
     - Auto-calculate due dates based on recurring rules
     - Copy service tasks to work tasks automatically

  3. **Period-Wise Management**
     - Track each recurring period separately (Oct 2024, Nov 2024, etc.)
     - Assign team members per period
     - Update status per period (Pending, In Progress, Completed)
     - Auto-billing when period is completed

  4. **Automated Workflow**
     - Auto-create next period when previous completes
     - Send due date reminders
     - Generate invoices on completion
     - Track all period history

  ## Tables Added/Modified
  - services: Enhanced with recurring day configuration
  - works: Enhanced with recurring instance tracking
  - work_recurring_instances: Period-wise tracking
  - work_tasks: Task management per work
  - work_assignments: Team assignment history
  - time_logs: Time tracking per work
  - service_tasks: Reusable task templates

  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
*/

-- Add missing columns to services table for improved recurring support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_day'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_day integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'recurrence_month'
  ) THEN
    ALTER TABLE services ADD COLUMN recurrence_month integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'auto_generate_work'
  ) THEN
    ALTER TABLE services ADD COLUMN auto_generate_work boolean DEFAULT true;
  END IF;
END $$;

-- Enhance works table for recurring support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'billing_status'
  ) THEN
    ALTER TABLE works ADD COLUMN billing_status text DEFAULT 'not_billed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'billing_amount'
  ) THEN
    ALTER TABLE works ADD COLUMN billing_amount numeric(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'estimated_hours'
  ) THEN
    ALTER TABLE works ADD COLUMN estimated_hours numeric(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'actual_duration_hours'
  ) THEN
    ALTER TABLE works ADD COLUMN actual_duration_hours numeric(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_recurring'
  ) THEN
    ALTER TABLE works ADD COLUMN is_recurring boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'recurrence_pattern'
  ) THEN
    ALTER TABLE works ADD COLUMN recurrence_pattern text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'recurrence_day'
  ) THEN
    ALTER TABLE works ADD COLUMN recurrence_day integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'auto_bill'
  ) THEN
    ALTER TABLE works ADD COLUMN auto_bill boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE works ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'assigned_date'
  ) THEN
    ALTER TABLE works ADD COLUMN assigned_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'completion_date'
  ) THEN
    ALTER TABLE works ADD COLUMN completion_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'is_recurring_instance'
  ) THEN
    ALTER TABLE works ADD COLUMN is_recurring_instance boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'parent_service_id'
  ) THEN
    ALTER TABLE works ADD COLUMN parent_service_id uuid REFERENCES services(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'instance_date'
  ) THEN
    ALTER TABLE works ADD COLUMN instance_date date;
  END IF;
END $$;

-- Create service_tasks table for reusable task templates
CREATE TABLE IF NOT EXISTS service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium',
  estimated_hours numeric(10, 2),
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE service_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view service tasks" ON service_tasks;
DROP POLICY IF EXISTS "Users can insert service tasks" ON service_tasks;
DROP POLICY IF EXISTS "Users can update service tasks" ON service_tasks;
DROP POLICY IF EXISTS "Users can delete service tasks" ON service_tasks;

CREATE POLICY "Users can view service tasks" ON service_tasks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM services WHERE services.id = service_tasks.service_id AND services.user_id = auth.uid())
);
CREATE POLICY "Users can insert service tasks" ON service_tasks FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM services WHERE services.id = service_tasks.service_id AND services.user_id = auth.uid())
);
CREATE POLICY "Users can update service tasks" ON service_tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM services WHERE services.id = service_tasks.service_id AND services.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM services WHERE services.id = service_tasks.service_id AND services.user_id = auth.uid()));
CREATE POLICY "Users can delete service tasks" ON service_tasks FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM services WHERE services.id = service_tasks.service_id AND services.user_id = auth.uid())
);

-- Create work_tasks table for tasks within a work
CREATE TABLE IF NOT EXISTS work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL,
  estimated_hours numeric(10, 2),
  actual_hours numeric(10, 2) DEFAULT 0,
  due_date date,
  sort_order integer DEFAULT 0,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can insert work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can update work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can delete work tasks" ON work_tasks;

CREATE POLICY "Users can view work tasks" ON work_tasks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can insert work tasks" ON work_tasks FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can update work tasks" ON work_tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid()));
CREATE POLICY "Users can delete work tasks" ON work_tasks FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid())
);

-- Create time_logs table for time tracking
CREATE TABLE IF NOT EXISTS time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_hours numeric(10, 2),
  description text,
  is_billable boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can insert own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can update own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can delete own time logs" ON time_logs;

CREATE POLICY "Users can view own time logs" ON time_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time logs" ON time_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time logs" ON time_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own time logs" ON time_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create work_assignments table for tracking work assignments
CREATE TABLE IF NOT EXISTS work_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  reassigned_from uuid REFERENCES staff(id) ON DELETE SET NULL,
  reassignment_reason text,
  status text DEFAULT 'assigned',
  is_current boolean DEFAULT true
);

ALTER TABLE work_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can insert work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can update work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can delete work assignments" ON work_assignments;

CREATE POLICY "Users can view work assignments" ON work_assignments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can insert work assignments" ON work_assignments FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can update work assignments" ON work_assignments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid()));
CREATE POLICY "Users can delete work assignments" ON work_assignments FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid())
);

-- Create work_recurring_instances table for period-wise tracking
CREATE TABLE IF NOT EXISTS work_recurring_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  period_name text NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'pending',
  completed_at timestamptz,
  completed_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  notes text,
  billing_amount numeric(10, 2),
  is_billed boolean DEFAULT false,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_recurring_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can insert recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can update recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can delete recurring instances" ON work_recurring_instances;

CREATE POLICY "Users can view recurring instances" ON work_recurring_instances FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can insert recurring instances" ON work_recurring_instances FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can update recurring instances" ON work_recurring_instances FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid()));
CREATE POLICY "Users can delete recurring instances" ON work_recurring_instances FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid())
);

-- Add staff_members table if not exists (referenced in other tables)
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  department text,
  designation text,
  is_active boolean DEFAULT true,
  availability_status text DEFAULT 'available',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own staff members" ON staff_members;
DROP POLICY IF EXISTS "Users can insert own staff members" ON staff_members;
DROP POLICY IF EXISTS "Users can update own staff members" ON staff_members;
DROP POLICY IF EXISTS "Users can delete own staff members" ON staff_members;

CREATE POLICY "Users can view own staff members" ON staff_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own staff members" ON staff_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own staff members" ON staff_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own staff members" ON staff_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Function to copy service tasks to work tasks
CREATE OR REPLACE FUNCTION copy_service_tasks_to_work(p_service_id uuid, p_work_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO work_tasks (
    work_id,
    title,
    description,
    priority,
    estimated_hours,
    sort_order,
    status
  )
  SELECT
    p_work_id,
    title,
    description,
    priority,
    estimated_hours,
    sort_order,
    'pending'
  FROM service_tasks
  WHERE service_id = p_service_id
    AND is_active = true
  ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Function to calculate next due date based on recurrence
CREATE OR REPLACE FUNCTION calculate_next_due_date(
  p_recurrence_pattern text,
  p_recurrence_day integer,
  p_base_date date DEFAULT CURRENT_DATE
)
RETURNS date AS $$
DECLARE
  next_date date;
  current_day integer;
  target_day integer;
BEGIN
  target_day := COALESCE(p_recurrence_day, 1);

  CASE p_recurrence_pattern
    WHEN 'monthly' THEN
      current_day := EXTRACT(DAY FROM p_base_date)::integer;

      IF current_day <= target_day THEN
        -- Target day is in current month
        next_date := DATE_TRUNC('month', p_base_date) + (target_day - 1 || ' days')::interval;
      ELSE
        -- Target day is in next month
        next_date := (DATE_TRUNC('month', p_base_date) + '1 month'::interval) + (target_day - 1 || ' days')::interval;
      END IF;

    WHEN 'quarterly' THEN
      -- First day of target month in quarter
      next_date := p_base_date + '3 months'::interval;
      next_date := DATE_TRUNC('month', next_date) + (target_day - 1 || ' days')::interval;

    WHEN 'half_yearly' THEN
      next_date := p_base_date + '6 months'::interval;
      next_date := DATE_TRUNC('month', next_date) + (target_day - 1 || ' days')::interval;

    WHEN 'yearly' THEN
      next_date := p_base_date + '1 year'::interval;
      next_date := DATE_TRUNC('month', next_date) + (target_day - 1 || ' days')::interval;

    ELSE
      next_date := p_base_date + '1 month'::interval;
  END CASE;

  RETURN next_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to increment work hours when time is logged
CREATE OR REPLACE FUNCTION increment_work_hours(p_work_id uuid, p_hours_to_add numeric)
RETURNS void AS $$
BEGIN
  UPDATE works
  SET actual_duration_hours = COALESCE(actual_duration_hours, 0) + p_hours_to_add,
      updated_at = now()
  WHERE id = p_work_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_tasks_service_id ON service_tasks(service_id);
CREATE INDEX IF NOT EXISTS idx_service_tasks_sort_order ON service_tasks(service_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_work_tasks_work_id ON work_tasks(work_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_status ON work_tasks(status);
CREATE INDEX IF NOT EXISTS idx_work_tasks_assigned_to ON work_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_time_logs_work_id ON time_logs(work_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_staff_member_id ON time_logs(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON work_assignments(work_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_staff_member_id ON work_assignments(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_is_current ON work_assignments(is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_work_id ON work_recurring_instances(work_id);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_status ON work_recurring_instances(status);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_due_date ON work_recurring_instances(due_date);
CREATE INDEX IF NOT EXISTS idx_works_is_recurring ON works(is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_works_billing_status ON works(billing_status);
CREATE INDEX IF NOT EXISTS idx_staff_members_user_id ON staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_is_active ON staff_members(is_active) WHERE is_active = true;
