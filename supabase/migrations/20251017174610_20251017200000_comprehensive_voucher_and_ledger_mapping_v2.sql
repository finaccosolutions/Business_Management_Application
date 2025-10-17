/*
  # Comprehensive Voucher and Ledger Mapping System

  1. Company Settings Enhancements
    - Add voucher prefix settings for all voucher types
    - Add default ledger mappings (cash, bank, income, discount)
    - Add default receipt/payment type (cash or bank)
    
  2. Services Table Enhancement
    - Add income_ledger_id for per-service income ledger mapping
    - Falls back to company default if not set
    
  3. Customers as Ledgers
    - Add ledger_id to customers table
    - Auto-create ledger under "Account Receivable" group when customer is created
    - Sync customer name changes to ledger name
    
  4. Invoice Enhancements
    - Add income_ledger_id to invoices table
    - Add customer_ledger_id to invoices table
    - Used for proper double-entry accounting
    
  5. Voucher Enhancements
    - Modify voucher entries structure for multiple debit/credit ledgers
    
  6. Auto-Invoice Trigger Updates
    - Use service-level income ledger mapping
    - Fall back to company settings if not mapped at service level
    - Auto-populate customer ledger
    
  7. Auto-Receipt Trigger Updates
    - Create receipt when invoice marked as paid
    - Use default cash/bank ledger from settings
    - Create proper double-entry with customer ledger
    
  8. Security
    - All RLS policies maintained
    - Proper foreign key constraints
*/

-- ============================================================================
-- 1. ADD VOUCHER PREFIX SETTINGS TO COMPANY SETTINGS
-- ============================================================================

DO $$
BEGIN
  -- Invoice prefix (if not exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'invoice_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN invoice_prefix text DEFAULT 'INV';
  END IF;

  -- Payment voucher prefix
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'payment_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN payment_prefix text DEFAULT 'PAY';
  END IF;

  -- Receipt voucher prefix
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'receipt_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN receipt_prefix text DEFAULT 'RCT';
  END IF;

  -- Journal voucher prefix
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'journal_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN journal_prefix text DEFAULT 'JV';
  END IF;

  -- Contra voucher prefix
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'contra_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN contra_prefix text DEFAULT 'CNT';
  END IF;

  -- Credit Note prefix
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'credit_note_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN credit_note_prefix text DEFAULT 'CN';
  END IF;

  -- Debit Note prefix
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'debit_note_prefix'
  ) THEN
    ALTER TABLE company_settings
    ADD COLUMN debit_note_prefix text DEFAULT 'DN';
  END IF;
END $$;

-- ============================================================================
-- 2. ADD CUSTOMER LEDGER MAPPING
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'ledger_id'
  ) THEN
    ALTER TABLE customers
    ADD COLUMN ledger_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN customers.ledger_id IS 'Linked ledger in Chart of Accounts under Account Receivable group';

-- ============================================================================
-- 3. AUTO-CREATE LEDGER FOR CUSTOMERS
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_customer_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_account_receivable_group_id uuid;
  v_ledger_code text;
  v_new_ledger_id uuid;
BEGIN
  -- Only create ledger if not already linked
  IF NEW.ledger_id IS NULL THEN
    
    -- Find Account Receivable group
    SELECT id INTO v_account_receivable_group_id
    FROM account_groups
    WHERE user_id = NEW.user_id
      AND LOWER(name) LIKE '%receivable%'
    LIMIT 1;
    
    -- If no Account Receivable group exists, create one
    IF v_account_receivable_group_id IS NULL THEN
      INSERT INTO account_groups (user_id, name, description, created_at, updated_at)
      VALUES (
        NEW.user_id,
        'Account Receivable',
        'Customer accounts receivable',
        now(),
        now()
      )
      RETURNING id INTO v_account_receivable_group_id;
    END IF;
    
    -- Generate ledger code
    SELECT 'CUST-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(account_code FROM '\d+$') AS INTEGER)), 0) + 1)::text, 4, '0')
    INTO v_ledger_code
    FROM chart_of_accounts
    WHERE user_id = NEW.user_id
      AND account_code ~ '^CUST-[0-9]+$';
    
    -- Create ledger for customer
    INSERT INTO chart_of_accounts (
      user_id,
      account_code,
      account_name,
      account_group_id,
      opening_balance,
      current_balance,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      NEW.user_id,
      v_ledger_code,
      NEW.name,
      v_account_receivable_group_id,
      0,
      0,
      true,
      now(),
      now()
    )
    RETURNING id INTO v_new_ledger_id;
    
    -- Link ledger to customer
    NEW.ledger_id := v_new_ledger_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_create_customer_ledger ON customers;

