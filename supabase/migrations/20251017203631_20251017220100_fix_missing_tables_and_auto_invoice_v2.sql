/*
  # Fix Missing Tables and Auto-Invoice Trigger

  ## Overview
  This migration fixes critical issues:
  1. Creates missing work_communications and work_notes tables
  2. Fixes auto-invoice trigger to work with correct table name (work_recurring_instances)
  3. Adds overdue tracking columns to works table

  ## New Tables

  ### work_communications
  - Tracks all communications related to works (calls, emails, meetings)
  - Includes participant information and outcome tracking
  - Links to works table via work_id

  ### work_notes
  - General notes and observations about works
  - Supports categorization and importance levels
  - Timestamped for audit trail

  ## Modified Tables

  ### works
  - Adds `overdue_reason` field for tracking why work is overdue
  - Adds `overdue_marked_at` timestamp

  ## Functions & Triggers

  ### auto_invoice_on_period_completion
  - Fixed to use correct table name: work_recurring_instances
  - Automatically creates invoice when recurring period is marked as completed
  - Uses work billing_amount and auto_bill flag
  - Creates invoice items with proper tax calculation

  ## Security
  - All tables have RLS enabled
  - Policies ensure users can only access their own data
*/

-- Add overdue tracking to works table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'overdue_reason'
  ) THEN
    ALTER TABLE works ADD COLUMN overdue_reason TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'overdue_marked_at'
  ) THEN
    ALTER TABLE works ADD COLUMN overdue_marked_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create work_communications table
CREATE TABLE IF NOT EXISTS work_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  communication_type VARCHAR(50) NOT NULL DEFAULT 'note',
  subject TEXT NOT NULL,
  description TEXT,
  communication_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  participants TEXT,
  outcome TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_communication_type CHECK (
    communication_type IN ('call', 'email', 'meeting', 'message', 'note', 'other')
  )
);

-- Create work_notes table
CREATE TABLE IF NOT EXISTS work_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_important BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_note_type CHECK (
    note_type IN ('general', 'technical', 'client_feedback', 'internal', 'issue', 'reminder', 'other')
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_work_communications_work_id ON work_communications(work_id);
CREATE INDEX IF NOT EXISTS idx_work_communications_user_id ON work_communications(user_id);
CREATE INDEX IF NOT EXISTS idx_work_communications_date ON work_communications(communication_date DESC);
CREATE INDEX IF NOT EXISTS idx_work_notes_work_id ON work_notes(work_id);
CREATE INDEX IF NOT EXISTS idx_work_notes_user_id ON work_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_work_notes_important ON work_notes(is_important) WHERE is_important = true;

-- Enable RLS
ALTER TABLE work_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_communications
DROP POLICY IF EXISTS "Users can view own work communications" ON work_communications;
CREATE POLICY "Users can view own work communications"
  ON work_communications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own work communications" ON work_communications;
CREATE POLICY "Users can insert own work communications"
  ON work_communications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own work communications" ON work_communications;
CREATE POLICY "Users can update own work communications"
  ON work_communications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own work communications" ON work_communications;
CREATE POLICY "Users can delete own work communications"
  ON work_communications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for work_notes
DROP POLICY IF EXISTS "Users can view own work notes" ON work_notes;
CREATE POLICY "Users can view own work notes"
  ON work_notes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own work notes" ON work_notes;
CREATE POLICY "Users can insert own work notes"
  ON work_notes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own work notes" ON work_notes;
CREATE POLICY "Users can update own work notes"
  ON work_notes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own work notes" ON work_notes;
CREATE POLICY "Users can delete own work notes"
  ON work_notes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Function to auto-create invoice when recurring period is completed
CREATE OR REPLACE FUNCTION auto_invoice_on_period_completion()
RETURNS TRIGGER AS $$
DECLARE
  work_record RECORD;
  invoice_count INT;
  invoice_number VARCHAR(50);
  service_name TEXT;
  subtotal NUMERIC;
  tax_rate NUMERIC := 18;
  tax_amount NUMERIC;
  total_amount NUMERIC;
  new_invoice_id UUID;
  item_amount NUMERIC;
BEGIN
  -- Only proceed if status changed to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get the work details
    SELECT
      w.*,
      s.name as service_name
    INTO work_record
    FROM works w
    LEFT JOIN services s ON s.id = w.service_id
    WHERE w.id = NEW.work_id;

    -- Check if work has auto_bill enabled and billing amount
    IF work_record.auto_bill = true AND work_record.billing_amount IS NOT NULL AND work_record.billing_amount > 0 THEN

      -- Generate invoice number
      SELECT COUNT(*) INTO invoice_count
      FROM invoices
      WHERE user_id = work_record.user_id;

      invoice_number := 'INV-' || LPAD((invoice_count + 1)::TEXT, 4, '0');

      -- Calculate amounts (billing_amount is the base price before tax)
      subtotal := work_record.billing_amount;
      tax_amount := (subtotal * tax_rate) / 100;
      total_amount := subtotal + tax_amount;
      item_amount := subtotal;

      -- Create invoice
      INSERT INTO invoices (
        user_id,
        customer_id,
        work_id,
        invoice_number,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        total_amount,
        status,
        notes
      ) VALUES (
        work_record.user_id,
        work_record.customer_id,
        work_record.id,
        invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        subtotal,
        tax_amount,
        total_amount,
        'pending',
        'Auto-generated for completed recurring period: ' || NEW.period_name
      )
      RETURNING id INTO new_invoice_id;

      -- Create invoice item with tax_rate
      INSERT INTO invoice_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        amount,
        tax_rate
      ) VALUES (
        new_invoice_id,
        COALESCE(work_record.service_name, 'Service') || ' - ' || NEW.period_name,
        1,
        subtotal,
        item_amount,
        tax_rate
      );

      -- Update the period with invoice reference
      UPDATE work_recurring_instances
      SET 
        invoice_id = new_invoice_id,
        is_billed = true
      WHERE id = NEW.id;

    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists and create new one on correct table
DROP TRIGGER IF EXISTS trigger_auto_invoice_on_period_completion ON work_recurring_instances;

CREATE TRIGGER trigger_auto_invoice_on_period_completion
  AFTER UPDATE ON work_recurring_instances
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION auto_invoice_on_period_completion();
