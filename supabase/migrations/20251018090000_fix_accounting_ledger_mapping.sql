/*
  # Fix Accounting Ledger Mapping and Ensure Data Flow

  ## Problem
  Reports (Trial Balance, Profit & Loss, Balance Sheet, Ledger) show no data because:
  1. Invoices are not mapped to income_account_id and customer_account_id
  2. Without these mappings, invoices don't post to ledger_transactions
  3. Vouchers are not automatically posting to ledger_transactions

  ## Solution
  1. Add default income and customer accounts if they don't exist
  2. Map existing invoices to these accounts
  3. Retroactively post all existing invoices to ledger_transactions
  4. Ensure all future invoices automatically map and post

  ## Changes
  1. Create default "Sales Income" and "Accounts Receivable" ledger accounts
  2. Update invoices table to have income_account_id and customer_account_id
  3. Retroactively post all existing invoices to ledger_transactions
  4. Add trigger to auto-map new invoices
*/

-- ============================================================================
-- Step 1: Ensure Income and Customer Account Groups Exist
-- ============================================================================

-- Create Income group if it doesn't exist
DO $$
BEGIN
  -- For each user, ensure they have an Income group
  INSERT INTO account_groups (user_id, name, account_type, description, is_active, display_order)
  SELECT DISTINCT
    u.id,
    'Sales Income',
    'income',
    'Income from sales and services',
    true,
    10
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM account_groups ag
    WHERE ag.user_id = u.id AND ag.account_type = 'income'
  );
END $$;

-- Create Asset group for Accounts Receivable if it doesn't exist
DO $$
BEGIN
  INSERT INTO account_groups (user_id, name, account_type, description, is_active, display_order)
  SELECT DISTINCT
    u.id,
    'Current Assets',
    'asset',
    'Assets that can be converted to cash within a year',
    true,
    1
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM account_groups ag
    WHERE ag.user_id = u.id AND ag.name = 'Current Assets' AND ag.account_type = 'asset'
  );
END $$;

-- ============================================================================
-- Step 2: Create Default Ledger Accounts for Income and Receivables
-- ============================================================================

-- Create "Sales Income" ledger account for each user
DO $$
DECLARE
  v_user RECORD;
  v_income_group_id uuid;
  v_account_code text;
BEGIN
  FOR v_user IN SELECT id FROM auth.users LOOP
    -- Get the income group for this user
    SELECT id INTO v_income_group_id
    FROM account_groups
    WHERE user_id = v_user.id AND account_type = 'income'
    LIMIT 1;

    -- Generate account code
    SELECT COALESCE(MAX(CAST(account_code AS INTEGER)), 4000) + 1
    INTO v_account_code
    FROM chart_of_accounts
    WHERE user_id = v_user.id;

    -- Create Sales Income account if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE user_id = v_user.id AND account_name = 'Sales Income'
    ) THEN
      INSERT INTO chart_of_accounts (
        user_id,
        account_code,
        account_name,
        account_group_id,
        opening_balance,
        current_balance,
        description,
        is_active
      ) VALUES (
        v_user.id,
        COALESCE(v_account_code::text, '4001'),
        'Sales Income',
        v_income_group_id,
        0,
        0,
        'Income from sales and services',
        true
      );
    END IF;
  END LOOP;
END $$;

-- Create "Accounts Receivable" ledger account for each user
DO $$
DECLARE
  v_user RECORD;
  v_asset_group_id uuid;
  v_account_code text;
BEGIN
  FOR v_user IN SELECT id FROM auth.users LOOP
    -- Get the asset group for this user
    SELECT id INTO v_asset_group_id
    FROM account_groups
    WHERE user_id = v_user.id AND account_type = 'asset'
    LIMIT 1;

    -- Generate account code
    SELECT COALESCE(MAX(CAST(account_code AS INTEGER)), 1000) + 1
    INTO v_account_code
    FROM chart_of_accounts
    WHERE user_id = v_user.id;

    -- Create Accounts Receivable if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE user_id = v_user.id AND account_name = 'Accounts Receivable'
    ) THEN
      INSERT INTO chart_of_accounts (
        user_id,
        account_code,
        account_name,
        account_group_id,
        opening_balance,
        current_balance,
        description,
        is_active
      ) VALUES (
        v_user.id,
        COALESCE(v_account_code::text, '1001'),
        'Accounts Receivable',
        v_asset_group_id,
        0,
        0,
        'Money owed by customers',
        true
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Step 3: Add Account ID Columns to Invoices if Missing
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'income_account_id'
  ) THEN
    ALTER TABLE invoices
    ADD COLUMN income_account_id uuid REFERENCES chart_of_accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'customer_account_id'
  ) THEN
    ALTER TABLE invoices
    ADD COLUMN customer_account_id uuid REFERENCES chart_of_accounts(id);
  END IF;
