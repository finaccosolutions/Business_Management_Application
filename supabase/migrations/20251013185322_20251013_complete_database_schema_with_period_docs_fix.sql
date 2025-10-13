/*
  # Complete Database Schema with Period Documents Fix
  
  ## Overview
  Complete database setup with all required tables, relationships, and the critical fix
  for recurring work period documents to prevent duplicate key violations.
  
  ## New Tables
  All core CRM tables including:
  - profiles, services, staff_members, leads, customers
  - works, work_tasks, work_assignments, work_recurring_instances
  - work_documents, work_recurring_period_documents
  - time_logs, invoices, reminders, communications, etc.
  
  ## Critical Fix
  The auto_create_period_documents trigger now includes ON CONFLICT DO NOTHING
  to prevent duplicate key violations when creating period documents.
  
  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
  - Restrictive policies on all operations
*/

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  company_name text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  service_code text,
  category text,
  description text,
  image_url text,
  estimated_duration_hours integer DEFAULT 0,
  estimated_duration_minutes integer DEFAULT 0,
  estimated_duration_value integer DEFAULT 0,
  estimated_duration_unit text DEFAULT 'days',
  default_price numeric(10, 2),
  tax_rate numeric(5, 2) DEFAULT 0,
  is_recurring boolean DEFAULT false,
  recurrence_type text,
  recurrence_day integer,
  recurrence_days integer[],
  recurrence_start_date date,
  recurrence_end_date date,
  advance_notice_days integer DEFAULT 3,
  auto_generate_work boolean DEFAULT true,
  status text DEFAULT 'active',
  custom_fields jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own services" ON services;
DROP POLICY IF EXISTS "Users can insert own services" ON services;
DROP POLICY IF EXISTS "Users can update own services" ON services;
DROP POLICY IF EXISTS "Users can delete own services" ON services;

CREATE POLICY "Users can view own services"
  ON services FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own services"
  ON services FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own services"
  ON services FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own services"
  ON services FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- staff_members table
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  department text,
  hourly_rate numeric(10, 2),
  is_active boolean DEFAULT true,
  joined_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own staff" ON staff_members;
DROP POLICY IF EXISTS "Users can insert own staff" ON staff_members;
DROP POLICY IF EXISTS "Users can update own staff" ON staff_members;
DROP POLICY IF EXISTS "Users can delete own staff" ON staff_members;

CREATE POLICY "Users can view own staff"
  ON staff_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own staff"
  ON staff_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own staff"
  ON staff_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own staff"
  ON staff_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- leads table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  source text,
  status text DEFAULT 'new',
  priority text DEFAULT 'medium',
  assigned_to uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  estimated_value numeric(10, 2),
  probability integer,
  expected_close_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own leads" ON leads;
DROP POLICY IF EXISTS "Users can insert own leads" ON leads;
DROP POLICY IF EXISTS "Users can update own leads" ON leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON leads;

CREATE POLICY "Users can view own leads"
  ON leads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own leads"
  ON leads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'India',
  gstin text,
  pan text,
  status text DEFAULT 'active',
  billing_address text,
  shipping_address text,
  payment_terms text,
  credit_limit numeric(10, 2),
  notes text,
  custom_fields jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own customers" ON customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers;
DROP POLICY IF EXISTS "Users can update own customers" ON customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers;

CREATE POLICY "Users can view own customers"
  ON customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own customers"
  ON customers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- works table
CREATE TABLE IF NOT EXISTS works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  due_date date,
  start_date date,
  completion_date timestamptz,
  assigned_date timestamptz,
  estimated_hours numeric(10, 2),
  actual_duration_hours numeric(10, 2),
  billing_status text DEFAULT 'not_billed',
  billing_amount numeric(10, 2),
  is_recurring boolean DEFAULT false,
  recurrence_pattern text,
  recurrence_day integer,
  auto_bill boolean DEFAULT true,
  work_location text,
  department text,
  requirements text,
  deliverables text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own works" ON works;
DROP POLICY IF EXISTS "Users can insert own works" ON works;
DROP POLICY IF EXISTS "Users can update own works" ON works;
DROP POLICY IF EXISTS "Users can delete own works" ON works;

