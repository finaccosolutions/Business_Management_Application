/*
  # Complete Database Schema with Auto Invoice

  ## Overview
  Complete database setup with all tables, payment_terms column, and auto-invoice generation.

  ## Tables Created
  - All CRM tables (profiles, services, customers, works, invoices, etc.)
  - Added payment_terms to services table
  - Added auto_bill column to works table
  - Added company_settings table

  ## Triggers
  - Auto-generate invoice when work is completed (if auto_bill is enabled)

  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
*/

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (for fresh setup)
DROP TABLE IF EXISTS customer_documents CASCADE;
DROP TABLE IF EXISTS customer_notes CASCADE;
DROP TABLE IF EXISTS communications CASCADE;
DROP TABLE IF EXISTS reminders CASCADE;
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS time_logs CASCADE;
DROP TABLE IF EXISTS work_recurring_instances CASCADE;
DROP TABLE IF EXISTS work_assignments CASCADE;
DROP TABLE IF EXISTS work_tasks CASCADE;
DROP TABLE IF EXISTS works CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS company_settings CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  company_name text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- company_settings table
CREATE TABLE company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  pincode text,
  country text DEFAULT 'India',
  gstin text,
  pan text,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON company_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON company_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON company_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- services table (with payment_terms)
CREATE TABLE services (
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
  payment_terms text DEFAULT 'net_30',
  is_recurring boolean DEFAULT false,
  recurrence_type text,
  recurrence_day integer,
  recurrence_month integer,
  auto_generate_work boolean DEFAULT false,
  parent_service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own services" ON services FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own services" ON services FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own services" ON services FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own services" ON services FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- staff_members table
CREATE TABLE staff_members (
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
CREATE POLICY "Users can view own staff members" ON staff_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own staff members" ON staff_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own staff members" ON staff_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own staff members" ON staff_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- leads table
CREATE TABLE leads (
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
CREATE POLICY "Users can view own leads" ON leads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leads" ON leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leads" ON leads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own leads" ON leads FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customers table
CREATE TABLE customers (
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
CREATE POLICY "Users can view own customers" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customers" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customers" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customers" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- works table (with auto_bill column)
CREATE TABLE works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  parent_service_id uuid REFERENCES services(id) ON DELETE SET NULL,
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
  auto_bill boolean DEFAULT false,
  estimated_hours numeric(10, 2),
  actual_duration_hours numeric(10, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE works ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own works" ON works FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own works" ON works FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own works" ON works FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own works" ON works FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- work_tasks table
CREATE TABLE work_tasks (
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
CREATE TABLE work_assignments (
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
CREATE TABLE work_recurring_instances (
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
CREATE TABLE time_logs (
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
CREATE POLICY "Users can view own time logs" ON time_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time logs" ON time_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time logs" ON time_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own time logs" ON time_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoices table
CREATE TABLE invoices (
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
CREATE POLICY "Users can view own invoices" ON invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own invoices" ON invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own invoices" ON invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoice_items table
CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  quantity numeric(10, 2) DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL,
  amount numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
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
CREATE TABLE reminders (
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
CREATE POLICY "Users can view own reminders" ON reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reminders" ON reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders" ON reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- communications table
CREATE TABLE communications (
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
CREATE POLICY "Users can view own communications" ON communications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own communications" ON communications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own communications" ON communications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_notes table
CREATE TABLE customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notes" ON customer_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON customer_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON customer_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_documents table
CREATE TABLE customer_documents (
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
CREATE POLICY "Users can view own customer documents" ON customer_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customer documents" ON customer_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customer documents" ON customer_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_services_user_id ON services(user_id);
CREATE INDEX idx_staff_members_user_id ON staff_members(user_id);
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_works_user_id ON works(user_id);
CREATE INDEX idx_works_customer_id ON works(customer_id);
CREATE INDEX idx_works_service_id ON works(service_id);
CREATE INDEX idx_works_assigned_to ON works(assigned_to);
CREATE INDEX idx_work_tasks_work_id ON work_tasks(work_id);
CREATE INDEX idx_work_assignments_work_id ON work_assignments(work_id);
CREATE INDEX idx_work_recurring_instances_work_id ON work_recurring_instances(work_id);
CREATE INDEX idx_time_logs_work_id ON time_logs(work_id);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Auto-generate invoice function
CREATE OR REPLACE FUNCTION auto_generate_work_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_customer_id uuid;
  v_tax_rate numeric(5, 2);
  v_payment_terms text;
  v_subtotal numeric(10, 2);
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
BEGIN
  -- Only proceed if work is completed, auto_bill is enabled, and has billing amount
  IF NEW.status = 'completed' AND
     NEW.auto_bill = true AND
     NEW.billing_amount IS NOT NULL AND
     NEW.billing_amount > 0 AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get customer_id and service info
    v_customer_id := NEW.customer_id;

    SELECT COALESCE(payment_terms, 'net_30'), COALESCE(tax_rate, 0)
    INTO v_payment_terms, v_tax_rate
    FROM services
    WHERE id = NEW.service_id;

    -- Calculate amounts
    v_subtotal := NEW.billing_amount;
    v_tax_amount := ROUND(v_subtotal * (v_tax_rate / 100), 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Calculate due date
    IF v_payment_terms = 'net_15' THEN
      v_due_date := CURRENT_DATE + INTERVAL '15 days';
    ELSIF v_payment_terms = 'net_30' THEN
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    ELSIF v_payment_terms = 'net_45' THEN
      v_due_date := CURRENT_DATE + INTERVAL '45 days';
    ELSIF v_payment_terms = 'net_60' THEN
      v_due_date := CURRENT_DATE + INTERVAL '60 days';
    ELSIF v_payment_terms = 'due_on_receipt' THEN
      v_due_date := CURRENT_DATE;
    ELSE
      v_due_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    -- Generate invoice number
    v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8);

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
      status
    ) VALUES (
      NEW.user_id,
      v_customer_id,
      NEW.id,
      v_invoice_number,
      CURRENT_DATE,
      v_due_date,
      v_subtotal,
      v_tax_amount,
      v_total_amount,
      'draft'
    ) RETURNING id INTO v_invoice_id;

    -- Create invoice line item
    INSERT INTO invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      amount
    ) VALUES (
      v_invoice_id,
      'Work: ' || NEW.title,
      1,
      NEW.billing_amount,
      v_total_amount
    );

    -- Update work billing status
    UPDATE works
    SET billing_status = 'billed'
    WHERE id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_work_invoice ON works;
CREATE TRIGGER trigger_auto_generate_work_invoice
  AFTER INSERT OR UPDATE OF status ON works
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_work_invoice();
