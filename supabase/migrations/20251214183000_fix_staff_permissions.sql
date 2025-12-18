/*
  # Fix Permissions for Staff Work Management
  
  1. Purpose:
     - Allow staff members to accept/reject works assigned to them.
     - Allow staff members to update status of works and tasks assigned to them.
     - Allow staff members to log time (insert/update work_time_logs).
  
  2. Policies:
     - Works: UPDATE allowed if assigned_to matches authenticated staff member.
     - Recurring Period Tasks: UPDATE allowed if assigned_to matches OR parent work is assigned.
     - Work Time Logs: INSERT/UPDATE allowed for own logs.
*/

-- 1. WORKS: Allow Staff to Update their assigned works (Accept, Reject, Status Change)
CREATE POLICY "Staff can update works assigned to them" ON public.works
    FOR UPDATE
    USING (
        assigned_to IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        assigned_to IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
    );

-- 2. RECURRING PERIOD TASKS: Allow attributes update (Status, Comments, etc.)
ALTER TABLE public.recurring_period_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can update assigned recurring tasks" ON public.recurring_period_tasks
    FOR UPDATE
    USING (
        assigned_to IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
        OR 
        -- Also allow if they are assigned to the parent Work (fallback)
        EXISTS (
            SELECT 1 FROM public.work_recurring_instances wri
            JOIN public.works w ON w.id = wri.work_id
            WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
            AND w.assigned_to IN (
                SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Staff can view assigned recurring tasks" ON public.recurring_period_tasks
    FOR SELECT
    USING (
        assigned_to IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.work_recurring_instances wri
            JOIN public.works w ON w.id = wri.work_id
            WHERE wri.id = recurring_period_tasks.work_recurring_instance_id
            AND w.assigned_to IN (
                SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
            )
        )
    );

-- 3. WORK TIME LOGS: Ensure staff can log time
ALTER TABLE public.work_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert their own time logs" ON public.work_time_logs
    FOR INSERT
    WITH CHECK (
        staff_id IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Staff can update their own time logs" ON public.work_time_logs
    FOR UPDATE
    USING (
        staff_id IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Staff can view their own time logs" ON public.work_time_logs
    FOR SELECT
    USING (
        staff_id IN (
            SELECT id FROM public.staff_members WHERE auth_user_id = auth.uid()
        )
    );