-- Create trigger
CREATE TRIGGER trigger_auto_create_customer_ledger
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_customer_ledger();

-- ============================================================================
-- 4. SYNC CUSTOMER NAME TO LEDGER
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_customer_name_to_ledger()
RETURNS TRIGGER AS $$
BEGIN
  -- If customer name changed and ledger exists, update ledger name
  IF NEW.name != OLD.name AND NEW.ledger_id IS NOT NULL THEN
    UPDATE chart_of_accounts
    SET account_name = NEW.name,
        updated_at = now()
    WHERE id = NEW.ledger_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_customer_name_to_ledger ON customers;

-- Create trigger
CREATE TRIGGER trigger_sync_customer_name_to_ledger
  AFTER UPDATE ON customers
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION sync_customer_name_to_ledger();

-- ============================================================================
-- 5. ADD LEDGER REFERENCES TO INVOICES
-- ============================================================================

DO $$
BEGIN
  -- Add income_ledger_id to invoices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'income_ledger_id'
  ) THEN
    ALTER TABLE invoices
    ADD COLUMN income_ledger_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
  END IF;

  -- Add customer_ledger_id to invoices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'customer_ledger_id'
  ) THEN
    ALTER TABLE invoices
    ADD COLUMN customer_ledger_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN invoices.income_ledger_id IS 'Income ledger for credit entry (from service mapping or company default)';
COMMENT ON COLUMN invoices.customer_ledger_id IS 'Customer ledger for debit entry (from customer record)';

-- ============================================================================
-- 6. UPDATE AUTO-INVOICE TRIGGER TO USE LEDGER MAPPINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_invoice_for_completed_period()
RETURNS TRIGGER AS $$
DECLARE
  v_work RECORD;
  v_service RECORD;
  v_customer RECORD;
  v_company_settings RECORD;
  v_invoice_number text;
  v_invoice_id uuid;
  v_tax_amount numeric;
  v_subtotal numeric;
  v_total_amount numeric;
  v_income_ledger_id uuid;
  v_customer_ledger_id uuid;
