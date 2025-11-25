/*
  # Add Report Display Settings Table

  1. New Tables
    - `report_display_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `report_type` (text) - trial_balance, balance_sheet, profit_loss, chart_of_accounts_ledgers, chart_of_accounts_groups
      - `visible_columns` (jsonb) - array of column names to display
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Default Column Configurations
    - Trial Balance: opening_balance, transactions_debit, transactions_credit, closing_balance
    - Balance Sheet: opening_balance, closing_balance
    - Profit & Loss: opening_balance, transactions_debit, transactions_credit, closing_balance
    - Chart of Accounts Ledgers: code, name, group, opening_balance, closing_balance
    - Chart of Accounts Groups: name, description, ledger_count, closing_balance

  3. Security
    - Enable RLS on `report_display_settings` table
    - Users can only read/write their own settings
*/

CREATE TABLE IF NOT EXISTS public.report_display_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  visible_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, report_type)
);

ALTER TABLE public.report_display_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own report settings"
  ON public.report_display_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own report settings"
  ON public.report_display_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own report settings"
  ON public.report_display_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own report settings"
  ON public.report_display_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_report_display_settings_user_id 
  ON public.report_display_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_report_display_settings_user_type 
  ON public.report_display_settings(user_id, report_type);