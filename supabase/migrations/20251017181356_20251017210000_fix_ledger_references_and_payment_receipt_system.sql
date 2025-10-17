/*
  # Fix Ledger References and Enhance Payment/Receipt System

  ## Summary
  Complete overhaul of payment/receipt voucher system with automatic ledger selection

  ## Changes Made
  
  ### 1. Invoice and Services Tables
  - Rename ledger_id columns to account_id to match chart_of_accounts
  - Update foreign key references
  
  ### 2. Customer Ledger Integration
  - Rename customer.ledger_id to customer.account_id
  
  ### 3. Company Settings
  - Ensure default_payment_receipt_type field exists with proper values
  
  ### 4. Auto Receipt on Invoice Payment
  - Create trigger to automatically generate receipt voucher when invoice marked as paid
  - Use customer account and configured cash/bank account
  
  ### 5. Security
  - Maintain all existing RLS policies
  
  ## Important Notes
  - Payment vouchers: Cash/Bank is always CREDIT (money going out)
  - Receipt vouchers: Cash/Bank is always DEBIT (money coming in)
  - System auto-selects cash or bank based on settings.default_payment_receipt_type
*/

-- Step 1: Add account_id to customers if not exists (rename from ledger_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'ledger_id'
  ) THEN
    ALTER TABLE customers RENAME COLUMN ledger_id TO account_id;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN account_id uuid REFERENCES chart_of_accounts(id);
  END IF;
END $$;

-- Step 2: Update invoices table ledger columns to account columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'income_ledger_id'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN income_ledger_id TO income_account_id;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'income_account_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN income_account_id uuid REFERENCES chart_of_accounts(id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'customer_ledger_id'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN customer_ledger_id TO customer_account_id;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'customer_account_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN customer_account_id uuid REFERENCES chart_of_accounts(id);
  END IF;
END $$;

-- Step 3: Update services table ledger column to account column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'services' AND column_name = 'income_ledger_id'
  ) THEN
    ALTER TABLE services RENAME COLUMN income_ledger_id TO income_account_id;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'services' AND column_name = 'income_account_id'
  ) THEN
    ALTER TABLE services ADD COLUMN income_account_id uuid REFERENCES chart_of_accounts(id);
  END IF;
END $$;

-- Step 4: Ensure company_settings has all required fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'default_cash_ledger_id'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_cash_ledger_id uuid REFERENCES chart_of_accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'default_bank_ledger_id'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_bank_ledger_id uuid REFERENCES chart_of_accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'default_income_ledger_id'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_income_ledger_id uuid REFERENCES chart_of_accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'default_payment_receipt_type'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN default_payment_receipt_type text DEFAULT 'cash' CHECK (default_payment_receipt_type IN ('cash', 'bank'));
  END IF;
END $$;

