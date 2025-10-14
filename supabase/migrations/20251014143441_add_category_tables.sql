/*
  # Add Category Tables for Services and Works
  
  1. New Tables
    - `service_categories`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text, unique per user)
      - `description` (text, optional)
      - `color` (text, optional hex color)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `work_categories`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text, unique per user)
      - `description` (text, optional)
      - `color` (text, optional hex color)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own categories
  
  3. Notes
    - Categories provide better organization for services and works
    - Each user maintains their own set of categories
    - Color coding helps with visual identification
*/

-- Create service_categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Create work_categories table
CREATE TABLE IF NOT EXISTS work_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_categories ENABLE ROW LEVEL SECURITY;

-- Service Categories Policies
CREATE POLICY "Users can view own service categories"
  ON service_categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own service categories"
  ON service_categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own service categories"
  ON service_categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own service categories"
  ON service_categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Work Categories Policies
CREATE POLICY "Users can view own work categories"
  ON work_categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own work categories"
  ON work_categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work categories"
  ON work_categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own work categories"
  ON work_categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_categories_user_id ON service_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_work_categories_user_id ON work_categories(user_id);
