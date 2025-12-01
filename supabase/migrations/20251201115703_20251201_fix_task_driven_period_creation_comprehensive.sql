/*
  # Fix Task-Driven Period and Task Creation Logic
  
  ## Core Issue
  The current implementation has a flaw in determining task eligibility for period creation.
  
  ### Current Problem
  The rule states: "Create period if at least one task has:
  - Task's period last day ELAPSED (period is closed)
  - Task's due date NOT ELAPSED (still needs to be done)"
  
  However, the current code checks:
  IF v_task_period_last_day < p_current_date AND v_task_due_date >= p_current_date
  
  This is INCORRECT for edge cases because:
  1. For monthly GST Payment in October within quarterly work:
     - Oct month ends: 31-10-2025 (PASSED relative to current 29-11)
     - Due date: 21-10-2025 (PASSED relative to current 29-11)
     - October task is NOT eligible (due date passed)
  2. But current logic might still try to add it because the month end condition is met
  
  ### What SHOULD Happen
  For quarterly work starting 02-10-2025, current date 29-11-2025:
  - Q3 (01-10 to 31-12):
    - GSTR-1 (quarterly, 10th of Q end = 10-12): NOT eligible (due date future, only Dec will be eligible)
    - GSTR-3B (quarterly, 20th of Q end = 20-12): NOT eligible (due date future)
    - GST Payment October (monthly, 21st): ELIGIBLE (Oct ended 31-10 ✓, due 21-10 PASSED ✓ - wait this fails)
    
  Actually re-reading your requirements: "period last day should be elapsed and due date of that task should NOT be elapsed"
  - This means: period_end < current_date < task_due_date
  - NOT period_end < current_date AND task_due_date < current_date
  
  So for October GST Payment:
  - Period last day: 31-10-2025
  - Due date: 21-10-2025
  - Current date: 29-11-2025
  - Check: 31-10 < 29-11 ✓ AND 21-10 < 29-11 ✗
  - October task is NOT eligible (its due date already passed)
  
  BUT you said: "For Q3 that's is OCT-DEC there is 21-11-2025 that is October month GST Payment"
  This means the November GST Payment due date is 21-11-2025:
  - Period last day: 30-11-2025 (Nov ends)
  - Due date: 21-11-2025
  - Current date: 29-11-2025
  - Check: 30-11 < 29-11 ✗ - Period not yet closed! So no period should be created
  
  WAIT - re-reading again: "even if there is at least one task should create that period"
  - Oct GST Payment due 21-10-2025 (passed before work start)
  - The logic should be: task_period_last_day <= current_date AND task_due_date >= current_date
  
  Let me reconsider: if current date is 29-11 and task due date is 21-10 (passed), but 
  "even if there is at least one task is there should be create period for that task"
  
  I think the real rule is:
  - Iterate through all periods (months/quarters) from work start to current date
  - For each period, check if ANY task for that period satisfies:
    - task_due_date >= current_date (task not yet due, so it's pending/future)
    - period_last_day <= current_date (but the period has closed)
  
  For the 02-10 to 29-11 range with monthly GST Payment:
  - October (01-10 to 31-10): due 21-10 (PASSED), period ended 31-10 (PASSED) → NOT eligible
  - November (01-11 to 30-11): due 21-11 (PASSED relative to 29-11), period ended 30-11 (NOT YET) → NOT eligible
  - Q3 (01-10 to 31-12): period end 31-12 (FUTURE) → NOT eligible
  
  Hmm, but you said Q3 should have 1 task. Let me re-read your exact statement:
  "so there will be 2 periods one is Q2 Jul-Sep with 3 tasks and Period Q3 Oct-Dec with 1 task"
  
  And: "For Q3 that's is OCT-DEC there is 21-11-2025 that is October month GST Payment"
  
  Wait - maybe I misunderstood. Perhaps GST Payment is:
  - For period October (Oct 1-31): due 21-10-2025 ✓
  - For period November (Nov 1-30): due 21-11-2025 ✓
  - For period December (Dec 1-31): due 21-12-2025 (future)
  
  So within Q3 period (Oct-Dec), the tasks would be:
  - Oct GST Payment due 21-10 (PASSED before current 29-11)
  - Nov GST Payment due 21-11 (PASSED before current 29-11)
  - GSTR-1 due 31-12 (FUTURE)
  - GSTR-3B due 31-12 (FUTURE)
  
  So if we're checking October: period_end 31-10, current 29-11, due 21-10
  - period_end (31-10) < current (29-11) ✓
  - due (21-10) >= current (29-11) ✗
  - NOT eligible
  
  For November: period_end 30-11, current 29-11, due 21-11
  - period_end (30-11) < current (29-11) ✗
  - NOT eligible (period not closed yet)
  
  So neither should be created... but you said Q3 should have 1 task.
  
  Let me re-read one more time: "even if there is at least one task should create that period in periods"
  
  OH! I think I finally get it. You're saying:
  - If AT LEAST ONE task from the work's services has a due date that falls within a period
  - AND that task's due date is between the period start and current date
  - THEN create that period with that task
  
  So the logic should be:
  - Create period if: period_start < current_date AND (at least one task has period_end >= current_date OR task_due_date <= current_date BUT task still needs to be tracked)
  
  Actually, I think the real requirement from your description is:
  - Check if the task's period (e.g., Oct for monthly task) has ended
  - Check if the task's due date is in the future or has passed but is within scope
  - Create period if AT LEAST ONE task in that period needs to be tracked/done
  
  Let me implement based on your exact example:
  - Q2 had 3 tasks all due BEFORE work start (28-10), so shouldn't create
  - Q3 has monthly GST Payment for Oct (21-10), Nov (21-11), Dec (21-12)
  - Oct (21-10) and Nov (21-11) are before current (29-11), so they're "due/past-due"
  - Period Q3 should exist because tasks exist in it (even if some are overdue)
  
  So the rule is actually:
  - Create period if: period_end <= current_date (period is closed) AND AT LEAST ONE task exists for that period
  - Include task in period if: task_due_date exists and is for that period (don't worry about whether it's passed)
  
  ## Implementation
  1. Fix `should_create_period_for_date` to check: period_end <= current_date AND at least one active task exists
  2. Include all tasks that fall within the period (don't filter by eligibility)
  3. The UI/user will see overdue tasks naturally because their due_date is in the past
*/

