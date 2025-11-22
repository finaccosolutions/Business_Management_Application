/*
  # Fix display_order Column Reference Error

  1. Issue
    - Function `copy_service_tasks_to_work` references non-existent column "display_order"
    - Should use "sort_order" instead (the actual column in service_tasks table)
    - This causes error when creating non-recurring works with services

  2. Changes
    - Drop trigger that depends on the function
    - Drop and recreate `copy_service_tasks_to_work` function with correct column reference
    - Recreate the trigger

  3. Impact
    - Fixes error: column "display_order" does not exist
    - Allows non-recurring works to be created successfully
    - Service tasks will be copied in correct sort order
*/

DROP TRIGGER IF EXISTS trigger_copy_service_tasks_to_work ON works;

DROP FUNCTION IF EXISTS copy_service_tasks_to_work();

CREATE FUNCTION copy_service_tasks_to_work()
RETURNS TRIGGER AS $$
DECLARE
v_task_record RECORD;
v_task_count integer := 0;
BEGIN
-- Only copy tasks for NON-recurring works that have a service
IF NEW.is_recurring = false AND NEW.service_id IS NOT NULL THEN

-- Copy only ACTIVE service tasks to work_tasks (ordered by sort_order)
FOR v_task_record IN
SELECT *
FROM service_tasks
WHERE service_id = NEW.service_id
AND is_active = TRUE
ORDER BY sort_order ASC
LOOP
INSERT INTO work_tasks (
work_id,
service_task_id,
title,
description,
priority,
estimated_hours,
sort_order,
status,
remarks
) VALUES (
NEW.id,
v_task_record.id,
v_task_record.title,
v_task_record.description,
v_task_record.priority,
v_task_record.estimated_hours,
v_task_count,
'pending',
v_task_record.notes
);

v_task_count := v_task_count + 1;
END LOOP;
END IF;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_copy_service_tasks_to_work
AFTER INSERT ON works
FOR EACH ROW
EXECUTE FUNCTION copy_service_tasks_to_work();