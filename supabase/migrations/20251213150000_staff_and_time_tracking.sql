-- Add columns to staff_members for auth and role
-- We use a TEXT column for role without strict CHECK constraint to allow flexibility, 
-- or we can ensure the check includes all UI options.
-- Let's drop the constraint if it exists from previous attempts or just create it flexible.

ALTER TABLE staff_members 
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff';

-- Create work_time_logs table
CREATE TABLE IF NOT EXISTS work_time_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_id UUID REFERENCES works(id) ON DELETE CASCADE,
    task_id UUID, -- nullable, link to recurring_period_tasks if needed manually
    staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_work_time_logs_work_id ON work_time_logs(work_id);
CREATE INDEX IF NOT EXISTS idx_work_time_logs_staff_id ON work_time_logs(staff_id);

-- Add acceptance columns to works
ALTER TABLE works 
ADD COLUMN IF NOT EXISTS acceptance_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS acceptance_date TIMESTAMPTZ;

-- Add acceptance columns to recurring_period_tasks
ALTER TABLE recurring_period_tasks 
ADD COLUMN IF NOT EXISTS acceptance_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS acceptance_date TIMESTAMPTZ;
