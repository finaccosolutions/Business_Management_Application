/*
  # Fix work_tasks trigger to use correct column name

  1. Changes
    - Update copy_service_tasks_to_work() function to use 'remarks' instead of 'notes' for work_tasks
    - The service_tasks table has a 'notes' column
    - The work_tasks table has a 'remarks' column
    - This fixes the column mismatch error when creating work

  2. Security
    - No changes to security policies
*/

CREATE OR REPLACE FUNCTION public.copy_service_tasks_to_work()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_task RECORD;
v_calculated_due_date DATE;
v_period_start DATE;
v_period_end DATE;
BEGIN
-- Get the first recurring period if this is a recurring work
IF NEW.is_recurring THEN
SELECT period_start_date, period_end_date INTO v_period_start, v_period_end
FROM work_recurring_instances
WHERE work_id = NEW.id
ORDER BY period_start_date
LIMIT 1;
END IF;

-- Copy tasks from service to work
FOR v_task IN 
SELECT * FROM service_tasks 
WHERE service_id = NEW.service_id 
AND is_active = true
ORDER BY sort_order
LOOP
-- Calculate due date based on task configuration
v_calculated_due_date := NULL;

IF NEW.is_recurring AND v_period_end IS NOT NULL THEN
-- For recurring work, calculate based on period
CASE
WHEN v_task.due_date_offset_days IS NOT NULL THEN
v_calculated_due_date := v_period_end - (v_task.due_date_offset_days || ' days')::INTERVAL;
WHEN v_task.due_day_of_month IS NOT NULL THEN
v_calculated_due_date := make_date(
EXTRACT(YEAR FROM v_period_end)::INTEGER,
EXTRACT(MONTH FROM v_period_end)::INTEGER,
LEAST(v_task.due_day_of_month, 
EXTRACT(DAY FROM (date_trunc('month', v_period_end) + interval '1 month' - interval '1 day'))::INTEGER
)
);
ELSE
v_calculated_due_date := v_period_end;
END CASE;
ELSIF NEW.due_date IS NOT NULL THEN
-- For one-time work, calculate based on due_date
CASE
WHEN v_task.due_date_offset_days IS NOT NULL THEN
v_calculated_due_date := NEW.due_date - (v_task.due_date_offset_days || ' days')::INTERVAL;
WHEN v_task.due_day_of_month IS NOT NULL THEN
v_calculated_due_date := make_date(
EXTRACT(YEAR FROM NEW.due_date)::INTEGER,
EXTRACT(MONTH FROM NEW.due_date)::INTEGER,
LEAST(v_task.due_day_of_month, 
EXTRACT(DAY FROM (date_trunc('month', NEW.due_date) + interval '1 month' - interval '1 day'))::INTEGER
)
);
ELSE
v_calculated_due_date := NEW.due_date;
END CASE;
END IF;

-- Insert work task (using 'remarks' column for work_tasks, not 'notes')
INSERT INTO work_tasks (
work_id,
service_task_id,
title,
description,
priority,
estimated_hours,
sort_order,
remarks,
due_date,
assigned_to,
status
) VALUES (
NEW.id,
v_task.id,
v_task.title,
v_task.description,
v_task.priority,
v_task.estimated_hours,
v_task.sort_order,
v_task.notes,
v_calculated_due_date,
v_task.default_assigned_to,
'pending'
);
END LOOP;

RETURN NEW;
END;
$function$;
