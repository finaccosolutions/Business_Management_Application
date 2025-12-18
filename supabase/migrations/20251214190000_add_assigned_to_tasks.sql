/*
  # Fix Task Assignment Columns
  
  1. Add `assigned_to` to `recurring_period_tasks` to allow assigning individual instances.
  2. Add `acceptance_status` and `acceptance_date` for staff acknowledgment.
*/

ALTER TABLE public.recurring_period_tasks 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.staff_members(id);

ALTER TABLE public.recurring_period_tasks 
ADD COLUMN IF NOT EXISTS acceptance_status text DEFAULT 'pending';

ALTER TABLE public.recurring_period_tasks 
ADD COLUMN IF NOT EXISTS acceptance_date timestamptz;

-- Update RLS to ensure new column is covered (the previous policy referenced it, but if it was missing, it might have been invalid or implicit)
-- Re-applying policy is safer or just letting the previous one work now that column exists.
