/*
  # Fix Duplicate Recurring Period Creation Triggers
  
  ## Problem
  Multiple triggers and frontend code are all trying to create recurring periods when a work is inserted:
  1. `trigger_create_initial_recurring_period` - Creates one initial period
  2. `trigger_create_initial_recurring_periods` - Creates up to 2 periods
  3. Frontend code in Works.tsx - Creates periods manually
  
  This causes duplicate key violations in `work_recurring_period_documents` table.
  
  ## Solution
  Disable the automatic database triggers since the frontend handles period creation explicitly.
  The `auto_create_period_documents_trigger` will remain active to copy documents when periods are created.
  
  ## Changes
  1. Drop both automatic period creation triggers
  2. Keep the document copying trigger active
  3. Frontend will remain responsible for creating periods
*/

-- Drop the duplicate triggers that auto-create recurring periods
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_period ON works;
DROP TRIGGER IF EXISTS trigger_create_initial_recurring_periods ON works;

-- Keep these triggers active (they're needed):
-- 1. auto_create_period_documents_trigger - Copies documents to periods
-- 2. trigger_copy_service_documents_to_work - Copies service documents to work
-- 3. All the logging and invoice generation triggers
