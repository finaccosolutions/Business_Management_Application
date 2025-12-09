/*
  # Add Recurring Work Support Fields

  1. New Columns for works table:
    - Adds period-based recurrence support for recurring works
    - Allows configuration of how periods are calculated
    - Stores billing amount for recurring instances
    - Supports multiple recurrence patterns (daily, weekly, monthly, quarterly, half-yearly, yearly)

  2. Changes to works table:
    - All new columns are nullable to maintain backward compatibility
    - recurrence_pattern: Type of recurrence (daily, weekly, monthly, quarterly, half-yearly, yearly)
    - period_calculation_type: How periods are calculated (previous_period, current_period, next_period)
    
  3. Security:
    - No new RLS policies needed - inherits from existing works table
    - All changes respect existing data integrity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'recurrence_pattern'
  ) THEN
    ALTER TABLE works ADD COLUMN recurrence_pattern text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'period_calculation_type'
  ) THEN
    ALTER TABLE works ADD COLUMN period_calculation_type text DEFAULT 'previous_period';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works' AND column_name = 'billing_amount'
  ) THEN
    ALTER TABLE works ADD COLUMN billing_amount numeric DEFAULT NULL;
  END IF;
END $$;
