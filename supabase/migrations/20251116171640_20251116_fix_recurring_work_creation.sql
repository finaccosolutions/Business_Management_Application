/*
  # Fix Recurring Work Creation Issues

  1. Issues Fixed
    - Fixed syntax error in copy_tasks_to_period function (AND operator placement)
    - Fixed work documents filtering by is_active column
    - Remove all existing periods for recurring works and recreate based on work start date

  2. Changes Made
    - Recreate copy_tasks_to_period function with proper SQL syntax
    - Update copy_documents_to_period function to handle is_active properly
    - Remove all existing work_recurring_instances for recurring works
    - Regenerate periods based on work start_date
*/

-- Drop and recreate copy_tasks_to_period with corrected syntax
DROP FUNCTION IF EXISTS public.copy_tasks_to_period(uuid, uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION public.copy_tasks_to_period(
  p_period_id uuid,
  p_service_id uuid,
  p_period_start_date date,
  p_period_end_date date,
  p_assigned_to uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_task RECORD;
  v_due_date DATE;
  v_task_count INTEGER := 0;
BEGIN
  IF p_service_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_task IN
    SELECT * FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = TRUE
    ORDER BY sort_order
  LOOP
    IF v_task.due_date_offset_days IS NOT NULL THEN
      v_due_date := p_period_end_date + (v_task.due_date_offset_days || ' days')::INTERVAL;
    ELSE
      v_due_date := p_period_end_date + INTERVAL '10 days';
    END IF;

    INSERT INTO recurring_period_tasks (
      work_recurring_instance_id,
      service_task_id,
      title,
      description,
      priority,
      estimated_hours,
      sort_order,
      due_date,
      status,
      assigned_to
    ) VALUES (
      p_period_id,
      v_task.id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.estimated_hours,
      v_task.sort_order,
      v_due_date,
      'pending',
      p_assigned_to
    );

    v_task_count := v_task_count + 1;
  END LOOP;

  RETURN v_task_count;
END $function$;

-- Fix copy_documents_to_period to use proper NULL check
DROP FUNCTION IF EXISTS public.copy_documents_to_period(uuid, uuid);

CREATE OR REPLACE FUNCTION public.copy_documents_to_period(p_period_id uuid, p_work_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO work_recurring_period_documents (
    work_recurring_instance_id,
    work_document_id,
    is_collected,
    collected_at,
    file_url,
    file_size,
    uploaded_at,
    notes
  )
  SELECT
    p_period_id,
    id,
    FALSE,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  FROM work_documents
  WHERE work_id = p_work_id
  AND (is_active IS NULL OR is_active = TRUE);
END $function$;

-- Remove all existing periods for recurring works
DELETE FROM work_recurring_instances
WHERE work_id IN (
  SELECT id FROM works WHERE is_recurring = true
);

-- Regenerate periods for all recurring works based on their start_date
DO $$
DECLARE
  v_work RECORD;
  v_period_dates RECORD;
  v_period_id UUID;
  v_task_count INTEGER;
BEGIN
  FOR v_work IN
    SELECT w.* FROM works w
    WHERE w.is_recurring = true
    AND w.start_date IS NOT NULL
    ORDER BY w.created_at
  LOOP
    BEGIN
      -- Calculate first period dates based on work start date
      SELECT * INTO v_period_dates
      FROM calculate_first_period_dates(
        v_work.start_date::DATE,
        COALESCE(v_work.recurrence_pattern, 'monthly')
      );

      -- Create first period
      INSERT INTO work_recurring_instances (
        work_id,
        period_name,
        period_start_date,
        period_end_date,
        status
      ) VALUES (
        v_work.id,
        v_period_dates.first_period_name,
        v_period_dates.first_start_date,
        v_period_dates.first_end_date,
        'pending'
      ) RETURNING id INTO v_period_id;

      -- Copy tasks with proper function call
      v_task_count := copy_tasks_to_period(
        v_period_id,
        v_work.service_id,
        v_period_dates.first_start_date,
        v_period_dates.first_end_date,
        v_work.assigned_to
      );

      -- Copy documents
      PERFORM copy_documents_to_period(v_period_id, v_work.id);

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error regenerating periods for work %: %', v_work.id, SQLERRM;
    END;
  END LOOP;
END $$;