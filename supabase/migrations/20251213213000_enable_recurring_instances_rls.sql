-- Enable RLS for work_recurring_instances
ALTER TABLE work_recurring_instances ENABLE ROW LEVEL SECURITY;

-- Enable RLS for recurring_period_tasks (just to be safe)
ALTER TABLE recurring_period_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can view recurring instances if they can view the parent work
-- This generally means if they are assigned to the work or if it's public/team readable
CREATE POLICY "Staff can view work recurring instances" ON work_recurring_instances
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM works w
            WHERE w.id = work_recurring_instances.work_id
            -- We rely on the fact that the user can visible access 'works' via its own policies
            -- (which includes Owner and Assigned Staff)
        )
    );

-- Also ensure that recurring_period_tasks policy is broad enough
-- (We previously added check for 'assigned_to' OR 'parent work visible')
-- Let's double check if we need to expand 'recurring_period_tasks' visibility
-- to include tasks where the USER is the manager of the Work, even if task is unassigned.

DROP POLICY IF EXISTS "Staff can view assigned tasks" ON recurring_period_tasks;
-- Recreate better one
CREATE POLICY "Staff can view recurring tasks related to their works" ON recurring_period_tasks
    FOR SELECT
    USING (
        -- Directly assigned
        assigned_to IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
        OR
        -- Parent work is accessible (e.g. user is assigned to parent work)
        EXISTS (
            SELECT 1 FROM work_recurring_instances wri
            JOIN works w ON w.id = wri.work_id
            WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
            -- Check if user is assigned to the parent work
            AND w.assigned_to IN (SELECT id FROM staff_members WHERE auth_user_id = auth.uid())
        )
    );

-- Policy: Admins and staff with 'view_all' can view ALL recurring tasks
CREATE POLICY "Admins/ViewAll can view all recurring tasks" ON recurring_period_tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM staff_members
            WHERE auth_user_id = auth.uid()
            AND (
                role = 'admin' 
                OR (detailed_permissions->'calendar'->>'view_all')::boolean = true
            )
        )
    );

-- Policy: Admins and staff with 'view_all' can view ALL recurring instances
CREATE POLICY "Admins/ViewAll can view all recurring instances" ON work_recurring_instances
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM staff_members
            WHERE auth_user_id = auth.uid()
            AND (
                role = 'admin' 
                OR (detailed_permissions->'calendar'->>'view_all')::boolean = true
            )
        )
    );
