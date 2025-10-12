/*
  # Work Activities and Period Documents Enhancement

  ## Overview
  This migration adds comprehensive activity tracking for works and enhances recurring period management
  with per-period document tracking.

  ## New Tables
  1. **work_activities**
     - Tracks all activities related to a work (status changes, assignments, tasks, etc.)
     - Provides complete audit trail and activity timeline
     - Includes metadata for additional context

  2. **work_recurring_period_documents**
     - Tracks document collection status per recurring period
     - Links documents to specific periods for recurring works
     - Enables period-specific document management

  ## Modifications
  - Enhanced work_documents table with additional fields
  - Added triggers for automatic activity logging

  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
*/

-- Create work_activities table
CREATE TABLE IF NOT EXISTS work_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb,
  created_by_staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_work_activities_work_id ON work_activities(work_id);
CREATE INDEX IF NOT EXISTS idx_work_activities_created_at ON work_activities(created_at DESC);

-- Enable RLS
ALTER TABLE work_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_activities
CREATE POLICY "Users can view own work activities"
  ON work_activities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own work activities"
  ON work_activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work activities"
  ON work_activities FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own work activities"
  ON work_activities FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create work_recurring_period_documents table
CREATE TABLE IF NOT EXISTS work_recurring_period_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_recurring_instance_id uuid REFERENCES work_recurring_instances(id) ON DELETE CASCADE NOT NULL,
  work_document_id uuid REFERENCES work_documents(id) ON DELETE CASCADE NOT NULL,
  is_collected boolean DEFAULT false,
  collected_at timestamptz,
  collected_by_staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  file_url text,
  file_size integer,
  uploaded_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(work_recurring_instance_id, work_document_id)
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_period_docs_instance_id ON work_recurring_period_documents(work_recurring_instance_id);
CREATE INDEX IF NOT EXISTS idx_period_docs_document_id ON work_recurring_period_documents(work_document_id);

-- Enable RLS
ALTER TABLE work_recurring_period_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_recurring_period_documents
CREATE POLICY "Users can view own period documents"
  ON work_recurring_period_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON wri.work_id = w.id
      WHERE wri.id = work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own period documents"
  ON work_recurring_period_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON wri.work_id = w.id
      WHERE wri.id = work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own period documents"
  ON work_recurring_period_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON wri.work_id = w.id
      WHERE wri.id = work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON wri.work_id = w.id
      WHERE wri.id = work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own period documents"
  ON work_recurring_period_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_recurring_instances wri
      JOIN works w ON wri.work_id = w.id
      WHERE wri.id = work_recurring_instance_id
      AND w.user_id = auth.uid()
    )
  );

