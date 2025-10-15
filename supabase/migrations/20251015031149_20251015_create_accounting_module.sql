/*
  # Create Comprehensive Accounting Module for Service Business

  ## Overview
  This migration creates a complete accounting system to replace the simple invoice module.
  It includes chart of accounts, general ledger, vouchers, and all necessary masters.

  ## New Tables Created

  ### 1. account_groups
  - Master table for grouping accounts (Assets, Liabilities, Income, Expenses, Equity)
  - Fields: id, name, parent_group_id, account_type, description, display_order

  ### 2. chart_of_accounts
  - Individual accounts under each group
  - Fields: id, account_code, account_name, account_group_id, opening_balance, current_balance, is_active

  ### 3. voucher_types
  - Master for different voucher types (Payment, Receipt, Journal, Contra, Sales, Purchase)
  - Fields: id, name, code, description, is_active

  ### 4. vouchers
  - Main voucher transactions
  - Fields: id, voucher_type_id, voucher_number, voucher_date, reference_number, narration, total_amount, status

  ### 5. voucher_entries
  - Individual debit/credit entries for each voucher (double-entry bookkeeping)
  - Fields: id, voucher_id, account_id, debit_amount, credit_amount, narration

  ### 6. ledger_transactions
  - Auto-generated ledger entries from vouchers
  - Fields: id, account_id, voucher_id, transaction_date, debit, credit, balance, narration

  ### 7. payment_terms_master
  - Master for payment terms (Net 30, Net 45, etc.)
  - Fields: id, name, days, description

  ### 8. tax_rates_master
  - Master for tax rates (GST, VAT, etc.)
  - Fields: id, name, rate, description, is_active

  ### 9. bank_accounts_master
  - Master for company bank accounts
  - Fields: id, bank_name, account_number, account_holder_name, ifsc_code, branch, balance

  ### 10. cost_centers
  - Optional cost center allocation
  - Fields: id, name, code, description

  ## Security
  - All tables have RLS enabled
  - Users can only access their own accounting data
  - Proper policies for select, insert, update, delete operations

  ## Important Notes
  - Existing invoices table will be integrated with the accounting module
  - All vouchers follow double-entry bookkeeping principles
  - Ledger transactions are automatically generated from vouchers
*/

-- Create account_groups table
CREATE TABLE IF NOT EXISTS account_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  parent_group_id uuid REFERENCES account_groups(id) ON DELETE SET NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'income', 'expense', 'equity')),
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE account_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own account groups"
  ON account_groups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own account groups"
  ON account_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own account groups"
  ON account_groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own account groups"
  ON account_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create chart_of_accounts table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_group_id uuid REFERENCES account_groups(id) ON DELETE RESTRICT NOT NULL,
  opening_balance numeric(15, 2) DEFAULT 0,
  current_balance numeric(15, 2) DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, account_code)
);

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts"
  ON chart_of_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON chart_of_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON chart_of_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON chart_of_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create voucher_types table
CREATE TABLE IF NOT EXISTS voucher_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, code)
);

ALTER TABLE voucher_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voucher types"
  ON voucher_types FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voucher types"
  ON voucher_types FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voucher types"
  ON voucher_types FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own voucher types"
  ON voucher_types FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  voucher_type_id uuid REFERENCES voucher_types(id) ON DELETE RESTRICT NOT NULL,
  voucher_number text NOT NULL,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  reference_number text,
  narration text,
  total_amount numeric(15, 2) DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  created_by uuid REFERENCES auth.users(id),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, voucher_number)
);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vouchers"
  ON vouchers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vouchers"
  ON vouchers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vouchers"
  ON vouchers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vouchers"
  ON vouchers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create voucher_entries table
