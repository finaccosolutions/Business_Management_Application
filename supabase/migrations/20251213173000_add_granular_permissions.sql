-- Add granular permissions column to staff_members
ALTER TABLE staff_members 
ADD COLUMN IF NOT EXISTS detailed_permissions JSONB DEFAULT '{}'::jsonb;
-- Example structure: 
-- {
--   "works": { "can_delete": false, "can_edit": true, "view_revenue": false },
--   "customers": { "can_export": false, "view_phone": false }
-- }