-- Function to log work activity
CREATE OR REPLACE FUNCTION log_work_activity(
  p_work_id uuid,
  p_activity_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_created_by_staff_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_activity_id uuid;
BEGIN
  -- Get user_id from work
  SELECT user_id INTO v_user_id FROM works WHERE id = p_work_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Work not found';
  END IF;

  -- Insert activity
  INSERT INTO work_activities (
    work_id,
    user_id,
    activity_type,
    title,
    description,
    metadata,
    created_by_staff_id
  ) VALUES (
    p_work_id,
    v_user_id,
    p_activity_type,
    p_title,
    p_description,
    p_metadata,
    p_created_by_staff_id
  ) RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log work creation
CREATE OR REPLACE FUNCTION trigger_log_work_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_work_activity(
    NEW.id,
    'work_created',
    'Work Created',
    'Work "' || NEW.title || '" was created',
    jsonb_build_object(
      'status', NEW.status,
      'priority', NEW.priority
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_work_created ON works;
CREATE TRIGGER log_work_created
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_log_work_created();

-- Trigger to log work status changes
CREATE OR REPLACE FUNCTION trigger_log_work_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_work_activity(
      NEW.id,
      'status_change',
      'Status Changed',
      'Status changed from "' || OLD.status || '" to "' || NEW.status || '"',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_work_status_change ON works;
CREATE TRIGGER log_work_status_change
AFTER UPDATE ON works
FOR EACH ROW
EXECUTE FUNCTION trigger_log_work_status_change();

-- Trigger to log work assignments
CREATE OR REPLACE FUNCTION trigger_log_work_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_staff_name text;
BEGIN
  IF NEW.is_current = true THEN
    SELECT name INTO v_staff_name FROM staff_members WHERE id = NEW.staff_member_id;

    IF NEW.reassigned_from IS NULL THEN
      PERFORM log_work_activity(
        NEW.work_id,
        'assignment',
        'Work Assigned',
        'Work assigned to ' || v_staff_name,
        jsonb_build_object(
          'staff_id', NEW.staff_member_id,
          'staff_name', v_staff_name
        ),
        NEW.staff_member_id
      );
    ELSE
      PERFORM log_work_activity(
        NEW.work_id,
        'reassignment',
        'Work Reassigned',
        'Work reassigned to ' || v_staff_name || COALESCE('. Reason: ' || NEW.reassignment_reason, ''),
        jsonb_build_object(
          'staff_id', NEW.staff_member_id,
          'staff_name', v_staff_name,
          'reassigned_from', NEW.reassigned_from,
          'reason', NEW.reassignment_reason
        ),
        NEW.staff_member_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_work_assignment ON work_assignments;
CREATE TRIGGER log_work_assignment
AFTER INSERT ON work_assignments
FOR EACH ROW
EXECUTE FUNCTION trigger_log_work_assignment();

-- Trigger to log task creation
CREATE OR REPLACE FUNCTION trigger_log_task_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_work_activity(
    NEW.work_id,
    'task_created',
    'Task Added',
    'Task "' || NEW.title || '" was added',
    jsonb_build_object(
      'task_id', NEW.id,
      'task_title', NEW.title,
      'priority', NEW.priority
    ),
    NEW.assigned_to
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_task_created ON work_tasks;
CREATE TRIGGER log_task_created
AFTER INSERT ON work_tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_log_task_created();

-- Trigger to log task completion
CREATE OR REPLACE FUNCTION trigger_log_task_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    PERFORM log_work_activity(
      NEW.work_id,
      'task_completed',
      'Task Completed',
      'Task "' || NEW.title || '" was completed',
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title
      ),
      NEW.assigned_to
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_task_completed ON work_tasks;
CREATE TRIGGER log_task_completed
AFTER UPDATE ON work_tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_log_task_completed();

-- Trigger to log time entries
CREATE OR REPLACE FUNCTION trigger_log_time_logged()
RETURNS TRIGGER AS $$
DECLARE
  v_staff_name text;
BEGIN
  SELECT name INTO v_staff_name FROM staff_members WHERE id = NEW.staff_member_id;

  PERFORM log_work_activity(
    NEW.work_id,
    'time_logged',
    'Time Logged',
    v_staff_name || ' logged ' || COALESCE(NEW.duration_hours::text || ' hours', 'time'),
    jsonb_build_object(
      'staff_id', NEW.staff_member_id,
      'staff_name', v_staff_name,
      'duration_hours', NEW.duration_hours
    ),
    NEW.staff_member_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_time_logged ON time_logs;
CREATE TRIGGER log_time_logged
AFTER INSERT ON time_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_log_time_logged();

-- Trigger to log recurring period creation
CREATE OR REPLACE FUNCTION trigger_log_recurring_period_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_work_activity(
    NEW.work_id,
    'recurring_period_created',
    'Period Created',
    'Recurring period "' || NEW.period_name || '" was created',
    jsonb_build_object(
      'period_id', NEW.id,
      'period_name', NEW.period_name,
      'due_date', NEW.due_date
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_recurring_period_created ON work_recurring_instances;
CREATE TRIGGER log_recurring_period_created
AFTER INSERT ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION trigger_log_recurring_period_created();

-- Trigger to log recurring period completion
CREATE OR REPLACE FUNCTION trigger_log_recurring_period_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    PERFORM log_work_activity(
      NEW.work_id,
      'recurring_period_completed',
      'Period Completed',
      'Recurring period "' || NEW.period_name || '" was completed',
      jsonb_build_object(
        'period_id', NEW.id,
        'period_name', NEW.period_name,
        'billing_amount', NEW.billing_amount
      ),
      NEW.completed_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_recurring_period_completed ON work_recurring_instances;
CREATE TRIGGER log_recurring_period_completed
AFTER UPDATE ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION trigger_log_recurring_period_completed();

-- Trigger to log document collection
CREATE OR REPLACE FUNCTION trigger_log_document_collected()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_collected = false AND NEW.is_collected = true THEN
    PERFORM log_work_activity(
      NEW.work_id,
      'document_collected',
      'Document Collected',
      'Document "' || NEW.name || '" was collected',
      jsonb_build_object(
        'document_id', NEW.id,
        'document_name', NEW.name
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_document_collected ON work_documents;
CREATE TRIGGER log_document_collected
AFTER UPDATE ON work_documents
FOR EACH ROW
EXECUTE FUNCTION trigger_log_document_collected();

-- Function to auto-create period documents when recurring period is created
CREATE OR REPLACE FUNCTION auto_create_period_documents()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy all work documents to this period
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    notes
  )
  SELECT
    NEW.id,
    wd.id,
    false,
    'Auto-created for period: ' || NEW.period_name
  FROM work_documents wd
  WHERE wd.work_id = NEW.work_id
  ON CONFLICT (work_recurring_instance_id, work_document_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_period_documents_trigger ON work_recurring_instances;
CREATE TRIGGER auto_create_period_documents_trigger
AFTER INSERT ON work_recurring_instances
FOR EACH ROW
EXECUTE FUNCTION auto_create_period_documents();