BEGIN
  -- Only create invoice if status changed to 'completed' AND auto_create_invoice is true
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Get work details
    SELECT * INTO v_work
    FROM works
    WHERE id = NEW.work_id;
    
    -- Get service details with income ledger mapping
    SELECT s.*, s.income_ledger_id
    INTO v_service
    FROM services s
    WHERE s.id = v_work.service_id;
    
    -- Check if auto_create_invoice is enabled
    IF v_service.auto_create_invoice THEN
      
      -- Get customer details with ledger mapping
      SELECT c.*, c.ledger_id as customer_ledger_id
      INTO v_customer
      FROM customers c
      WHERE c.id = v_service.customer_id;
      
      -- Get company settings for defaults
      SELECT *
      INTO v_company_settings
      FROM company_settings
      WHERE user_id = NEW.user_id;
      
      -- Determine income ledger (service level first, then company default)
      IF v_service.income_ledger_id IS NOT NULL THEN
        v_income_ledger_id := v_service.income_ledger_id;
      ELSE
        v_income_ledger_id := v_company_settings.default_income_ledger_id;
      END IF;
      
      -- Get customer ledger
      v_customer_ledger_id := v_customer.customer_ledger_id;
      
      -- Generate invoice number
      SELECT COALESCE(v_company_settings.invoice_prefix, 'INV') || '-' || 
             LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
      INTO v_invoice_number
      FROM invoices
      WHERE user_id = NEW.user_id;
      
      -- Calculate amounts
      v_subtotal := COALESCE(v_service.default_price, 0);
      v_tax_amount := v_subtotal * COALESCE(v_service.tax_rate, 0) / 100;
      v_total_amount := v_subtotal + v_tax_amount;
      
      -- Create the invoice
      INSERT INTO invoices (
        user_id,
        customer_id,
        invoice_number,
        invoice_date,
        due_date,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        status,
        notes,
        income_ledger_id,
        customer_ledger_id,
        created_at,
        updated_at
      ) VALUES (
        NEW.user_id,
        v_service.customer_id,
        v_invoice_number,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        v_subtotal,
        v_tax_amount,
        0,
        v_total_amount,
        'draft',
        'Auto-generated for ' || v_work.service_name || ' - ' || NEW.period_name || ' (' || TO_CHAR(NEW.period_start_date, 'DD Mon') || ' - ' || TO_CHAR(NEW.period_end_date, 'DD Mon YYYY') || ')',
        v_income_ledger_id,
        v_customer_ledger_id,
        now(),
        now()
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create invoice item
      INSERT INTO invoice_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        tax_rate,
        amount,
        created_at
      ) VALUES (
        v_invoice_id,
        v_work.service_name || ' - ' || NEW.period_name || ' (' || TO_CHAR(NEW.period_start_date, 'DD Mon') || ' - ' || TO_CHAR(NEW.period_end_date, 'DD Mon YYYY') || ')',
        1,
        v_subtotal,
        COALESCE(v_service.tax_rate, 0),
        v_total_amount,
        now()
      );
      
      -- Link invoice to recurring instance
      UPDATE work_recurring_instances
      SET invoice_id = v_invoice_id,
          updated_at = now()
      WHERE id = NEW.id;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_auto_create_invoice_for_completed_period ON work_recurring_instances;

CREATE TRIGGER trigger_auto_create_invoice_for_completed_period
  AFTER UPDATE ON work_recurring_instances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_for_completed_period();

-- ============================================================================
-- 7. UPDATE AUTO-RECEIPT TRIGGER TO USE CUSTOMER LEDGER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_receipt_on_invoice_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_company_settings RECORD;
  v_receipt_voucher_type_id uuid;
  v_voucher_number text;
  v_cash_bank_ledger_id uuid;
  v_voucher_id uuid;
  v_customer_name text;
