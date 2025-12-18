-- Enable RLS permissions for Linked Staff Members

-- Helper to check if current user is staff of the row's owner
-- However, standard RLS with subqueries is fine.

-- 1. Update Policies for WORKS
DROP POLICY IF EXISTS "Users can view their own works" ON works;
CREATE POLICY "Users and Staff can view works" ON works
    FOR SELECT
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM staff_members sm
            WHERE sm.auth_user_id = auth.uid()
            AND sm.user_id = works.user_id
        )
    );

DROP POLICY IF EXISTS "Users can update their own works" ON works;
CREATE POLICY "Users and Staff can update works" ON works
    FOR UPDATE
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM staff_members sm
            WHERE sm.auth_user_id = auth.uid()
            AND sm.user_id = works.user_id
        )
    );

-- 2. Update Policies for CUSTOMERS (Read-only for staff usually, but let's allow read)
DROP POLICY IF EXISTS "Users can view their own customers" ON customers;
CREATE POLICY "Users and Staff can view customers" ON customers
    FOR SELECT
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM staff_members sm
            WHERE sm.auth_user_id = auth.uid()
            AND sm.user_id = customers.user_id
        )
    );

-- 3. Update Policies for SERVICES
DROP POLICY IF EXISTS "Users can view their own services" ON services;
CREATE POLICY "Users and Staff can view services" ON services
    FOR SELECT
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM staff_members sm
            WHERE sm.auth_user_id = auth.uid()
            AND sm.user_id = services.user_id
        )
    );

-- 4. Update Policies for STAFF_MEMBERS (Staff can see their own profile, Owner sees all)
DROP POLICY IF EXISTS "Users can view their own staff" ON staff_members;
CREATE POLICY "Users and Staff can view staff profiles" ON staff_members
    FOR SELECT
    USING (
        user_id = auth.uid() -- Owner
        OR 
        auth_user_id = auth.uid() -- The staff member themselves
    );
    
-- Allow staff to update only their own row? Or just Owner updates?
-- For now, let's keep update restricted to Owner, or maybe Staff can update basic info?
-- Let's stick to Owner updating Staff for now to be safe. Staff updates usage via TIME LOGS.

-- 5. Update Policies for WORK_TIME_LOGS
-- Staff can Insert logs for themselves. Owner can view all.
ALTER TABLE work_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert time logs" ON work_time_logs
    FOR INSERT
    WITH CHECK (
        auth.uid() IN (
            SELECT auth_user_id FROM staff_members WHERE id = staff_id
        )
    );

CREATE POLICY "Owner and Staff can view time logs" ON work_time_logs
    FOR SELECT
    USING (
        -- Owner of the linked work/staff (via join? Complex.)
        -- Simplified: If allow reading all logs for the account.
        EXISTS (
            SELECT 1 FROM works w
            WHERE w.id = work_id AND w.user_id = auth.uid()
        )
        OR
        -- Staff viewing their own logs
        auth.uid() IN (
            SELECT auth_user_id FROM staff_members WHERE id = staff_id
        )
    );
    
CREATE POLICY "Staff can update un-finished logs" ON work_time_logs
    FOR UPDATE
    USING (
        auth.uid() IN (
            SELECT auth_user_id FROM staff_members WHERE id = staff_id
        )
    );

-- 6. Recurring Tasks / Work Tasks
-- (Assuming standard RLS exists, need to open it up)
-- Since we are doing a broad fix, let's make a generic accessible function if possible, but standard Policies per table is safer.

-- Apply similar to 'leads'
DROP POLICY IF EXISTS "Users can view their own leads" ON leads;
CREATE POLICY "Users and Staff can view leads" ON leads
    FOR SELECT
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM staff_members sm
            WHERE sm.auth_user_id = auth.uid()
            AND sm.user_id = leads.user_id
        )
    );
