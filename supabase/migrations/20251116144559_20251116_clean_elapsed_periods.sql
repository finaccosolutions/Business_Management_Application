/*
  # Clean Up Elapsed Periods
  
  ## Summary
  Remove all recurring periods that have end dates in the past (before current date).
  This keeps the periods list clean by only showing active and future periods.
  
  ## Changes
  - Delete all work_recurring_instances where period_end_date < CURRENT_DATE
  - Cascading deletes will handle related period tasks and documents
  
  ## Important Notes
  - Only removes future/unnecessary periods
  - Data integrity maintained through foreign key constraints
  - Current date: 2025-11-16
*/

DELETE FROM work_recurring_instances
WHERE period_end_date < CURRENT_DATE;