CREATE POLICY "Users can view own works"
  ON works FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own works"
  ON works FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own works"
  ON works FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own works"
  ON works FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- work_documents table
CREATE TABLE IF NOT EXISTS work_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  is_required boolean DEFAULT false,
  is_collected boolean DEFAULT false,
  collected_at timestamptz,
  collected_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  file_url text,
  file_size integer,
  uploaded_at timestamptz,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work documents" ON work_documents;
DROP POLICY IF EXISTS "Users can insert work documents" ON work_documents;
DROP POLICY IF EXISTS "Users can update work documents" ON work_documents;
DROP POLICY IF EXISTS "Users can delete work documents" ON work_documents;

CREATE POLICY "Users can view work documents"
  ON work_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert work documents"
  ON work_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update work documents"
  ON work_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete work documents"
  ON work_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- work_recurring_instances table
CREATE TABLE IF NOT EXISTS work_recurring_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  period_name text NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'pending',
  completed_at timestamptz,
  completed_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  billing_amount numeric(10, 2),
  is_billed boolean DEFAULT false,
  invoice_id uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_recurring_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can insert recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can update recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can delete recurring instances" ON work_recurring_instances;

CREATE POLICY "Users can view recurring instances"
  ON work_recurring_instances FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_recurring_instances.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert recurring instances"
  ON work_recurring_instances FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_recurring_instances.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update recurring instances"
  ON work_recurring_instances FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_recurring_instances.work_id
    AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_recurring_instances.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete recurring instances"
  ON work_recurring_instances FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_recurring_instances.work_id
    AND w.user_id = auth.uid()
  ));

-- work_recurring_period_documents table
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

ALTER TABLE work_recurring_period_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view period documents" ON work_recurring_period_documents;
DROP POLICY IF EXISTS "Users can insert period documents" ON work_recurring_period_documents;
DROP POLICY IF EXISTS "Users can update period documents" ON work_recurring_period_documents;
DROP POLICY IF EXISTS "Users can delete period documents" ON work_recurring_period_documents;

CREATE POLICY "Users can view period documents"
  ON work_recurring_period_documents FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_recurring_instances wri
    JOIN works w ON w.id = wri.work_id
    WHERE wri.id = work_recurring_period_documents.work_recurring_instance_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert period documents"
  ON work_recurring_period_documents FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_recurring_instances wri
    JOIN works w ON w.id = wri.work_id
    WHERE wri.id = work_recurring_period_documents.work_recurring_instance_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update period documents"
  ON work_recurring_period_documents FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_recurring_instances wri
    JOIN works w ON w.id = wri.work_id
    WHERE wri.id = work_recurring_period_documents.work_recurring_instance_id
    AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_recurring_instances wri
    JOIN works w ON w.id = wri.work_id
    WHERE wri.id = work_recurring_period_documents.work_recurring_instance_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete period documents"
  ON work_recurring_period_documents FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_recurring_instances wri
    JOIN works w ON w.id = wri.work_id
    WHERE wri.id = work_recurring_period_documents.work_recurring_instance_id
    AND w.user_id = auth.uid()
  ));

-- work_tasks table
CREATE TABLE IF NOT EXISTS work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  estimated_hours numeric(10, 2),
  actual_hours numeric(10, 2),
  due_date date,
  completed_at timestamptz,
  remarks text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can insert work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can update work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can delete work tasks" ON work_tasks;

CREATE POLICY "Users can view work tasks"
  ON work_tasks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_tasks.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert work tasks"
  ON work_tasks FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_tasks.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update work tasks"
  ON work_tasks FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_tasks.work_id
    AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_tasks.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete work tasks"
  ON work_tasks FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_tasks.work_id
    AND w.user_id = auth.uid()
  ));

-- work_assignments table
CREATE TABLE IF NOT EXISTS work_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE CASCADE NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users ON DELETE SET NULL,
  unassigned_at timestamptz,
  reassigned_from uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  reassignment_reason text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE work_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can insert work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can update work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can delete work assignments" ON work_assignments;

CREATE POLICY "Users can view work assignments"
  ON work_assignments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_assignments.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert work assignments"
  ON work_assignments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_assignments.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update work assignments"
  ON work_assignments FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_assignments.work_id
    AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_assignments.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete work assignments"
  ON work_assignments FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = work_assignments.work_id
    AND w.user_id = auth.uid()
  ));

