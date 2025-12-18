-- Function to check staff permission
CREATE OR REPLACE FUNCTION public.check_staff_permission(
  requested_module text,
  requested_action text
) RETURNS boolean AS $$
DECLARE
  v_role text;
  v_perms jsonb;
  v_user_id uuid;
  v_is_owner boolean;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user is an Admin/Owner in profiles
  SELECT (owner_id IS NULL OR role = 'admin') INTO v_is_owner
  FROM profiles
  WHERE id = v_user_id;
  
  IF v_is_owner THEN
    RETURN true;
  END IF;

  -- Get role and permissions from staff_members
  SELECT role, detailed_permissions INTO v_role, v_perms
  FROM staff_members
  WHERE auth_user_id = v_user_id;

  -- If Staff, check detailed_permissions
  IF v_role = 'staff' THEN
    -- If detailed_permissions is null, default to false (restrictive)
    IF v_perms IS NULL THEN
      RETURN false;
    END IF;
    
    -- Check specific key
    -- precise path: detailed_permissions -> module -> action
    -- We assume the JSON structure matches { "works": { "delete": true } }
    IF (v_perms -> requested_module ->> requested_action)::boolean IS TRUE THEN
       RETURN true;
    END IF;
    
    RETURN false;
  END IF;

  -- Fallback
  RETURN false; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on tables where it might be missing or verify it
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- WORKS POLICIES
-- DELETE
DROP POLICY IF EXISTS "Staff delete works" ON works;
CREATE POLICY "Staff delete works" ON works
FOR DELETE
USING (
  check_staff_permission('works', 'delete')
);

-- UPDATE
-- Staff can update if they have 'edit' permission OR if they are assigned to the work
DROP POLICY IF EXISTS "Staff update works" ON works;
CREATE POLICY "Staff update works" ON works
FOR UPDATE
USING (
  check_staff_permission('works', 'edit')
  OR
  assigned_to IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
);

-- INSERT
DROP POLICY IF EXISTS "Staff create works" ON works;
CREATE POLICY "Staff create works" ON works
FOR INSERT
WITH CHECK (
  check_staff_permission('works', 'create')
);


-- CUSTOMERS POLICIES
-- DELETE
DROP POLICY IF EXISTS "Staff delete customers" ON customers;
CREATE POLICY "Staff delete customers" ON customers
FOR DELETE
USING (
  check_staff_permission('customers', 'delete')
);

-- UPDATE
DROP POLICY IF EXISTS "Staff update customers" ON customers;
CREATE POLICY "Staff update customers" ON customers
FOR UPDATE
USING (
  check_staff_permission('customers', 'edit')
);

-- INSERT
DROP POLICY IF EXISTS "Staff create customers" ON customers;
CREATE POLICY "Staff create customers" ON customers
FOR INSERT
WITH CHECK (
  check_staff_permission('customers', 'create')
);

-- LEADS POLICIES
DROP POLICY IF EXISTS "Staff delete leads" ON leads;
CREATE POLICY "Staff delete leads" ON leads
FOR DELETE
USING ( check_staff_permission('leads', 'delete') );

DROP POLICY IF EXISTS "Staff update leads" ON leads;
CREATE POLICY "Staff update leads" ON leads
FOR UPDATE
USING ( check_staff_permission('leads', 'edit') );

DROP POLICY IF EXISTS "Staff create leads" ON leads;
CREATE POLICY "Staff create leads" ON leads
FOR INSERT
WITH CHECK ( check_staff_permission('leads', 'create') );

-- SERVICES POLICIES
DROP POLICY IF EXISTS "Staff delete services" ON services;
CREATE POLICY "Staff delete services" ON services
FOR DELETE
USING ( check_staff_permission('services', 'delete') );

DROP POLICY IF EXISTS "Staff update services" ON services;
CREATE POLICY "Staff update services" ON services
FOR UPDATE
USING ( check_staff_permission('services', 'edit') );

DROP POLICY IF EXISTS "Staff create services" ON services;
CREATE POLICY "Staff create services" ON services
FOR INSERT
WITH CHECK ( check_staff_permission('services', 'create') );

-- INVOICES POLICIES
DROP POLICY IF EXISTS "Staff delete invoices" ON invoices;
CREATE POLICY "Staff delete invoices" ON invoices
FOR DELETE
USING ( check_staff_permission('invoices', 'delete') );

DROP POLICY IF EXISTS "Staff update invoices" ON invoices;
CREATE POLICY "Staff update invoices" ON invoices
FOR UPDATE
USING ( check_staff_permission('invoices', 'edit') );

DROP POLICY IF EXISTS "Staff create invoices" ON invoices;
CREATE POLICY "Staff create invoices" ON invoices
FOR INSERT
WITH CHECK ( check_staff_permission('invoices', 'create') );
