-- Remove legacy function calculate_task_due_date to ensure single source of truth.
-- We now rely entirely on 'calculate_configured_task_due_date' for all task calculations.

DROP FUNCTION IF EXISTS public.calculate_task_due_date(date, int, text);
DROP FUNCTION IF EXISTS public.calculate_task_due_date(uuid, date, date); -- Just in case the other signature lingering
