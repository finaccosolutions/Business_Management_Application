/*
  # Remove Duplicate Invoice Generation Functions

  ## Overview
  Removes incomplete auto-invoice functions that lack proper account mappings.
  Keeps the working trigger-based functions that handle invoice creation correctly:
  - auto_create_invoice_on_recurring_tasks_complete
  - auto_create_invoice_on_work_tasks_complete

  ## Removed Functions
  - auto_generate_invoice_for_completed_period (incomplete - missing account fields)
  - auto_generate_invoice_for_completed_work (incomplete - missing account fields)
  - trigger_auto_generate_invoice_on_period_complete (trigger for incomplete function)

  ## Kept Functions
  - auto_create_invoice_on_recurring_tasks_complete (complete implementation)
  - auto_create_invoice_on_work_tasks_complete (complete implementation)
*/

DROP TRIGGER IF EXISTS trigger_auto_generate_invoice_on_period_complete ON work_recurring_instances CASCADE;
DROP FUNCTION IF EXISTS trigger_auto_generate_invoice_on_period_complete() CASCADE;
DROP FUNCTION IF EXISTS auto_generate_invoice_for_completed_period(uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_invoice_for_completed_work(uuid) CASCADE;