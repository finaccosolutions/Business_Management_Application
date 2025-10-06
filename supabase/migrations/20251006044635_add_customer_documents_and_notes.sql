/*
  # Add Customer Documents and Notes Tables

  ## Overview
  Adding support for document management and notes for customers to enhance
  the customer detail page functionality.

  ## New Tables

  ### 1. customer_documents
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `customer_id` (uuid, references customers)
  - `name` (text) - Original filename
  - `file_url` (text) - URL to the stored file
  - `file_type` (text) - MIME type
  - `file_size` (bigint) - Size in bytes
  - `category` (text) - Document category (contract, invoice, report, etc.)
  - `description` (text) - Optional description
  - `uploaded_at` (timestamptz)
  - `created_at` (timestamptz)

  ### 2. customer_notes
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `customer_id` (uuid, references customers)
  - `title` (text) - Note title
  - `content` (text) - Note content
  - `is_pinned` (boolean) - Pin important notes
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. customer_activities
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles)
  - `customer_id` (uuid, references customers)
  - `activity_type` (text) - Type of activity
  - `activity_title` (text) - Activity title
  - `activity_description` (text) - Activity description
  - `metadata` (jsonb) - Additional data
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all new tables
  - Users can only access their own data
  - Restrictive policies for all operations

  ## Indexes
  - Added for user_id, customer_id for better query performance
*/

-- Create customer_documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text DEFAULT 'general',
  description text,
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own customer documents"
  ON customer_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customer documents"
  ON customer_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customer documents"
  ON customer_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customer documents"
  ON customer_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create customer_notes table
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own customer notes"
  ON customer_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customer notes"
  ON customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customer notes"
  ON customer_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customer notes"
  ON customer_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create customer_activities table
CREATE TABLE IF NOT EXISTS customer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL,
  activity_title text NOT NULL,
  activity_description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own customer activities"
  ON customer_activities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customer activities"
  ON customer_activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customer activities"
  ON customer_activities FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customer_documents_user_id ON customer_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_category ON customer_documents(category);

CREATE INDEX IF NOT EXISTS idx_customer_notes_user_id ON customer_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_is_pinned ON customer_notes(is_pinned);

CREATE INDEX IF NOT EXISTS idx_customer_activities_user_id ON customer_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id ON customer_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_type ON customer_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_customer_activities_created_at ON customer_activities(created_at DESC);