CREATE TABLE IF NOT EXISTS voucher_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid REFERENCES vouchers(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES chart_of_accounts(id) ON DELETE RESTRICT NOT NULL,
  debit_amount numeric(15, 2) DEFAULT 0,
  credit_amount numeric(15, 2) DEFAULT 0,
  narration text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE voucher_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voucher entries"
  ON voucher_entries FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vouchers 
    WHERE vouchers.id = voucher_entries.voucher_id 
    AND vouchers.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own voucher entries"
  ON voucher_entries FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM vouchers 
    WHERE vouchers.id = voucher_entries.voucher_id 
    AND vouchers.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own voucher entries"
  ON voucher_entries FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vouchers 
    WHERE vouchers.id = voucher_entries.voucher_id 
    AND vouchers.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM vouchers 
    WHERE vouchers.id = voucher_entries.voucher_id 
    AND vouchers.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own voucher entries"
  ON voucher_entries FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vouchers 
    WHERE vouchers.id = voucher_entries.voucher_id 
    AND vouchers.user_id = auth.uid()
  ));

-- Create ledger_transactions table
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES chart_of_accounts(id) ON DELETE CASCADE NOT NULL,
  voucher_id uuid REFERENCES vouchers(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  debit numeric(15, 2) DEFAULT 0,
  credit numeric(15, 2) DEFAULT 0,
  balance numeric(15, 2) DEFAULT 0,
  narration text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledger transactions"
  ON ledger_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ledger transactions"
  ON ledger_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create payment_terms_master table
CREATE TABLE IF NOT EXISTS payment_terms_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  days integer NOT NULL DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_terms_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment terms"
  ON payment_terms_master FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payment terms"
  ON payment_terms_master FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payment terms"
  ON payment_terms_master FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own payment terms"
  ON payment_terms_master FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create tax_rates_master table
CREATE TABLE IF NOT EXISTS tax_rates_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  rate numeric(5, 2) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tax_rates_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tax rates"
  ON tax_rates_master FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tax rates"
  ON tax_rates_master FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tax rates"
  ON tax_rates_master FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tax rates"
  ON tax_rates_master FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create bank_accounts_master table
CREATE TABLE IF NOT EXISTS bank_accounts_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_holder_name text NOT NULL,
  ifsc_code text,
  branch text,
  balance numeric(15, 2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bank_accounts_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank accounts"
  ON bank_accounts_master FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bank accounts"
  ON bank_accounts_master FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bank accounts"
  ON bank_accounts_master FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bank accounts"
  ON bank_accounts_master FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create cost_centers table
CREATE TABLE IF NOT EXISTS cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, code)
);

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cost centers"
  ON cost_centers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cost centers"
  ON cost_centers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cost centers"
  ON cost_centers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cost centers"
  ON cost_centers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_user_id ON chart_of_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_account_group_id ON chart_of_accounts(account_group_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_user_id ON vouchers(user_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_voucher_date ON vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_voucher_type_id ON vouchers(voucher_type_id);
CREATE INDEX IF NOT EXISTS idx_voucher_entries_voucher_id ON voucher_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_entries_account_id ON voucher_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_user_id ON ledger_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_account_id ON ledger_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_transaction_date ON ledger_transactions(transaction_date);

-- Function to update account balance
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chart_of_accounts
    SET current_balance = current_balance + NEW.debit - NEW.credit,
        updated_at = now()
    WHERE id = NEW.account_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE chart_of_accounts
    SET current_balance = current_balance - OLD.debit + OLD.credit,
        updated_at = now()
    WHERE id = OLD.account_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update account balance on ledger transaction
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR DELETE ON ledger_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- Function to create ledger transactions from voucher entries
CREATE OR REPLACE FUNCTION create_ledger_from_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_voucher FROM vouchers WHERE id = NEW.voucher_id;
    
    IF v_voucher.status = 'posted' THEN
      INSERT INTO ledger_transactions (
        user_id, account_id, voucher_id, transaction_date, 
        debit, credit, narration
      ) VALUES (
        v_voucher.user_id, NEW.account_id, NEW.voucher_id, v_voucher.voucher_date,
        NEW.debit_amount, NEW.credit_amount, COALESCE(NEW.narration, v_voucher.narration)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create ledger transactions from voucher entries
CREATE TRIGGER trigger_create_ledger_from_voucher
  AFTER INSERT ON voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_ledger_from_voucher();