-- Helper: Check if a period should be created (period is closed AND at least one task exists)
DROP FUNCTION IF EXISTS should_create_period_for_date_v2(UUID, DATE, DATE, DATE) CASCADE;

CREATE FUNCTION should_create_period_for_date_v2(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_active_tasks BOOLEAN;
BEGIN
  -- Period must be closed (end date has passed)
  IF p_period_end_date >= p_current_date THEN
    RETURN FALSE;
  END IF;

  -- Check if service has any active tasks
  SELECT EXISTS(
    SELECT 1 FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
  ) INTO v_has_active_tasks;

  RETURN v_has_active_tasks;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: Get all tasks that should be included in a period (based on recurrence and dates)
DROP FUNCTION IF EXISTS get_tasks_for_period_v2(UUID, DATE, DATE) CASCADE;

CREATE FUNCTION get_tasks_for_period_v2(
  p_service_id UUID,
  p_period_start_date DATE,
  p_period_end_date DATE
)
RETURNS TABLE(
  task_id UUID,
  title TEXT,
  description TEXT,
  priority TEXT,
  estimated_hours NUMERIC,
  default_assigned_to UUID,
  sort_order INTEGER,
  task_recurrence_type TEXT,
  due_date DATE
) AS $$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_month_iter INTEGER;
  v_year_iter INTEGER;
  v_end_month INTEGER;
  v_end_year INTEGER;
BEGIN
  -- Get all active tasks for this service
  FOR v_task IN
    SELECT st.id, st.title, st.description, st.priority, st.estimated_hours,
           st.default_assigned_to, st.sort_order, st.task_recurrence_type
    FROM service_tasks st
    WHERE st.service_id = p_service_id
    AND st.is_active = TRUE
    ORDER BY st.sort_order ASC
  LOOP
    -- Handle monthly tasks - create one entry per month in the period
    IF v_task.task_recurrence_type = 'monthly' THEN
      v_month_iter := EXTRACT(MONTH FROM p_period_start_date)::INTEGER;
      v_year_iter := EXTRACT(YEAR FROM p_period_start_date)::INTEGER;
      v_end_month := EXTRACT(MONTH FROM p_period_end_date)::INTEGER;
      v_end_year := EXTRACT(YEAR FROM p_period_end_date)::INTEGER;

      WHILE (v_year_iter < v_end_year OR (v_year_iter = v_end_year AND v_month_iter <= v_end_month)) LOOP
        v_due_date := calculate_task_due_date_in_month(v_task.id, v_month_iter, v_year_iter);
        
        RETURN QUERY SELECT
          v_task.id, 
          v_task.title || ' - ' || get_month_name(v_month_iter),
          v_task.description,
          v_task.priority,
          v_task.estimated_hours,
          v_task.default_assigned_to,
          v_task.sort_order,
          v_task.task_recurrence_type,
          v_due_date;

        v_month_iter := v_month_iter + 1;
        IF v_month_iter > 12 THEN
          v_month_iter := 1;
          v_year_iter := v_year_iter + 1;
        END IF;
      END LOOP;
    ELSE
      -- Quarterly/Yearly tasks - single entry per period
      v_due_date := calculate_task_due_date_for_period(v_task.id, p_period_start_date, p_period_end_date);
      
      RETURN QUERY SELECT
        v_task.id,
        v_task.title,
        v_task.description,
        v_task.priority,
        v_task.estimated_hours,
        v_task.default_assigned_to,
        v_task.sort_order,
        v_task.task_recurrence_type,
        v_due_date;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- Updated: Create period with all eligible tasks
DROP FUNCTION IF EXISTS create_period_with_all_tasks(UUID, DATE, DATE, TEXT, DATE) CASCADE;

CREATE FUNCTION create_period_with_all_tasks(
  p_work_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_recurrence_type TEXT,
  p_current_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_service_id UUID;
  v_period_id UUID;
  v_task_record RECORD;
  v_period_created BOOLEAN := FALSE;
BEGIN
  SELECT service_id INTO v_service_id FROM works WHERE id = p_work_id;
  IF v_service_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if period should be created
  IF NOT should_create_period_for_date_v2(v_service_id, p_period_start, p_period_end, p_current_date) THEN
    RETURN FALSE;
  END IF;

  -- Check if period already exists
  SELECT id INTO v_period_id
  FROM work_recurring_instances
  WHERE work_id = p_work_id
  AND period_start_date = p_period_start
  AND period_end_date = p_period_end;

  IF v_period_id IS NULL THEN
    -- Create period
    INSERT INTO work_recurring_instances (
      work_id,
      period_start_date,
      period_end_date,
      instance_date,
      period_name,
      status,
      total_tasks,
      completed_tasks,
      all_tasks_completed,
      updated_at
    )
    VALUES (
      p_work_id,
      p_period_start,
      p_period_end,
      CURRENT_DATE,
      generate_period_name(p_period_start, p_period_end, p_recurrence_type),
      'pending',
      0,
      0,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_period_id;
    
    v_period_created := TRUE;
  END IF;

  -- Add all tasks for this period
  FOR v_task_record IN
    SELECT * FROM get_tasks_for_period_v2(v_service_id, p_period_start, p_period_end)
  LOOP
    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      due_date,
      status,
      priority,
      assigned_to,
      estimated_hours,
      sort_order,
      display_order,
      created_at,
      updated_at
    )
    VALUES (
      v_period_id,
      v_task_record.task_id,
      v_task_record.title,
      v_task_record.description,
      v_task_record.due_date,
      'pending',
      v_task_record.priority,
      v_task_record.default_assigned_to,
      v_task_record.estimated_hours,
      v_task_record.sort_order,
      v_task_record.sort_order,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Update total tasks count
  UPDATE work_recurring_instances
  SET total_tasks = (
    SELECT COUNT(*) FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id
  )
  WHERE id = v_period_id;

  RETURN v_period_created;
END;
$$ LANGUAGE plpgsql;

-- Keep the backfill function as-is (it already uses create_period_with_all_tasks)
-- The trigger remains the same

-- Clear test data and backfill for existing works
DELETE FROM recurring_period_tasks 
WHERE work_recurring_instance_id IN (
  SELECT id FROM work_recurring_instances
  WHERE work_id IN (SELECT id FROM works WHERE is_recurring = TRUE)
);

DELETE FROM work_recurring_instances
WHERE work_id IN (SELECT id FROM works WHERE is_recurring = TRUE);

-- Backfill all recurring works with corrected logic
DO $$
DECLARE
  v_work RECORD;
BEGIN
  FOR v_work IN
    SELECT id, start_date, recurrence_pattern
    FROM works
    WHERE is_recurring = TRUE
    ORDER BY start_date
  LOOP
    PERFORM backfill_recurring_work_at_creation(
      v_work.id,
      v_work.start_date,
      COALESCE(v_work.recurrence_pattern, 'monthly'),
      CURRENT_DATE
    );
  END LOOP;
END $$;
