/*
  # Create Missing Default Accounts for Existing Users

  ## Problem
  Some users don't have the default "Sales Income" and "Accounts Receivable" accounts
  that are needed for invoice ledger posting. They only have customer-specific accounts.

  ## Solution
  1. Create default account groups (Income, Current Assets) if missing
  2. Create default "Sales Income" ledger account for income posting
  3. Create default "Accounts Receivable" ledger account for customer receivables
  4. Map all existing invoices to these default accounts
  5. Post all mapped invoices to ledger_transactions

  ## Changes
  1. Ensure all users have Income and Current Assets groups
  2. Create Sales Income and Accounts Receivable ledger accounts
  3. Map and post all existing invoices
*/

-- ============================================================================
-- Step 1: Create Account Groups for All Users
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_income_group_id uuid;
  v_asset_group_id uuid;
BEGIN
  FOR v_user IN SELECT id FROM auth.users LOOP
    
    -- Create Income group if missing
    SELECT id INTO v_income_group_id
    FROM account_groups
    WHERE user_id = v_user.id AND account_type = 'income'
    LIMIT 1;
    
    IF v_income_group_id IS NULL THEN
      INSERT INTO account_groups (user_id, name, account_type, description, is_active, display_order)
      VALUES (
        v_user.id,
        'Income',
        'income',
        'Income from sales and services',
        true,
        10
      )
      RETURNING id INTO v_income_group_id;
      RAISE NOTICE 'Created Income group for user %', v_user.id;
    END IF;
    
    -- Create Current Assets group if missing
    SELECT id INTO v_asset_group_id
    FROM account_groups
    WHERE user_id = v_user.id AND account_type = 'asset' AND name = 'Current Assets'
    LIMIT 1;
    
    IF v_asset_group_id IS NULL THEN
      INSERT INTO account_groups (user_id, name, account_type, description, is_active, display_order)
      VALUES (
        v_user.id,
        'Current Assets',
        'asset',
        'Assets that can be converted to cash within a year',
        true,
        1
      )
      RETURNING id INTO v_asset_group_id;
      RAISE NOTICE 'Created Current Assets group for user %', v_user.id;
    END IF;
    
  END LOOP;
END $$;

-- ============================================================================
-- Step 2: Create Default Ledger Accounts
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_income_group_id uuid;
  v_asset_group_id uuid;
  v_account_code text;
BEGIN
  FOR v_user IN SELECT id FROM auth.users LOOP
    
    -- Get Income group
    SELECT id INTO v_income_group_id
    FROM account_groups
    WHERE user_id = v_user.id AND account_type = 'income'
    LIMIT 1;
    
    -- Get Current Assets group
    SELECT id INTO v_asset_group_id
    FROM account_groups
    WHERE user_id = v_user.id AND account_type = 'asset'
    LIMIT 1;
    
    -- Create "Sales Income" account if missing
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE user_id = v_user.id AND account_name = 'Sales Income'
    ) THEN
      -- Generate account code (4000 range for income)
      SELECT COALESCE(
        'INC-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(account_code FROM 'INC-([0-9]+)') AS INTEGER)), 0) + 1)::text, 4, '0'),
        'INC-0001'
      )
      INTO v_account_code
      FROM chart_of_accounts
      WHERE user_id = v_user.id AND account_code LIKE 'INC-%';
      
      INSERT INTO chart_of_accounts (
        user_id,
        account_code,
        account_name,
        account_group_id,
        opening_balance,
        current_balance,
        description,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_user.id,
        v_account_code,
        'Sales Income',
        v_income_group_id,
        0,
        0,
        'Default income account for sales and services',
        true,
        now(),
        now()
      );
      RAISE NOTICE 'Created Sales Income account (%) for user %', v_account_code, v_user.id;
    END IF;
    
    -- Create "Accounts Receivable" account if missing
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE user_id = v_user.id AND account_name = 'Accounts Receivable'
    ) THEN
      -- Generate account code (1000 range for current assets)
      SELECT COALESCE(
        'AR-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(account_code FROM 'AR-([0-9]+)') AS INTEGER)), 0) + 1)::text, 4, '0'),
        'AR-0001'
      )
      INTO v_account_code
      FROM chart_of_accounts
      WHERE user_id = v_user.id AND account_code LIKE 'AR-%';
      
      INSERT INTO chart_of_accounts (
        user_id,
        account_code,
        account_name,
        account_group_id,
        opening_balance,
        current_balance,
        description,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_user.id,
        v_account_code,
        'Accounts Receivable',
        v_asset_group_id,
        0,
        0,
        'Default account for customer receivables',
        true,
        now(),
        now()
      );
      RAISE NOTICE 'Created Accounts Receivable account (%) for user %', v_account_code, v_user.id;
    END IF;
    
  END LOOP;
END $$;

-- ============================================================================
-- Step 3: Map All Existing Invoices to Default Accounts
-- ============================================================================

UPDATE invoices i
SET
  income_account_id = (
    SELECT id FROM chart_of_accounts
    WHERE user_id = i.user_id 
    AND account_name = 'Sales Income'
    LIMIT 1
  ),
  customer_account_id = (
    SELECT id FROM chart_of_accounts
    WHERE user_id = i.user_id 
    AND account_name = 'Accounts Receivable'
    LIMIT 1
  )
WHERE income_account_id IS NULL OR customer_account_id IS NULL;

-- ============================================================================
-- Step 4: Post All Non-Draft Invoices to Ledger
-- ============================================================================

-- Clear existing invoice transactions to avoid duplicates
DELETE FROM ledger_transactions
WHERE voucher_id IS NULL
  AND (narration LIKE '%Invoice%' OR narration LIKE '%invoice%');

-- Post all non-draft invoices with proper mappings
DO $$
DECLARE
  v_invoice RECORD;
BEGIN
  FOR v_invoice IN
    SELECT * FROM invoices
    WHERE status != 'draft'
      AND income_account_id IS NOT NULL
      AND customer_account_id IS NOT NULL
  LOOP
    -- Debit: Customer Account (Accounts Receivable)
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      v_invoice.user_id,
      v_invoice.customer_account_id,
      NULL,
      v_invoice.invoice_date,
      v_invoice.total_amount,
      0,
      'Invoice ' || v_invoice.invoice_number || ' - Customer receivable'
    );
    
    -- Credit: Income Account (Sales Income)
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      v_invoice.user_id,
      v_invoice.income_account_id,
      NULL,
      v_invoice.invoice_date,
      0,
      v_invoice.total_amount,
      'Invoice ' || v_invoice.invoice_number || ' - Service income'
    );
    
    RAISE NOTICE 'Posted invoice % to ledger', v_invoice.invoice_number;
  END LOOP;
END $$;

-- ============================================================================
-- Step 5: Update All Account Balances
-- ============================================================================

UPDATE chart_of_accounts coa
SET current_balance = (
  SELECT
    COALESCE(coa.opening_balance, 0) +
    COALESCE(SUM(lt.debit), 0) -
    COALESCE(SUM(lt.credit), 0)
  FROM ledger_transactions lt
  WHERE lt.account_id = coa.id
);

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Created default account groups for all users';
  RAISE NOTICE '✓ Created Sales Income and Accounts Receivable accounts';
  RAISE NOTICE '✓ Mapped all invoices to default accounts';
  RAISE NOTICE '✓ Posted all non-draft invoices to ledger';
  RAISE NOTICE '✓ Updated all account balances';
  RAISE NOTICE '✓ Ledgers and reports should now show data';
  RAISE NOTICE '========================================';
END $$;
