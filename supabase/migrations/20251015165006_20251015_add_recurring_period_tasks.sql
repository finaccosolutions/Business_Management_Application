/*
  # Add Period-Task Tracking for Recurring Works

  ## Overview
  This migration enables task-level tracking within recurring periods, allowing:
  - Multiple tasks per service (e.g., GSTR-1 and GSTR-3B for GST filing)
  - Individual due dates for each task per period
  - Task-specific status tracking per period
  - Period completion when all tasks are done
  - Flexible due date adjustments per task per period

  ## New Tables

  ### 1. recurring_period_tasks
  Links service tasks to specific recurring periods with individual due dates and status.
  - Each period gets its own set of task instances
  - Each task can have different due dates per period
  - Track completion status per task
  - Link to staff assignment per task

  ## Modified Tables

  ### service_tasks
  Added columns:
  - `due_date_offset_days`: Default offset from period start (e.g., 10 for GSTR-1, 20 for GSTR-3B)
  - `due_date_offset_type`: Offset from 'period_start' or 'period_end' or 'month_start'

  ### work_recurring_instances
  Added column:
  - `all_tasks_completed`: Boolean to track if all tasks in period are done

  ## Features
  1. **Service Task Templates**
     - Define tasks with default due date offsets
     - Example: GSTR-1 due on 10th, GSTR-3B due on 20th of month
  
  2. **Automatic Period Task Generation**
     - When period is created, all service tasks are copied
     - Due dates calculated based on offset rules
     - Can be manually adjusted per period
  
  3. **Task-Level Tracking**
     - Each task has its own status (pending, in_progress, completed)
     - Track assigned staff per task
     - Add remarks and actual hours per task
  
  4. **Period Completion Logic**
     - Period marked complete only when ALL tasks are done
     - Auto-billing triggers when period completes
  
  ## Security
  - Enable RLS on recurring_period_tasks table
  - Users can only access tasks for their own works
  - All policies check ownership via works.user_id

  ## Important Notes
  1. Due dates can be overridden per task per period
  2. Completing all tasks auto-completes the period
  3. Each task can be assigned to different staff members
  4. Billing happens at period level (all tasks billed together)
*/

-- Add columns to service_tasks for due date configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'due_date_offset_days'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN due_date_offset_days integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'due_date_offset_type'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN due_date_offset_type text DEFAULT 'month_start';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tasks' AND column_name = 'default_assigned_to'
  ) THEN
    ALTER TABLE service_tasks ADD COLUMN default_assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN service_tasks.due_date_offset_days IS 'Number of days offset for due date (e.g., 10 for 10th of month)';
COMMENT ON COLUMN service_tasks.due_date_offset_type IS 'Type of offset: month_start (10th of month), period_start, period_end';

-- Add column to work_recurring_instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'all_tasks_completed'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN all_tasks_completed boolean DEFAULT false;
  END IF;
END $$;

-- Create recurring_period_tasks table
CREATE TABLE IF NOT EXISTS recurring_period_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_recurring_instance_id uuid REFERENCES work_recurring_instances(id) ON DELETE CASCADE NOT NULL,
  service_task_id uuid REFERENCES service_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_date date NOT NULL,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL,
  estimated_hours numeric(10, 2),
  actual_hours numeric(10, 2) DEFAULT 0,
  completed_at timestamptz,
  completed_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  remarks text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE recurring_period_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view period tasks for own works"
  ON recurring_period_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON w.id = wri.work_id
      WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert period tasks for own works"
  ON recurring_period_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON w.id = wri.work_id
      WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update period tasks for own works"
  ON recurring_period_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON w.id = wri.work_id
      WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON w.id = wri.work_id
      WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete period tasks for own works"
  ON recurring_period_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON w.id = wri.work_id
      WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_recurring_period_tasks_instance_id ON recurring_period_tasks(work_recurring_instance_id);
CREATE INDEX IF NOT EXISTS idx_recurring_period_tasks_status ON recurring_period_tasks(status);
CREATE INDEX IF NOT EXISTS idx_recurring_period_tasks_due_date ON recurring_period_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_period_tasks_assigned_to ON recurring_period_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_recurring_period_tasks_service_task_id ON recurring_period_tasks(service_task_id);

