-- Add RLS for work_tasks to ensure staff can view assigned tasks
ALTER TABLE work_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view assigned work tasks" ON work_tasks
    FOR SELECT
    USING (
        assigned_to IN (
            SELECT id FROM staff_members WHERE auth_user_id = auth.uid()
        )
    );

-- Also allow staff to view work tasks if they can view the parent work
-- (Often tasks are relevant even if assigned to someone else, if we are collaborating)

CREATE POLICY "Staff can view work tasks of viewable works" ON work_tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM works w
            WHERE w.id = work_tasks.work_id
            -- This relies on user having access to the Work via other policies
            -- (which we defined as Owner OR Assigned Staff)
        )
    );
