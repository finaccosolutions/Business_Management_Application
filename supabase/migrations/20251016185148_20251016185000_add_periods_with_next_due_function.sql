/*
  # Add function to fetch periods with next due date
  
  ## Changes
  1. Create function to get periods with their next due date from tasks
  2. Delete incorrect duplicate periods with wrong date ranges
  
  ## Function Purpose
  Returns periods with calculated next_due_date from incomplete tasks
*/

-- ============================================================================
-- Delete incorrect periods (wrong date ranges like 2025-09-30 to 2025-10-30)
-- ============================================================================
-- Delete periods where the date range is incorrect (period_end_date - period_start_date > 35 days for monthly)
DELETE FROM work_recurring_instances 
WHERE period_end_date - period_start_date > 35;

-- Delete periods where start date is not the 1st of the month for monthly patterns
DELETE FROM work_recurring_instances wri
WHERE EXISTS (
  SELECT 1 FROM works w 
  WHERE w.id = wri.work_id 
  AND w.recurrence_pattern = 'monthly'
  AND EXTRACT(DAY FROM wri.period_start_date) NOT IN (1)
  AND wri.period_start_date != DATE_TRUNC('quarter', wri.period_start_date)::DATE
  AND wri.period_start_date != DATE_TRUNC('year', wri.period_start_date)::DATE
);

-- ============================================================================
-- Function to get periods with next due date
-- ============================================================================
CREATE OR REPLACE FUNCTION get_work_periods_with_next_due(p_work_id UUID)
RETURNS TABLE (
  id UUID,
  work_id UUID,
  period_name TEXT,
  period_start_date DATE,
  period_end_date DATE,
  status TEXT,
  completed_at TIMESTAMPTZ,
  billing_amount NUMERIC,
  is_billed BOOLEAN,
  invoice_id UUID,
  notes TEXT,
  all_tasks_completed BOOLEAN,
  staff_members JSONB,
  next_due_date DATE,
  total_tasks INTEGER,
  completed_tasks INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wri.id,
    wri.work_id,
    wri.period_name,
    wri.period_start_date,
    wri.period_end_date,
    wri.status,
    wri.completed_at,
    wri.billing_amount,
    wri.is_billed,
    wri.invoice_id,
    wri.notes,
    wri.all_tasks_completed,
    NULL::JSONB as staff_members,
    MIN(rpt.due_date) FILTER (WHERE rpt.status != 'completed' AND rpt.due_date >= CURRENT_DATE) as next_due_date,
    wri.total_tasks,
    wri.completed_tasks,
    wri.created_at,
    wri.updated_at
  FROM work_recurring_instances wri
  LEFT JOIN recurring_period_tasks rpt ON rpt.work_recurring_instance_id = wri.id
  WHERE wri.work_id = p_work_id
  GROUP BY wri.id
  ORDER BY wri.period_start_date DESC;
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_work_periods_with_next_due(UUID) TO authenticated;
