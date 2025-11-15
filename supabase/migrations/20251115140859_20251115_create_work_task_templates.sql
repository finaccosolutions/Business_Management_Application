/*
  # Work Task Templates System
  
  ## Overview
  Allows users to define additional tasks that should be automatically copied to all future periods
  of a recurring work. These are in addition to the service-level task templates.
  
  ## New Tables
  - `work_task_templates`: Store task templates defined at work level
    - `id` (uuid, primary key)
    - `work_id` (uuid, foreign key to works)
    - `title` (text, task title)
    - `description` (text, optional task description)
    - `priority` (text, low/medium/high)
    - `due_date_offset_days` (integer, days offset from period end date)
    - `estimated_hours` (numeric, optional)
    - `display_order` (integer, for sorting)
    - `created_at` (timestamp)
    - `updated_at` (timestamp)
  
  ## Security
  - RLS enabled for work_task_templates
  - Users can only manage templates for their own works
  
  ## Key Features
  - Templates are automatically copied when new periods are generated
  - Users can add, edit, delete templates for any work
  - Display order is maintained when copying to periods
*/

-- Create work_task_templates table
CREATE TABLE IF NOT EXISTS work_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date_offset_days integer NOT NULL DEFAULT 0,
  estimated_hours numeric(10,2),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_work_task_templates_work_id ON work_task_templates(work_id);
CREATE INDEX IF NOT EXISTS idx_work_task_templates_display_order ON work_task_templates(work_id, display_order);

-- Enable RLS
ALTER TABLE work_task_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view work task templates for their works"
  ON work_task_templates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_task_templates.work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create work task templates for their works"
  ON work_task_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update work task templates for their works"
  ON work_task_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_task_templates.work_id
      AND works.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_id
      AND works.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete work task templates for their works"
  ON work_task_templates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works
      WHERE works.id = work_task_templates.work_id
      AND works.user_id = auth.uid()
    )
  );

-- Create function to copy work task templates to a period
CREATE OR REPLACE FUNCTION copy_work_templates_to_period(
  p_period_id UUID,
  p_work_id UUID,
  p_period_end_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
  v_sort_order INTEGER;
BEGIN
  -- Get the maximum sort order for existing tasks in this period
  SELECT COALESCE(MAX(sort_order), 0)
  INTO v_sort_order
  FROM recurring_period_tasks
  WHERE work_recurring_instance_id = p_period_id;

  -- Copy each work task template to the period
  FOR v_template IN
    SELECT * FROM work_task_templates
    WHERE work_id = p_work_id
    ORDER BY display_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    v_due_date := p_period_end_date + v_template.due_date_offset_days;

    -- Insert the task
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      status,
      priority,
      estimated_hours,
      sort_order
    ) VALUES (
      p_period_id,
      NULL,
      v_template.title,
      v_template.description,
      v_due_date,
      'pending',
      v_template.priority,
      v_template.estimated_hours,
      v_sort_order + v_task_count + 1
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION copy_work_templates_to_period(UUID, UUID, DATE) TO authenticated;

-- Update existing copy_tasks_to_period function to also include work templates
-- First, let's check if the function exists and update it
CREATE OR REPLACE FUNCTION copy_tasks_to_period_with_templates(
  p_period_id UUID,
  p_work_id UUID,
  p_service_id UUID,
  p_period_end_date DATE,
  p_assigned_to UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_task RECORD;
  v_due_date DATE;
  v_total_tasks INTEGER := 0;
  v_sort_order INTEGER := 0;
BEGIN
  -- Copy service template tasks first
  FOR v_service_task IN
    SELECT st.*, st.due_date_offset_days
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.display_order ASC
  LOOP
    -- Calculate due date based on offset from period end date
    v_due_date := p_period_end_date + v_service_task.due_date_offset_days;

    -- Insert the task from service template
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      status,
      priority,
      assigned_to,
      estimated_hours,
      sort_order
    ) VALUES (
      p_period_id,
      v_service_task.id,
      v_service_task.title,
      v_service_task.description,
      v_due_date,
      'pending',
      v_service_task.priority,
      p_assigned_to,
      v_service_task.estimated_hours,
      v_sort_order
    );

    v_total_tasks := v_total_tasks + 1;
    v_sort_order := v_sort_order + 1;
  END LOOP;

  -- Then copy work-level task templates
  v_total_tasks := v_total_tasks + copy_work_templates_to_period(
    p_period_id,
    p_work_id,
    p_period_end_date
  );

  RETURN v_total_tasks;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_tasks_to_period_with_templates(UUID, UUID, UUID, DATE, UUID) TO authenticated;
