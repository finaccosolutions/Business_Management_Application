/*
  # Add Service Task Templates

  ## Overview
  This migration adds a service_tasks table to store predefined task templates
  for each service. These templates will be used to automatically create tasks
  when a work is created from a service.

  ## New Tables

  ### 1. service_tasks
  - Task templates for services (e.g., GST Return Filing steps)
  - Each service can have multiple predefined tasks
  - Tasks include title, description, estimated hours, priority, etc.
  - These act as templates for future works

  ## Features
  - When creating a work from a service, tasks are automatically copied
  - Task templates can be managed from the Service Details page
  - Supports task ordering via sort_order field
  - All standard task fields (priority, estimated hours, etc.)

  ## Security
  - Enable RLS on service_tasks table
  - Users can only access tasks for their own services
  - All policies check service ownership via services.user_id

  ## Important Notes
  1. These are TEMPLATES, not actual tasks
  2. Actual tasks are created in work_tasks when work is created
  3. Modifying service tasks doesn't affect existing works
  4. Each service can have 0 to many task templates
*/

-- Create service_tasks table
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

-- Enable RLS
ALTER TABLE service_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_tasks
CREATE POLICY "Users can view service tasks for own services"
  ON service_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tasks.service_id
      AND services.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert service tasks for own services"
  ON service_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tasks.service_id
      AND services.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update service tasks for own services"
  ON service_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tasks.service_id
      AND services.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tasks.service_id
      AND services.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete service tasks for own services"
  ON service_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM services
      WHERE services.id = service_tasks.service_id
      AND services.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_tasks_service_id ON service_tasks(service_id);
CREATE INDEX IF NOT EXISTS idx_service_tasks_sort_order ON service_tasks(sort_order);
CREATE INDEX IF NOT EXISTS idx_service_tasks_is_active ON service_tasks(is_active);

-- Add billing_amount and is_billed columns to work_recurring_instances if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'billing_amount'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN billing_amount numeric(10, 2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'is_billed'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN is_billed boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_recurring_instances' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE work_recurring_instances ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;
