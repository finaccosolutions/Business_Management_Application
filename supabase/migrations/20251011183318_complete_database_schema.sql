/*
  # Complete Database Setup
  
  ## Overview
  Complete database setup with all required tables and relationships for the CRM system.
  
  ## New Tables
  1. profiles - User profile data
  2. services - Service management with recurring support
  3. staff_members - Staff/employee management
  4. leads - Lead tracking and management
  5. customers - Customer records
  6. works - Work/project management
  7. work_tasks - Tasks within works
  8. work_assignments - Staff assignment history
  9. work_recurring_instances - Recurring work period tracking
  10. time_logs - Time tracking
  11. invoices - Invoice management
  12. invoice_items - Line items for invoices
  13. reminders - System reminders
  14. communications - Customer/lead communications
  15. customer_notes - Notes for customers/leads
  16. customer_documents - Document storage
  
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

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  service_code text,
  category text,
  description text,
  image_url text,
  estimated_duration_value integer DEFAULT 0,
  estimated_duration_unit text DEFAULT 'days',
  default_price numeric(10, 2),
  tax_rate numeric(5, 2) DEFAULT 0,
  is_recurring boolean DEFAULT false,
  recurrence_type text,
  recurrence_day integer,
  recurrence_month integer,
  auto_generate_work boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own services" ON services;
DROP POLICY IF EXISTS "Users can insert own services" ON services;
DROP POLICY IF EXISTS "Users can update own services" ON services;
DROP POLICY IF EXISTS "Users can delete own services" ON services;

CREATE POLICY "Users can view own services" ON services FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own services" ON services FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own services" ON services FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own services" ON services FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- staff_members table
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'staff',
  is_active boolean DEFAULT true,
  availability_status text DEFAULT 'available',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own staff members" ON staff_members;
DROP POLICY IF EXISTS "Users can insert own staff members" ON staff_members;
DROP POLICY IF EXISTS "Users can update own staff members" ON staff_members;
DROP POLICY IF EXISTS "Users can delete own staff members" ON staff_members;

CREATE POLICY "Users can view own staff members" ON staff_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own staff members" ON staff_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own staff members" ON staff_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own staff members" ON staff_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- leads table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  status text DEFAULT 'new',
  source text,
  notes text,
  converted_to_customer_id uuid,
  converted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own leads" ON leads;
DROP POLICY IF EXISTS "Users can insert own leads" ON leads;
DROP POLICY IF EXISTS "Users can update own leads" ON leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON leads;

CREATE POLICY "Users can view own leads" ON leads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leads" ON leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leads" ON leads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own leads" ON leads FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  address text,
  city text,
  state text,
  pincode text,
  country text DEFAULT 'India',
  gstin text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own customers" ON customers;
DROP POLICY IF EXISTS "Users can insert own customers" ON customers;
DROP POLICY IF EXISTS "Users can update own customers" ON customers;
DROP POLICY IF EXISTS "Users can delete own customers" ON customers;

CREATE POLICY "Users can view own customers" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customers" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customers" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customers" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- works table
CREATE TABLE IF NOT EXISTS works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  assigned_to uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  assigned_date timestamptz,
  start_date date,
  due_date date,
  completion_date timestamptz,
  is_recurring boolean DEFAULT false,
  recurrence_pattern text,
  recurrence_day integer,
  billing_status text DEFAULT 'not_billed',
  billing_amount numeric(10, 2),
  estimated_hours numeric(10, 2),
  actual_duration_hours numeric(10, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own works" ON works;
DROP POLICY IF EXISTS "Users can insert own works" ON works;
DROP POLICY IF EXISTS "Users can update own works" ON works;
DROP POLICY IF EXISTS "Users can delete own works" ON works;

CREATE POLICY "Users can view own works" ON works FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own works" ON works FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own works" ON works FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own works" ON works FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- work_tasks table
CREATE TABLE IF NOT EXISTS work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  due_date date,
  estimated_hours numeric(10, 2),
  actual_hours numeric(10, 2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can insert work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can update work tasks" ON work_tasks;
DROP POLICY IF EXISTS "Users can delete work tasks" ON work_tasks;

CREATE POLICY "Users can view work tasks" ON work_tasks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can insert work tasks" ON work_tasks FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can update work tasks" ON work_tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid()));
CREATE POLICY "Users can delete work tasks" ON work_tasks FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_tasks.work_id AND works.user_id = auth.uid())
);

-- work_assignments table
CREATE TABLE IF NOT EXISTS work_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  reassigned_from uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  reassignment_reason text,
  status text DEFAULT 'assigned',
  is_current boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE work_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can insert work assignments" ON work_assignments;
DROP POLICY IF EXISTS "Users can update work assignments" ON work_assignments;

CREATE POLICY "Users can view work assignments" ON work_assignments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can insert work assignments" ON work_assignments FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can update work assignments" ON work_assignments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM works WHERE works.id = work_assignments.work_id AND works.user_id = auth.uid()));

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

DROP POLICY IF EXISTS "Users can view work recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can insert work recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can update work recurring instances" ON work_recurring_instances;
DROP POLICY IF EXISTS "Users can delete work recurring instances" ON work_recurring_instances;

CREATE POLICY "Users can view work recurring instances" ON work_recurring_instances FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can insert work recurring instances" ON work_recurring_instances FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid())
);
CREATE POLICY "Users can update work recurring instances" ON work_recurring_instances FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid()));
CREATE POLICY "Users can delete work recurring instances" ON work_recurring_instances FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM works WHERE works.id = work_recurring_instances.work_id AND works.user_id = auth.uid())
);

-- time_logs table
CREATE TABLE IF NOT EXISTS time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  work_id uuid REFERENCES works(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS "Users can view own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can insert own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can update own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can delete own time logs" ON time_logs;

CREATE POLICY "Users can view own time logs" ON time_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time logs" ON time_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time logs" ON time_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own time logs" ON time_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  work_id uuid REFERENCES works(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  subtotal numeric(10, 2) DEFAULT 0,
  tax_amount numeric(10, 2) DEFAULT 0,
  total_amount numeric(10, 2) DEFAULT 0,
  status text DEFAULT 'draft',
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON invoices;

CREATE POLICY "Users can view own invoices" ON invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own invoices" ON invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own invoices" ON invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  quantity numeric(10, 2) DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL,
  amount numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can insert own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can update own invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can delete own invoice items" ON invoice_items;

CREATE POLICY "Users can view own invoice items" ON invoice_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
);
CREATE POLICY "Users can insert own invoice items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
);
CREATE POLICY "Users can update own invoice items" ON invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));
CREATE POLICY "Users can delete own invoice items" ON invoice_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
);

-- reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  work_id uuid REFERENCES works(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  reminder_date timestamptz NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON reminders;

CREATE POLICY "Users can view own reminders" ON reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reminders" ON reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders" ON reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- communications table
CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  subject text,
  message text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own communications" ON communications;
DROP POLICY IF EXISTS "Users can insert own communications" ON communications;
DROP POLICY IF EXISTS "Users can delete own communications" ON communications;

CREATE POLICY "Users can view own communications" ON communications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own communications" ON communications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own communications" ON communications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_notes table
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON customer_notes;

CREATE POLICY "Users can view own notes" ON customer_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON customer_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON customer_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can insert own customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can delete own customer documents" ON customer_documents;

CREATE POLICY "Users can view own customer documents" ON customer_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customer documents" ON customer_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customer documents" ON customer_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_user_id ON staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id);
CREATE INDEX IF NOT EXISTS idx_works_customer_id ON works(customer_id);
CREATE INDEX IF NOT EXISTS idx_works_service_id ON works(service_id);
CREATE INDEX IF NOT EXISTS idx_works_assigned_to ON works(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_tasks_work_id ON work_tasks(work_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON work_assignments(work_id);
CREATE INDEX IF NOT EXISTS idx_work_recurring_instances_work_id ON work_recurring_instances(work_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_work_id ON time_logs(work_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);