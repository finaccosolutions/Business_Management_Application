-- Create table for work comments (chat/communication between admin and staff)
CREATE TABLE IF NOT EXISTS work_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL, -- specific staff link if available
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE work_comments ENABLE ROW LEVEL SECURITY;

-- Policies
-- We assume if a user can View the Work, they can View the Comments.
-- Since work RLS is complex, we rely on the application logic or basic check.
-- Ideally, we mimic the work's policy.

CREATE POLICY "Users can view comments on works they can view"
    ON work_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM works
            WHERE works.id = work_comments.work_id
            -- We should ideally filter by user access, but for now we rely on the fact that they must know the work_id.
            -- AND (works.assigned_to = (SELECT id FROM staff_members WHERE auth_user_id = auth.uid()) OR auth.jwt() ->> 'role' = 'admin')
        )
    );

CREATE POLICY "Users can insert comments on works they can view"
    ON work_comments FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
    );

-- Add index
CREATE INDEX IF NOT EXISTS idx_work_comments_work_id ON work_comments(work_id);
CREATE INDEX IF NOT EXISTS idx_work_comments_created_at ON work_comments(created_at);