-- Function to calculate task due date based on offset configuration
CREATE OR REPLACE FUNCTION calculate_task_due_date(
  p_offset_type text,
  p_offset_days integer,
  p_period_start_date date,
  p_period_end_date date
)
RETURNS date AS $$
DECLARE
  result_date date;
BEGIN
  CASE p_offset_type
    WHEN 'month_start' THEN
      -- Calculate from start of month (e.g., 10th of month)
      result_date := DATE_TRUNC('month', p_period_start_date)::date + (COALESCE(p_offset_days, 1) - 1);
    WHEN 'period_start' THEN
      -- Calculate from period start date
      result_date := p_period_start_date + COALESCE(p_offset_days, 0);
    WHEN 'period_end' THEN
      -- Calculate from period end date
      result_date := p_period_end_date + COALESCE(p_offset_days, 0);
    ELSE
      -- Default to month start
      result_date := DATE_TRUNC('month', p_period_start_date)::date + (COALESCE(p_offset_days, 1) - 1);
  END CASE;
  
  RETURN result_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate period tasks when a new recurring period is created
CREATE OR REPLACE FUNCTION generate_period_tasks_for_instance()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id uuid;
  v_task_record RECORD;
  v_calculated_due_date date;
BEGIN
  -- Get the service_id from the work
  SELECT service_id INTO v_service_id
  FROM works
  WHERE id = NEW.work_id;

  -- If no service_id, skip task generation
  IF v_service_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Generate tasks for each active service task
  FOR v_task_record IN
    SELECT *
    FROM service_tasks
    WHERE service_id = v_service_id
    AND is_active = true
    ORDER BY sort_order
  LOOP
    -- Calculate due date based on offset configuration
    v_calculated_due_date := calculate_task_due_date(
      COALESCE(v_task_record.due_date_offset_type, 'month_start'),
      v_task_record.due_date_offset_days,
      NEW.period_start_date,
      NEW.period_end_date
    );

    -- Insert period task
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      priority,
      estimated_hours,
      assigned_to,
      sort_order,
      status
    ) VALUES (
      NEW.id,
      v_task_record.id,
      v_task_record.title,
      v_task_record.description,
      v_calculated_due_date,
      v_task_record.priority,
      v_task_record.estimated_hours,
      v_task_record.default_assigned_to,
      v_task_record.sort_order,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-generate period tasks when period is created
DROP TRIGGER IF EXISTS trigger_generate_period_tasks ON work_recurring_instances;
CREATE TRIGGER trigger_generate_period_tasks
  AFTER INSERT ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION generate_period_tasks_for_instance();

-- Function to check if all period tasks are completed
CREATE OR REPLACE FUNCTION check_period_tasks_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_total_tasks integer;
  v_completed_tasks integer;
  v_all_completed boolean;
BEGIN
  -- Count total and completed tasks for this period
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_tasks, v_completed_tasks
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = NEW.work_recurring_instance_id;

  -- Determine if all tasks are completed
  v_all_completed := (v_total_tasks > 0 AND v_total_tasks = v_completed_tasks);

  -- Update the period instance
  UPDATE work_recurring_instances
  SET 
    all_tasks_completed = v_all_completed,
    status = CASE 
      WHEN v_all_completed THEN 'completed'
      WHEN v_completed_tasks > 0 THEN 'in_progress'
      ELSE status
    END,
    completed_at = CASE 
      WHEN v_all_completed AND completed_at IS NULL THEN now()
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = NEW.work_recurring_instance_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update period completion status when task status changes
DROP TRIGGER IF EXISTS trigger_check_period_completion ON recurring_period_tasks;
CREATE TRIGGER trigger_check_period_completion
  AFTER INSERT OR UPDATE OF status ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_period_tasks_completion();

-- Function to update task completed_at timestamp
CREATE OR REPLACE FUNCTION update_period_task_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at := now();
    IF NEW.completed_by IS NULL THEN
      -- Try to get the current staff member if possible
      SELECT id INTO NEW.completed_by
      FROM staff
      WHERE user_id = auth.uid()
      LIMIT 1;
    END IF;
  ELSIF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_completion ON recurring_period_tasks;
CREATE TRIGGER trigger_update_task_completion
  BEFORE UPDATE ON recurring_period_tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_period_task_completion();