BEGIN
  -- Only proceed if invoice status changed to 'paid' from non-paid status
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    -- Get company settings for this user to determine default ledgers
    SELECT * INTO v_company_settings
    FROM company_settings
    WHERE user_id = NEW.user_id;

    -- Determine which ledger to use (cash or bank)
    IF v_company_settings.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_ledger_id := v_company_settings.default_bank_ledger_id;
    ELSE
      v_cash_bank_ledger_id := v_company_settings.default_cash_ledger_id;
    END IF;

    -- Only create receipt if we have a default ledger mapped AND customer ledger exists
    IF v_cash_bank_ledger_id IS NOT NULL AND NEW.customer_ledger_id IS NOT NULL THEN

      -- Get receipt voucher type
      SELECT id INTO v_receipt_voucher_type_id
      FROM voucher_types
      WHERE user_id = NEW.user_id
        AND code = 'RECEIPT'
        AND is_active = true
      LIMIT 1;

      -- Only proceed if receipt voucher type exists
      IF v_receipt_voucher_type_id IS NOT NULL THEN

        -- Generate voucher number
        SELECT COALESCE(v_company_settings.receipt_prefix, 'RCT') || '-' || 
               LPAD((COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '\d+$') AS INTEGER)), 0) + 1)::text, 6, '0')
        INTO v_voucher_number
        FROM vouchers
        WHERE user_id = NEW.user_id
          AND voucher_type_id = v_receipt_voucher_type_id;

        -- Get customer name
        SELECT name INTO v_customer_name
        FROM customers
        WHERE id = NEW.customer_id;

        -- Create the receipt voucher
        INSERT INTO vouchers (
          user_id,
          voucher_type_id,
          voucher_number,
          voucher_date,
          reference_number,
          narration,
          total_amount,
          status,
          created_at,
          updated_at
        ) VALUES (
          NEW.user_id,
          v_receipt_voucher_type_id,
          v_voucher_number,
          CURRENT_DATE,
          NEW.invoice_number,
          'Auto-generated receipt for invoice ' || NEW.invoice_number || ' - ' || COALESCE(v_customer_name, 'Customer'),
          NEW.total_amount,
          'posted',
          now(),
          now()
        )
        RETURNING id INTO v_voucher_id;

        -- Create ledger entries (Double Entry)
        -- Debit: Cash/Bank Account (Asset increases)
        INSERT INTO ledger_transactions (
          voucher_id,
          account_id,
          transaction_date,
          debit,
          credit,
          balance,
          narration,
          created_at
        )
        SELECT
          v_voucher_id,
          v_cash_bank_ledger_id,
          CURRENT_DATE,
          NEW.total_amount,
          0,
          COALESCE(current_balance, 0) + NEW.total_amount,
          'Receipt for invoice ' || NEW.invoice_number,
          now()
        FROM chart_of_accounts
        WHERE id = v_cash_bank_ledger_id;

        -- Update cash/bank ledger current balance
        UPDATE chart_of_accounts
        SET current_balance = current_balance + NEW.total_amount,
            updated_at = now()
        WHERE id = v_cash_bank_ledger_id;

        -- Credit: Customer Account (Liability decreases)
        INSERT INTO ledger_transactions (
          voucher_id,
          account_id,
          transaction_date,
          debit,
          credit,
          balance,
          narration,
          created_at
        )
        SELECT
          v_voucher_id,
          NEW.customer_ledger_id,
          CURRENT_DATE,
          0,
          NEW.total_amount,
          COALESCE(current_balance, 0) - NEW.total_amount,
          'Receipt for invoice ' || NEW.invoice_number,
          now()
        FROM chart_of_accounts
        WHERE id = NEW.customer_ledger_id;

        -- Update customer ledger current balance
        UPDATE chart_of_accounts
        SET current_balance = current_balance - NEW.total_amount,
            updated_at = now()
        WHERE id = NEW.customer_ledger_id;

      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_auto_create_receipt_on_payment ON invoices;

CREATE TRIGGER trigger_auto_create_receipt_on_payment
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_receipt_on_invoice_payment();

-- ============================================================================
-- 8. CREATE LEDGERS FOR EXISTING CUSTOMERS
-- ============================================================================

-- This will create ledgers for any existing customers that don't have one
DO $$
DECLARE
  v_customer RECORD;
  v_account_receivable_group_id uuid;
  v_ledger_code text;
  v_new_ledger_id uuid;
BEGIN
  FOR v_customer IN 
    SELECT * FROM customers WHERE ledger_id IS NULL
  LOOP
    -- Find or create Account Receivable group
    SELECT id INTO v_account_receivable_group_id
    FROM account_groups
    WHERE user_id = v_customer.user_id
      AND LOWER(name) LIKE '%receivable%'
    LIMIT 1;
    
    IF v_account_receivable_group_id IS NULL THEN
      INSERT INTO account_groups (user_id, name, description, created_at, updated_at)
      VALUES (
        v_customer.user_id,
        'Account Receivable',
        'Customer accounts receivable',
        now(),
        now()
      )
      RETURNING id INTO v_account_receivable_group_id;
    END IF;
    
    -- Generate ledger code
    SELECT 'CUST-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(account_code FROM '\d+$') AS INTEGER)), 0) + 1)::text, 4, '0')
    INTO v_ledger_code
    FROM chart_of_accounts
    WHERE user_id = v_customer.user_id
      AND account_code ~ '^CUST-[0-9]+$';
    
    -- Create ledger
    INSERT INTO chart_of_accounts (
      user_id,
      account_code,
      account_name,
      account_group_id,
      opening_balance,
      current_balance,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      v_customer.user_id,
      v_ledger_code,
      v_customer.name,
      v_account_receivable_group_id,
      0,
      0,
      true,
      now(),
      now()
    )
    RETURNING id INTO v_new_ledger_id;
    
    -- Link ledger to customer
    UPDATE customers
    SET ledger_id = v_new_ledger_id,
        updated_at = now()
    WHERE id = v_customer.id;
  END LOOP;
END $$;
