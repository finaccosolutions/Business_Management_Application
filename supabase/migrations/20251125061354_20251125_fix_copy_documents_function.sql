/*
  # Fix copy_documents_to_period Function
  
  Remove the is_active check since work_documents may not have that column
*/

DROP FUNCTION IF EXISTS copy_documents_to_period(uuid, uuid);

CREATE OR REPLACE FUNCTION copy_documents_to_period(p_period_id uuid, p_work_id uuid)
RETURNS void AS $$
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
  WHERE work_id = p_work_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
