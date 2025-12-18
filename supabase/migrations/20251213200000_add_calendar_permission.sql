-- Migration to add 'calendar' to allowed_modules for all existing staff
-- And set it as default for future

UPDATE staff_members
SET allowed_modules = array_append(allowed_modules, 'calendar')
WHERE NOT ('calendar' = ANY(allowed_modules))
   OR allowed_modules IS NULL;

-- If allowed_modules was NULL, array_append might return NULL (depending on postgres version behavior with nulls, usually needs coalesce)
-- Let's be safer:

UPDATE staff_members
SET allowed_modules = array_append(COALESCE(allowed_modules, ARRAY['staff-dashboard', 'works', 'customers', 'leads', 'services']), 'calendar')
WHERE allowed_modules IS NULL 
   OR NOT ('calendar' = ANY(allowed_modules));
