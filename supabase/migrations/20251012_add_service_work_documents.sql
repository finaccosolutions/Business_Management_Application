/*
  # Add Service and Work Documents

  ## Summary
  This migration adds document management capabilities for services and works, with automatic copying
  of required documents from services to works.

  ## Changes Made

  ### 1. New Tables

  #### service_documents
  - `id` (uuid, primary key) - Unique identifier
  - `service_id` (uuid, foreign key) - References services table
  - `user_id` (uuid, foreign key) - References auth.users
  - `name` (text) - Document name
  - `description` (text, nullable) - Document description
  - `category` (text, default 'general') - Document category
  - `is_required` (boolean, default false) - Whether document is required
  - `sort_order` (integer, default 0) - Display order
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  #### work_documents
  - `id` (uuid, primary key) - Unique identifier
  - `work_id` (uuid, foreign key) - References works table
  - `user_id` (uuid, foreign key) - References auth.users
  - `name` (text) - Document name
  - `description` (text, nullable) - Document description
  - `category` (text, default 'general') - Document category
  - `is_required` (boolean, default false) - Whether document is required
  - `is_collected` (boolean, default false) - Whether document is collected
  - `file_url` (text, nullable) - Uploaded file URL
  - `file_type` (text, nullable) - File MIME type
  - `file_size` (bigint, nullable) - File size in bytes
  - `collected_at` (timestamptz, nullable) - Collection timestamp
  - `uploaded_at` (timestamptz, nullable) - Upload timestamp
  - `sort_order` (integer, default 0) - Display order
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. Security
  - RLS enabled on both tables
  - Policies for authenticated users to manage their own documents
  - Read, insert, update, and delete policies

  ### 3. Triggers
  - Auto-copy service documents to work documents when work is created
  - Timestamp triggers for updated_at columns

  ## Notes
  - Documents are categorized for better organization
  - Required documents can be marked for compliance tracking
  - Work documents track collection and upload status
  - Service documents serve as templates for work documents
*/

-- Create service_documents table
CREATE TABLE IF NOT EXISTS service_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create work_documents table
CREATE TABLE IF NOT EXISTS work_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  is_required boolean DEFAULT false,
  is_collected boolean DEFAULT false,
  file_url text,
  file_type text,
  file_size bigint,
  collected_at timestamptz,
  uploaded_at timestamptz,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE service_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_documents ENABLE ROW LEVEL SECURITY;

-- Service Documents Policies
CREATE POLICY "Users can view own service documents"
  ON service_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own service documents"
  ON service_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own service documents"
  ON service_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own service documents"
  ON service_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Work Documents Policies
CREATE POLICY "Users can view own work documents"
  ON work_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own work documents"
  ON work_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work documents"
  ON work_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own work documents"
  ON work_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_documents_service_id ON service_documents(service_id);
CREATE INDEX IF NOT EXISTS idx_service_documents_user_id ON service_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_work_documents_work_id ON work_documents(work_id);
CREATE INDEX IF NOT EXISTS idx_work_documents_user_id ON work_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_work_documents_is_collected ON work_documents(is_collected);

-- Create trigger to update updated_at timestamp for service_documents
CREATE OR REPLACE FUNCTION update_service_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_service_documents_updated_at
  BEFORE UPDATE ON service_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_service_documents_updated_at();

-- Create trigger to update updated_at timestamp for work_documents
CREATE OR REPLACE FUNCTION update_work_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();

  -- Auto-set collected_at and uploaded_at when status changes
  IF NEW.is_collected = true AND OLD.is_collected = false THEN
    NEW.collected_at = now();
  END IF;

  IF NEW.file_url IS NOT NULL AND OLD.file_url IS NULL THEN
    NEW.uploaded_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_work_documents_updated_at
  BEFORE UPDATE ON work_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_work_documents_updated_at();

-- Create function to copy service documents to work documents
CREATE OR REPLACE FUNCTION copy_service_documents_to_work()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy service documents to work documents when a new work is created
  INSERT INTO work_documents (
    work_id,
    user_id,
    name,
    description,
    category,
    is_required,
    sort_order
  )
  SELECT
    NEW.id,
    NEW.user_id,
    sd.name,
    sd.description,
    sd.category,
    sd.is_required,
    sd.sort_order
  FROM service_documents sd
  WHERE sd.service_id = NEW.service_id
  ORDER BY sd.sort_order;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-copy service documents when work is created
CREATE TRIGGER trigger_copy_service_documents_to_work
  AFTER INSERT ON works
  FOR EACH ROW
  EXECUTE FUNCTION copy_service_documents_to_work();
