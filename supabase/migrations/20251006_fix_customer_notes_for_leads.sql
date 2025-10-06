/*
  # Fix Customer Notes Table for Lead Support

  ## Overview
  This migration fixes the customer_notes table to properly support notes for both customers and leads.

  ## Changes Made

  1. **Add lead_id column** - Allow notes to be associated with leads
  2. **Make customer_id nullable** - Notes can be for either customers OR leads, not both
  3. **Add note column** - Simplified single text column for note content (backward compatible)
  4. **Update constraints** - Ensure either customer_id or lead_id is provided, not both

  ## Schema Changes
  - `lead_id` (uuid, nullable, references leads)
  - `customer_id` (uuid, nullable, modified to allow null)
  - `note` (text) - Main note content field
  - Check constraint to ensure exactly one of customer_id or lead_id is set

  ## Security
  - RLS policies updated to support lead-based notes
  - Users can only access their own notes

  ## Important Notes
  - Existing data preserved with backward compatibility
  - The 'content' column remains for backward compatibility
  - The 'note' column is the primary field going forward
*/

-- Add lead_id column to customer_notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_notes' AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE customer_notes ADD COLUMN lead_id uuid REFERENCES leads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add note column for simplified note content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_notes' AND column_name = 'note'
  ) THEN
    ALTER TABLE customer_notes ADD COLUMN note text;
  END IF;
END $$;

-- Make customer_id nullable
ALTER TABLE customer_notes ALTER COLUMN customer_id DROP NOT NULL;

-- Make title nullable (since we're using 'note' field primarily)
ALTER TABLE customer_notes ALTER COLUMN title DROP NOT NULL;

-- Make content nullable (since we're using 'note' field primarily)
ALTER TABLE customer_notes ALTER COLUMN content DROP NOT NULL;

-- Copy content to note column if note is null (migration for existing data)
UPDATE customer_notes
SET note = COALESCE(note, content, title)
WHERE note IS NULL;

-- Add check constraint to ensure either customer_id or lead_id is set (but not both)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_notes_check_entity'
  ) THEN
    ALTER TABLE customer_notes
    ADD CONSTRAINT customer_notes_check_entity
    CHECK (
      (customer_id IS NOT NULL AND lead_id IS NULL) OR
      (customer_id IS NULL AND lead_id IS NOT NULL)
    );
  END IF;
END $$;

-- Create index for lead_id lookups
CREATE INDEX IF NOT EXISTS idx_customer_notes_lead_id ON customer_notes(lead_id);

-- Drop existing overly specific RLS policies if they exist
DROP POLICY IF EXISTS "Users can view own lead notes" ON customer_notes;

-- Update the SELECT policy to handle both customers and leads
DROP POLICY IF EXISTS "Users can view own customer notes" ON customer_notes;
CREATE POLICY "Users can view own notes"
  ON customer_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
