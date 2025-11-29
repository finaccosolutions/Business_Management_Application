/*
  # Fix generate_period_tasks_for_instance function signature

  The function is being called with 5 parameters but only exists as a trigger function with no parameters.
  Converting it to accept the required parameters: work_recurring_instance_id, service_id, period_start, period_end, period_type.
*/

DROP FUNCTION IF EXISTS public.generate_period_tasks_for_instance();

CREATE OR REPLACE FUNCTION public.generate_period_tasks_for_instance(
  p_work_recurring_instance_id uuid,
  p_service_id uuid,
  p_period_start date,
  p_period_end date,
  p_period_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_task_record RECORD;
  v_calculated_due_date date;
  v_current_month_start date;
  v_current_month_end date;
  v_task_instance_count integer;
  v_service_recurrence text;
  i integer;
BEGIN
  -- Get service recurrence type
  SELECT recurrence_type INTO v_service_recurrence
  FROM services
  WHERE id = p_service_id;

  IF v_service_recurrence IS NULL THEN
    RETURN;
  END IF;

  -- Generate tasks for each active service task
  FOR v_task_record IN
    SELECT *
    FROM service_tasks
    WHERE service_id = p_service_id
    AND is_active = true
    ORDER BY sort_order
  LOOP
    -- Determine how many instances of this task to create based on recurrence mismatch
    v_task_instance_count := 1;

    -- If task is monthly and service is quarterly, create 3 instances
    IF v_task_record.task_recurrence_type = 'monthly' AND v_service_recurrence = 'quarterly' THEN
      v_task_instance_count := 3;
    ELSIF v_task_record.task_recurrence_type = 'monthly' AND v_service_recurrence = 'half_yearly' THEN
      v_task_instance_count := 6;
    ELSIF v_task_record.task_recurrence_type = 'monthly' AND v_service_recurrence = 'yearly' THEN
      v_task_instance_count := 12;
    ELSIF v_task_record.task_recurrence_type = 'quarterly' AND v_service_recurrence = 'half_yearly' THEN
      v_task_instance_count := 2;
    ELSIF v_task_record.task_recurrence_type = 'quarterly' AND v_service_recurrence = 'yearly' THEN
      v_task_instance_count := 4;
    ELSIF v_task_record.task_recurrence_type = 'half_yearly' AND v_service_recurrence = 'yearly' THEN
      v_task_instance_count := 2;
    END IF;

    -- Create task instances
    FOR i IN 0..(v_task_instance_count - 1) LOOP
      -- When single instance, use FULL period dates
      -- When multiple instances, use month offsets
      IF v_task_instance_count = 1 THEN
        -- Single task for the entire period
        v_current_month_start := p_period_start;
        v_current_month_end := p_period_end;
      ELSE
        -- Multiple tasks (e.g., monthly tasks in quarterly period)
        v_current_month_start := (DATE_TRUNC('month', p_period_start) + (i || ' months')::interval)::date;
        v_current_month_end := (v_current_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
      END IF;

      -- Calculate due date for this instance
      v_calculated_due_date := calculate_enhanced_task_due_date(
        v_task_record.task_recurrence_type,
        v_service_recurrence,
        COALESCE(v_task_record.due_offset_type, 'day_of_month'),
        v_task_record.due_offset_value,
        v_task_record.due_offset_month,
        v_task_record.apply_to_month,
        v_current_month_start,
        v_current_month_end
      );

      -- Insert period task with instance suffix if multiple
      INSERT INTO recurring_period_tasks (
        work_recurring_instance_id,
        service_task_id,
        title,
        description,
        due_date,
        priority,
        estimated_hours,
        assigned_to,
        sort_order,
        status
      ) VALUES (
        p_work_recurring_instance_id,
        v_task_record.id,
        CASE 
          WHEN v_task_instance_count > 1 THEN 
            v_task_record.title || ' - ' || TO_CHAR(v_current_month_start, 'Mon YYYY')
          ELSE 
            v_task_record.title
        END,
        v_task_record.description,
        v_calculated_due_date,
        v_task_record.priority,
        v_task_record.estimated_hours,
        v_task_record.default_assigned_to,
        v_task_record.sort_order + i,
        'pending'
      );
    END LOOP;
  END LOOP;
END;
$function$;
