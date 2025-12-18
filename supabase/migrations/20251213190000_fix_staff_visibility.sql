-- Ensure Staff can view works assigned to them specifically
CREATE POLICY "Staff can view assigned works" ON works
    FOR SELECT
    USING (
        assigned_to IN (
            SELECT id FROM staff_members WHERE auth_user_id = auth.uid()
        )
    );

-- Similar for Recurring Tasks
ALTER TABLE recurring_period_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view assigned tasks" ON recurring_period_tasks
    FOR SELECT
    USING (
        assigned_to IN (
            SELECT id FROM staff_members WHERE auth_user_id = auth.uid()
        )
    );

-- Ensure Waiting Acceptance status is handled correctly or update it
-- (No SQL needed for status logic if handled in UI, but good to have constraint)

-- Function to get staff Dashboard metrics if needed
-- (Optional optimization)