-- time_logs table
CREATE TABLE IF NOT EXISTS time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE CASCADE NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_hours numeric(10, 2),
  description text,
  is_billable boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can insert time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can update time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can delete time logs" ON time_logs;

CREATE POLICY "Users can view time logs"
  ON time_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = time_logs.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert time logs"
  ON time_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = time_logs.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update time logs"
  ON time_logs FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = time_logs.work_id
    AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = time_logs.work_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete time logs"
  ON time_logs FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM works w
    WHERE w.id = time_logs.work_id
    AND w.user_id = auth.uid()
  ));

-- invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  invoice_number text UNIQUE NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  subtotal numeric(10, 2) DEFAULT 0,
  tax_amount numeric(10, 2) DEFAULT 0,
  total_amount numeric(10, 2) DEFAULT 0,
  status text DEFAULT 'draft',
  notes text,
  terms text,
  payment_instructions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON invoices;

CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  quantity numeric(10, 2) DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL,
  tax_rate numeric(5, 2) DEFAULT 0,
  amount numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can insert invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can update invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can delete invoice items" ON invoice_items;

CREATE POLICY "Users can view invoice items"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert invoice items"
  ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.user_id = auth.uid()
  ));

CREATE POLICY "Users can update invoice items"
  ON invoice_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete invoice items"
  ON invoice_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.user_id = auth.uid()
  ));

-- reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  reminder_date timestamptz NOT NULL,
  is_completed boolean DEFAULT false,
  related_type text,
  related_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON reminders;

CREATE POLICY "Users can view own reminders"
  ON reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
  ON reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
  ON reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- communications table
CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  type text NOT NULL,
  subject text,
  content text,
  direction text,
  status text DEFAULT 'completed',
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own communications" ON communications;
DROP POLICY IF EXISTS "Users can insert own communications" ON communications;
DROP POLICY IF EXISTS "Users can update own communications" ON communications;
DROP POLICY IF EXISTS "Users can delete own communications" ON communications;

CREATE POLICY "Users can view own communications"
  ON communications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own communications"
  ON communications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own communications"
  ON communications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own communications"
  ON communications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- customer_notes table
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  note text NOT NULL,
  created_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view customer notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can insert customer notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can update customer notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can delete customer notes" ON customer_notes;

CREATE POLICY "Users can view customer notes"
  ON customer_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert customer notes"
  ON customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update customer notes"
  ON customer_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete customer notes"
  ON customer_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- customer_documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  title text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  uploaded_by uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can insert customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can update customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can delete customer documents" ON customer_documents;

CREATE POLICY "Users can view customer documents"
  ON customer_documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert customer documents"
  ON customer_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update customer documents"
  ON customer_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete customer documents"
  ON customer_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- CRITICAL: Function to auto-create period documents with duplicate prevention
DROP FUNCTION IF EXISTS auto_create_period_documents() CASCADE;

CREATE OR REPLACE FUNCTION auto_create_period_documents()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy all work documents to this period
  -- ON CONFLICT DO NOTHING prevents duplicate key violations
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

-- Create trigger to auto-copy documents when period is created
DROP TRIGGER IF EXISTS auto_create_period_documents_trigger ON work_recurring_instances;

CREATE TRIGGER auto_create_period_documents_trigger
  AFTER INSERT ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_period_documents();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id);
CREATE INDEX IF NOT EXISTS idx_works_customer_id ON works(customer_id);
CREATE INDEX IF NOT EXISTS idx_works_service_id ON works(service_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_work_tasks_work_id ON work_tasks(work_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON work_assignments(work_id);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_work_id ON work_recurring_instances(work_id);
CREATE INDEX IF NOT EXISTS idx_work_documents_work_id ON work_documents(work_id);
CREATE INDEX IF NOT EXISTS idx_period_docs_instance_id ON work_recurring_period_documents(work_recurring_instance_id);
CREATE INDEX IF NOT EXISTS idx_period_docs_document_id ON work_recurring_period_documents(work_document_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_work_id ON time_logs(work_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_communications_user_id ON communications(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_user_id ON customer_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_user_id ON customer_documents(user_id);