-- Step 5: Create/Update auto-invoice trigger with correct column names (only if recurring_service_instances exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_service_instances') THEN
    DROP TRIGGER IF EXISTS auto_create_invoice_on_period_completion ON recurring_service_instances;
  END IF;
END $$;

DROP FUNCTION IF EXISTS auto_create_invoice_on_period_completion();

CREATE OR REPLACE FUNCTION auto_create_invoice_on_period_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_work_record RECORD;
  v_service_record RECORD;
  v_customer_record RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_max_number integer;
  v_settings_record RECORD;
  v_income_account_id uuid;
  v_customer_account_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_subtotal numeric;
  v_tax_amount numeric;
  v_total numeric;
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') AND NEW.auto_invoice = true THEN

    SELECT * INTO v_work_record FROM works WHERE id = NEW.work_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    SELECT * INTO v_service_record FROM services WHERE id = v_work_record.service_id;
    SELECT * INTO v_customer_record FROM customers WHERE id = v_work_record.customer_id;
    SELECT * INTO v_settings_record FROM company_settings WHERE user_id = v_work_record.user_id LIMIT 1;

    IF v_service_record.income_account_id IS NOT NULL THEN
      v_income_account_id := v_service_record.income_account_id;
    ELSIF v_settings_record.default_income_ledger_id IS NOT NULL THEN
      v_income_account_id := v_settings_record.default_income_ledger_id;
    END IF;

    v_customer_account_id := v_customer_record.account_id;
    v_price := COALESCE(v_work_record.billing_amount, v_service_record.default_price, 0);
    v_tax_rate := COALESCE(v_service_record.tax_rate, 0);
    v_subtotal := v_price;
    v_tax_amount := v_subtotal * v_tax_rate / 100;
    v_total := v_subtotal + v_tax_amount;

    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_max_number
    FROM invoices WHERE user_id = v_work_record.user_id;

    v_invoice_number := COALESCE(v_settings_record.invoice_prefix, 'INV-') || LPAD((v_max_number + 1)::text, 5, '0');

    INSERT INTO invoices (
      user_id, customer_id, work_id, invoice_number, invoice_date, due_date,
      subtotal, tax_amount, total_amount, status, notes,
      income_account_id, customer_account_id
    ) VALUES (
      v_work_record.user_id, v_work_record.customer_id, v_work_record.id,
      v_invoice_number, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
      v_subtotal, v_tax_amount, v_total, 'pending',
      'Auto-generated for ' || v_service_record.name || ' - Period: ' || NEW.period_start_date || ' to ' || NEW.period_end_date,
      v_income_account_id, v_customer_account_id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, tax_rate)
    VALUES (
      v_invoice_id,
      v_service_record.name || ' (' || NEW.period_start_date || ' to ' || NEW.period_end_date || ')',
      1, v_price, v_price, v_tax_rate
    );

    NEW.invoice_id := v_invoice_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-apply trigger if recurring_service_instances table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recurring_service_instances') THEN
    EXECUTE 'CREATE TRIGGER auto_create_invoice_on_period_completion
      BEFORE UPDATE ON recurring_service_instances
      FOR EACH ROW
      EXECUTE FUNCTION auto_create_invoice_on_period_completion()';
  END IF;
END $$;

-- Step 6: Create auto receipt voucher when invoice is marked as paid
DROP TRIGGER IF EXISTS auto_create_receipt_on_invoice_paid ON invoices;
DROP FUNCTION IF EXISTS auto_create_receipt_on_invoice_paid();

CREATE OR REPLACE FUNCTION auto_create_receipt_on_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings_record RECORD;
  v_voucher_type_id uuid;
  v_voucher_number text;
  v_max_number integer;
  v_cash_bank_account_id uuid;
  v_customer_account_id uuid;
  v_voucher_id uuid;
BEGIN
  -- Only trigger when status changes to 'paid'
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    
    -- Get company settings
    SELECT * INTO v_settings_record 
    FROM company_settings 
    WHERE user_id = NEW.user_id 
    LIMIT 1;
    
    IF NOT FOUND THEN 
      RETURN NEW; 
    END IF;

    -- Get receipt voucher type
    SELECT id INTO v_voucher_type_id
    FROM voucher_types
    WHERE user_id = NEW.user_id AND code = 'RECEIPT' AND is_active = true
    LIMIT 1;
    
    IF NOT FOUND THEN 
      RETURN NEW; 
    END IF;

    -- Determine cash or bank account based on settings
    IF v_settings_record.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_account_id := v_settings_record.default_bank_ledger_id;
    ELSE
      v_cash_bank_account_id := v_settings_record.default_cash_ledger_id;
    END IF;

    -- If no cash/bank account configured, skip
    IF v_cash_bank_account_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get customer account
    v_customer_account_id := NEW.customer_account_id;
    
    -- If no customer account, skip
    IF v_customer_account_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Generate voucher number
    SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '[0-9]+$') AS INTEGER)), 0) 
    INTO v_max_number
    FROM vouchers 
    WHERE user_id = NEW.user_id AND voucher_type_id = v_voucher_type_id;

    v_voucher_number := COALESCE(v_settings_record.receipt_prefix, 'RV-') || LPAD((v_max_number + 1)::text, 5, '0');

    -- Create receipt voucher
    INSERT INTO vouchers (
      user_id, voucher_type_id, voucher_number, voucher_date,
      reference_number, narration, total_amount, status, created_by
    ) VALUES (
      NEW.user_id, v_voucher_type_id, v_voucher_number, NEW.invoice_date,
      NEW.invoice_number, 'Auto-generated receipt for Invoice ' || NEW.invoice_number,
      NEW.total_amount, 'posted', NEW.user_id
    ) RETURNING id INTO v_voucher_id;

    -- Create voucher entries
    -- Debit: Cash/Bank (money coming in)
    INSERT INTO voucher_entries (
      voucher_id, account_id, debit_amount, credit_amount, narration
    ) VALUES (
      v_voucher_id, v_cash_bank_account_id, NEW.total_amount, 0,
      'Receipt from customer - Invoice ' || NEW.invoice_number
    );

    -- Credit: Customer Account (reducing receivable)
    INSERT INTO voucher_entries (
      voucher_id, account_id, debit_amount, credit_amount, narration
    ) VALUES (
      v_voucher_id, v_customer_account_id, 0, NEW.total_amount,
      'Payment received for Invoice ' || NEW.invoice_number
    );

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_create_receipt_on_invoice_paid
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_receipt_on_invoice_paid();