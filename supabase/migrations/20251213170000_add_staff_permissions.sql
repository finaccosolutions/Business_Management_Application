-- Add allowed_modules to staff_members
ALTER TABLE staff_members 
ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT NULL;

-- Initial update: Give existing staff access to basic modules if null
-- logic: if allowed_modules is null, they might have access to 'dashboard' (staff one) by default.
-- We won't force update existing data to avoid assumptions, but frontend should handle null = all or none.
-- Let's assume null = all for backward compatibility, or empty = none. 
-- Actually effectively: IF null THEN all access (for now) to avoid breaking.