END $$;

-- ============================================================================
-- Step 4: Map All Existing Invoices to Default Accounts
-- ============================================================================

-- Update all invoices with income and customer account mappings
UPDATE invoices i
SET
  income_account_id = (
    SELECT id FROM chart_of_accounts
    WHERE user_id = i.user_id AND account_name = 'Sales Income'
    LIMIT 1
  ),
  customer_account_id = (
    SELECT id FROM chart_of_accounts
    WHERE user_id = i.user_id AND account_name = 'Accounts Receivable'
    LIMIT 1
  )
WHERE income_account_id IS NULL OR customer_account_id IS NULL;

-- ============================================================================
-- Step 5: Retroactively Post All Existing Invoices to Ledger
-- ============================================================================

-- Delete existing invoice-related ledger entries to avoid duplicates
DELETE FROM ledger_transactions
WHERE voucher_id IS NULL
  AND (narration LIKE '%Invoice%' OR narration LIKE '%invoice%');

-- Post all non-draft invoices to ledger_transactions
INSERT INTO ledger_transactions (
  user_id,
  account_id,
  voucher_id,
  transaction_date,
  debit,
  credit,
  narration
)
SELECT
  i.user_id,
  i.customer_account_id,
  NULL,
  i.invoice_date,
  i.total_amount,
  0,
  'Invoice ' || i.invoice_number || ' - Customer receivable'
FROM invoices i
WHERE i.status != 'draft'
  AND i.income_account_id IS NOT NULL
  AND i.customer_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt
    WHERE lt.user_id = i.user_id
      AND lt.account_id = i.customer_account_id
      AND lt.transaction_date = i.invoice_date
      AND lt.debit = i.total_amount
      AND lt.narration LIKE '%Invoice ' || i.invoice_number || '%'
  );

INSERT INTO ledger_transactions (
  user_id,
  account_id,
  voucher_id,
  transaction_date,
  debit,
  credit,
  narration
)
SELECT
  i.user_id,
  i.income_account_id,
  NULL,
  i.invoice_date,
  0,
  i.total_amount,
  'Invoice ' || i.invoice_number || ' - Service income'
FROM invoices i
WHERE i.status != 'draft'
  AND i.income_account_id IS NOT NULL
  AND i.customer_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt
    WHERE lt.user_id = i.user_id
      AND lt.account_id = i.income_account_id
      AND lt.transaction_date = i.invoice_date
      AND lt.credit = i.total_amount
      AND lt.narration LIKE '%Invoice ' || i.invoice_number || '%'
  );

-- ============================================================================
-- Step 6: Create Trigger to Auto-Map New Invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_map_invoice_accounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-map income account if not set
  IF NEW.income_account_id IS NULL THEN
    SELECT id INTO NEW.income_account_id
    FROM chart_of_accounts
    WHERE user_id = NEW.user_id
      AND account_name = 'Sales Income'
    LIMIT 1;
  END IF;

  -- Auto-map customer account if not set
  IF NEW.customer_account_id IS NULL THEN
    SELECT id INTO NEW.customer_account_id
    FROM chart_of_accounts
    WHERE user_id = NEW.user_id
      AND account_name = 'Accounts Receivable'
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_map_invoice_accounts ON invoices;

CREATE TRIGGER trigger_auto_map_invoice_accounts
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_map_invoice_accounts();

-- ============================================================================
-- Step 7: Update Account Balances Based on Ledger Transactions
-- ============================================================================

-- Recalculate current_balance for all accounts based on ledger_transactions
UPDATE chart_of_accounts coa
SET current_balance = (
  SELECT
    COALESCE(coa.opening_balance, 0) +
    COALESCE(SUM(lt.debit), 0) -
    COALESCE(SUM(lt.credit), 0)
  FROM ledger_transactions lt
  WHERE lt.account_id = coa.id
)
WHERE EXISTS (
  SELECT 1 FROM ledger_transactions lt WHERE lt.account_id = coa.id
);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION auto_map_invoice_accounts IS
  'Automatically maps invoices to default income and customer accounts if not specified. This ensures all invoices are properly posted to the ledger.';

COMMENT ON TRIGGER trigger_auto_map_invoice_accounts ON invoices IS
  'Ensures every invoice is mapped to income and customer accounts before saving.';
