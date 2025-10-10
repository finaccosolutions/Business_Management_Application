/*
  # Complete Database Setup with Service Improvements

  ## Overview
  Complete database schema including:
  - All core tables (profiles, services, leads, customers, etc.)
  - Service enhancements: auto-generated codes and improved duration tracking
  - Full RLS policies and indexes

  ## Key Features
  1. Auto-Generated Service Codes (SRV-001, SRV-002, etc.)
  2. Simplified Duration Tracking (value + unit instead of hours/minutes)
  3. Complete service management with recurring support
  4. Customer and lead management with notes and communications
  5. Work tracking and invoice management

  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
  - Restrictive policies on all operations
*/

-- Enable required extensions
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

-- services table with enhanced fields
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
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
  recurrence_month integer,
  recurrence_start_date date,
  recurrence_end_date date,
  advance_notice_days integer DEFAULT 3,
  auto_generate_work boolean DEFAULT false,
  status text DEFAULT 'active',
  custom_fields jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT services_user_service_code_unique UNIQUE (user_id, service_code)
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
  referred_by text,
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

-- lead_services table
CREATE TABLE IF NOT EXISTS lead_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view lead services" ON lead_services;
DROP POLICY IF EXISTS "Users can insert lead services" ON lead_services;
DROP POLICY IF EXISTS "Users can delete lead services" ON lead_services;

CREATE POLICY "Users can view lead services" ON lead_services FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_services.lead_id AND leads.user_id = auth.uid())
);
CREATE POLICY "Users can insert lead services" ON lead_services FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_services.lead_id AND leads.user_id = auth.uid())
);
CREATE POLICY "Users can delete lead services" ON lead_services FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_services.lead_id AND leads.user_id = auth.uid())
);

-- lead_followups table
CREATE TABLE IF NOT EXISTS lead_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  followup_date date NOT NULL,
  followup_time time,
  followup_type text NOT NULL,
  remarks text,
  status text DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own lead followups" ON lead_followups;
DROP POLICY IF EXISTS "Users can insert own lead followups" ON lead_followups;
DROP POLICY IF EXISTS "Users can update own lead followups" ON lead_followups;
DROP POLICY IF EXISTS "Users can delete own lead followups" ON lead_followups;

CREATE POLICY "Users can view own lead followups" ON lead_followups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lead followups" ON lead_followups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lead followups" ON lead_followups FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own lead followups" ON lead_followups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  address text,
  city text,
  state text,
  pincode text,
  country text DEFAULT 'India',
  image_url text,
  contact_person text,
  designation text,
  alternate_phone text,
  website text,
  gstin text,
  pan_number text,
  bank_name text,
  bank_account_number text,
  bank_ifsc_code text,
  bank_branch text,
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

-- staff table
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own staff" ON staff;
DROP POLICY IF EXISTS "Users can insert own staff" ON staff;
DROP POLICY IF EXISTS "Users can update own staff" ON staff;
DROP POLICY IF EXISTS "Users can delete own staff" ON staff;

CREATE POLICY "Users can view own staff" ON staff FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own staff" ON staff FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own staff" ON staff FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own staff" ON staff FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_services table
CREATE TABLE IF NOT EXISTS customer_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  price numeric(10, 2) NOT NULL,
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customer_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own customer services" ON customer_services;
DROP POLICY IF EXISTS "Users can insert own customer services" ON customer_services;
DROP POLICY IF EXISTS "Users can update own customer services" ON customer_services;
DROP POLICY IF EXISTS "Users can delete own customer services" ON customer_services;

CREATE POLICY "Users can view own customer services" ON customer_services FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customer services" ON customer_services FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customer services" ON customer_services FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customer services" ON customer_services FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- works table
CREATE TABLE IF NOT EXISTS works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  customer_service_id uuid REFERENCES customer_services(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  priority text DEFAULT 'medium',
  assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL,
  start_date date,
  due_date date,
  completed_at timestamptz,
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
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, invoice_number)
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
  created_at timestamptz DEFAULT now(),
  CONSTRAINT communications_has_reference CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL)
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own communications" ON communications;
DROP POLICY IF EXISTS "Users can insert own communications" ON communications;
DROP POLICY IF EXISTS "Users can update own communications" ON communications;
DROP POLICY IF EXISTS "Users can delete own communications" ON communications;

CREATE POLICY "Users can view own communications" ON communications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own communications" ON communications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own communications" ON communications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own communications" ON communications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_notes table
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT customer_notes_has_reference CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL)
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can update own notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON customer_notes;

CREATE POLICY "Users can view own notes" ON customer_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON customer_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON customer_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
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
  category text DEFAULT 'general',
  description text,
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can insert own customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can update own customer documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can delete own customer documents" ON customer_documents;

CREATE POLICY "Users can view own customer documents" ON customer_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customer documents" ON customer_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customer documents" ON customer_documents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customer documents" ON customer_documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customer_activities table
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

DROP POLICY IF EXISTS "Users can view own customer activities" ON customer_activities;
DROP POLICY IF EXISTS "Users can insert own customer activities" ON customer_activities;
DROP POLICY IF EXISTS "Users can delete own customer activities" ON customer_activities;

CREATE POLICY "Users can view own customer activities" ON customer_activities FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customer activities" ON customer_activities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own customer activities" ON customer_activities FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create function to generate next service code per user
CREATE OR REPLACE FUNCTION generate_service_code()
RETURNS text AS $$
DECLARE
  next_number integer;
  next_code text;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  SELECT COALESCE(
    MAX(
      CASE 
        WHEN service_code ~ '^SRV-[0-9]+$' 
        THEN CAST(SUBSTRING(service_code FROM 5) AS integer)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO next_number
  FROM services
  WHERE user_id = current_user_id;
  
  next_code := 'SRV-' || LPAD(next_number::text, 3, '0');
  
  RETURN next_code;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Create trigger function to auto-assign service code
CREATE OR REPLACE FUNCTION auto_assign_service_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.service_code IS NULL OR TRIM(NEW.service_code) = '' THEN
    NEW.service_code := generate_service_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Create trigger
DROP TRIGGER IF EXISTS set_service_code ON services;
CREATE TRIGGER set_service_code
  BEFORE INSERT ON services
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_service_code();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_service_code ON services(user_id, service_code);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_lead_services_lead_id ON lead_services(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_services_service_id ON lead_services(service_id);
CREATE INDEX IF NOT EXISTS idx_lead_followups_user_id ON lead_followups(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_followups_lead_id ON lead_followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_followups_status ON lead_followups(status);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_services_user_id ON customer_services(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_services_customer_id ON customer_services(customer_id);
CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_due_date ON works(due_date);
CREATE INDEX IF NOT EXISTS idx_works_assigned_to ON works(assigned_to);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_is_read ON reminders(is_read);
CREATE INDEX IF NOT EXISTS idx_communications_user_id ON communications(user_id);
CREATE INDEX IF NOT EXISTS idx_communications_customer_id ON communications(customer_id);
CREATE INDEX IF NOT EXISTS idx_communications_lead_id ON communications(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_user_id ON customer_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_lead_id ON customer_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_user_id ON customer_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_user_id ON customer_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id ON customer_activities(customer_id);