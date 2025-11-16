/*
  # Fix copy_documents_to_period function

  1. Issue
    - copy_documents_to_period references is_active which doesn't exist on work_documents table
    - work_documents table has is_required and is_collected instead

  2. Solution
    - Remove is_active filter
    - Use appropriate columns for the work_documents table
*/

DROP FUNCTION IF EXISTS copy_documents_to_period(uuid, uuid);

CREATE FUNCTION copy_documents_to_period(p_period_id UUID, p_work_id UUID)
RETURNS VOID AS $$
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
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
