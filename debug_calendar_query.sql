-- Run this script in the Supabase SQL Editor to check the actual data in your tables.

-- 1. Check ALL Recurring Tasks in a specific date range
-- This matches exactly what the Calendar is trying to fetch.

SELECT 
    rpt.id as task_id,
    rpt.title as task_title,
    rpt.due_date as "Task Due Date (DB)",
    wri.period_end_date as "Period End Date",
    w.title as "Work Title",
    sm.name as "Assigned Staff",
    rpt.status,
    wri.period_name
FROM recurring_period_tasks rpt
JOIN work_recurring_instances wri ON rpt.work_recurring_instance_id = wri.id
JOIN works w ON wri.work_id = w.id
LEFT JOIN staff_members sm ON rpt.assigned_to = sm.id
WHERE 
    -- Adjust these dates to the range you are checking
    rpt.due_date >= '2025-11-01' 
    AND rpt.due_date <= '2025-11-30'
ORDER BY rpt.due_date DESC;

-- If you see data here, it SHOULD show in the calendar (if dates match).
-- If the "Task Due Date (DB)" matches "Period End Date" but you expected something else,
-- then the Task Generation Logic generated it that way (defaulting to period end).

-- 2. Check "One-Time" or Non-Recurring Tasks
SELECT 
    wt.id, 
    wt.title, 
    wt.due_date, 
    w.title as work_title,
    w.recurrence_pattern
FROM work_tasks wt
LEFT JOIN works w ON wt.work_id = w.id
WHERE 
    wt.due_date >= '2025-11-01' 
    AND wt.due_date <= '2025-11-30'
    AND (w.recurrence_pattern = 'one-time' OR w.recurrence_pattern IS NULL);
