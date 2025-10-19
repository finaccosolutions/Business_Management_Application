/*
  # Fix Ledger Posting Function - Correct Voucher Column References
  
  ## Problem
  - post_invoice_to_ledger_transactions() was using reference_type and reference_id columns
  - But vouchers table actually has invoice_id column directly
  - Also missing notes column, uses narration instead
  
  ## Solution
  - Update function to use correct column names: invoice_id instead of reference_type/reference_id
  - Use narration instead of notes
  - Use reference_number instead of custom fields
*/

CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_voucher_id uuid;
  v_voucher_number text;
  v_sales_voucher_type_id uuid;
  v_existing_voucher_id uuid;
BEGIN
  -- Only post to ledger when:
  -- 1. Status is 'sent', 'paid', or 'overdue' (not draft)
  -- 2. Both income_account_id and customer_account_id are NOT NULL
  -- 3. Total amount > 0
  -- 4. This is either INSERT or status changed from previous value
  
  IF NEW.status IN ('sent', 'paid', 'overdue') AND
     (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != NEW.status)) AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL AND
     NEW.total_amount > 0 THEN

    -- Check if voucher already exists for this invoice
    SELECT id INTO v_existing_voucher_id
    FROM vouchers
    WHERE invoice_id = NEW.id
    LIMIT 1;

    IF v_existing_voucher_id IS NOT NULL THEN
      RAISE NOTICE 'Voucher already exists for invoice %, skipping duplicate posting', NEW.invoice_number;
      RETURN NEW;
    END IF;

    -- Get Sales voucher type
    SELECT id INTO v_sales_voucher_type_id
    FROM voucher_types
    WHERE user_id = NEW.user_id
      AND voucher_category = 'sales'
      AND is_active = true
    LIMIT 1;

    IF v_sales_voucher_type_id IS NULL THEN
      RAISE WARNING 'No active Sales voucher type found for user %, cannot post invoice % to ledger', NEW.user_id, NEW.invoice_number;
      RETURN NEW;
    END IF;

    -- Generate voucher number
    v_voucher_number := generate_next_voucher_number(NEW.user_id, v_sales_voucher_type_id);

    -- Create voucher with correct column names
    INSERT INTO vouchers (
      user_id,
      voucher_type_id,
      voucher_number,
      voucher_date,
      reference_number,
      invoice_id,
      narration,
      total_amount,
      status
    ) VALUES (
      NEW.user_id,
      v_sales_voucher_type_id,
      v_voucher_number,
      NEW.invoice_date,
      NEW.invoice_number,
      NEW.id,
      'Auto-generated for Invoice: ' || NEW.invoice_number,
      NEW.total_amount,
      'approved'
    ) RETURNING id INTO v_voucher_id;

    -- Debit: Customer Account (Asset increase)
    INSERT INTO voucher_entries (
      voucher_id,
      account_id,
      entry_type,
      amount,
      description
    ) VALUES (
      v_voucher_id,
      NEW.customer_account_id,
      'debit',
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number || ' - Customer Receivable'
    );

    -- Credit: Income Account (Revenue increase)
    INSERT INTO voucher_entries (
      voucher_id,
      account_id,
      entry_type,
      amount,
      description
    ) VALUES (
      v_voucher_id,
      NEW.income_account_id,
      'credit',
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number || ' - Service Revenue'
    );

    -- Create ledger transactions
    -- Debit: Customer Account
    INSERT INTO ledger_transactions (
      account_id,
      voucher_id,
      transaction_date,
      description,
      debit_amount,
      credit_amount,
      balance
    )
    SELECT
      NEW.customer_account_id,
      v_voucher_id,
      NEW.invoice_date,
      'Invoice ' || NEW.invoice_number || ' - Customer Receivable',
      NEW.total_amount,
      0,
      COALESCE((
        SELECT balance FROM ledger_transactions 
        WHERE account_id = NEW.customer_account_id 
        ORDER BY transaction_date DESC, created_at DESC 
        LIMIT 1
      ), 0) + NEW.total_amount;

    -- Credit: Income Account
    INSERT INTO ledger_transactions (
      account_id,
      voucher_id,
      transaction_date,
      description,
      debit_amount,
      credit_amount,
      balance
    )
    SELECT
      NEW.income_account_id,
      v_voucher_id,
      NEW.invoice_date,
      'Invoice ' || NEW.invoice_number || ' - Service Revenue',
      0,
      NEW.total_amount,
      COALESCE((
        SELECT balance FROM ledger_transactions 
        WHERE account_id = NEW.income_account_id 
        ORDER BY transaction_date DESC, created_at DESC 
        LIMIT 1
      ), 0) + NEW.total_amount;

    RAISE NOTICE 'Posted invoice % to ledger with voucher %', NEW.invoice_number, v_voucher_number;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION post_invoice_to_ledger_transactions IS 
  'Posts invoice to ledger_transactions and creates voucher when status changes to sent/paid/overdue. Uses invoice_id column in vouchers table. Requires both income and customer accounts mapped.';

-- Trigger already exists, no need to recreate
