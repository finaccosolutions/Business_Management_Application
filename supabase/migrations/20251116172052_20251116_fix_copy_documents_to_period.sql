/*
  # Fix copy_documents_to_period Function

  Issue: The copy_documents_to_period function was filtering by is_active column
  on work_documents table, but that column doesn't exist.

  Fix: Remove the is_active filter since work_documents doesn't have this column.
*/

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
  WHERE work_id = p_work_id;
END $function$;