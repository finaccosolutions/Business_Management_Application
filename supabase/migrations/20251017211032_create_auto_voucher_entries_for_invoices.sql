/*
  # Auto-Create Voucher Entries for Invoices

  ## Summary
  Automatically create accounting voucher entries when invoices are created or updated.
  This ensures invoices properly affect the chart of accounts and ledger balances.

  ## Changes
  1. Create trigger function to auto-generate voucher and voucher entries for new invoices
  2. Create double-entry bookkeeping entries:
     - Debit: Customer Account (Accounts Receivable)
     - Credit: Income Account (Revenue)
  3. Update ledger_transactions table to reflect the accounting entries

  ## Accounting Logic
  When an invoice is created:
  - Customer Account is DEBITED (they owe us money)
  - Income Account is CREDITED (we earned revenue)
  
  When an invoice is paid:
  - Bank/Cash Account is DEBITED (we received money)
  - Customer Account is CREDITED (they no longer owe us)
*/

-- Function to auto-create voucher entries for invoices
CREATE OR REPLACE FUNCTION auto_create_voucher_for_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher_id uuid;
  v_voucher_number text;
  v_voucher_type_id uuid;
  v_max_number integer;
BEGIN
  -- Only create voucher if invoice has both income and customer accounts
  IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL THEN
    
    -- Get or create Sales voucher type
    SELECT id INTO v_voucher_type_id
    FROM voucher_types
    WHERE user_id = NEW.user_id 
      AND LOWER(name) = 'sales'
    LIMIT 1;
    
    -- If no sales voucher type exists, skip voucher creation
    IF v_voucher_type_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Generate voucher number
    SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '\d+$') AS INTEGER)), 0) INTO v_max_number
    FROM vouchers
    WHERE user_id = NEW.user_id AND voucher_type_id = v_voucher_type_id;
    
    v_voucher_number := 'SALES-' || LPAD((v_max_number + 1)::text, 5, '0');
    
    -- Create the voucher
    INSERT INTO vouchers (
      user_id,
      voucher_type_id,
      voucher_number,
      voucher_date,
      reference_number,
      narration,
      total_amount,
      status,
      invoice_id,
      created_by
    ) VALUES (
      NEW.user_id,
      v_voucher_type_id,
      v_voucher_number,
      COALESCE(NEW.invoice_date, CURRENT_DATE),
      NEW.invoice_number,
      'Invoice ' || NEW.invoice_number,
      NEW.total_amount,
      'approved',
      NEW.id,
      NEW.user_id
    )
    RETURNING id INTO v_voucher_id;
    
    -- Create debit entry (Customer owes us - Accounts Receivable)
    INSERT INTO voucher_entries (
      voucher_id,
      account_id,
      debit_amount,
      credit_amount,
      narration
    ) VALUES (
      v_voucher_id,
      NEW.customer_account_id,
      NEW.total_amount,
      0,
      'Invoice ' || NEW.invoice_number
    );
    
    -- Create credit entry (Revenue earned - Income)
    INSERT INTO voucher_entries (
      voucher_id,
      account_id,
      debit_amount,
      credit_amount,
      narration
    ) VALUES (
      v_voucher_id,
      NEW.income_account_id,
      0,
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number
    );
    
    -- Create ledger transactions for both accounts
    -- Debit customer account
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      NEW.user_id,
      NEW.customer_account_id,
      v_voucher_id,
      COALESCE(NEW.invoice_date, CURRENT_DATE),
      NEW.total_amount,
      0,
      'Invoice ' || NEW.invoice_number
    );
    
    -- Credit income account
    INSERT INTO ledger_transactions (
      user_id,
      account_id,
      voucher_id,
      transaction_date,
      debit,
      credit,
      narration
    ) VALUES (
      NEW.user_id,
      NEW.income_account_id,
      v_voucher_id,
      COALESCE(NEW.invoice_date, CURRENT_DATE),
      0,
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number
    );
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the invoice creation
    RAISE WARNING 'Failed to create voucher for invoice %: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new invoices
DROP TRIGGER IF EXISTS trigger_auto_create_voucher_for_invoice ON invoices;

CREATE TRIGGER trigger_auto_create_voucher_for_invoice
  AFTER INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_voucher_for_invoice();

-- Update existing trigger to handle invoice updates
CREATE OR REPLACE FUNCTION auto_update_voucher_for_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_voucher_id uuid;
BEGIN
  -- If invoice amounts changed and voucher exists, update it
  IF (OLD.total_amount != NEW.total_amount OR 
      OLD.income_account_id != NEW.income_account_id OR 
      OLD.customer_account_id != NEW.customer_account_id) THEN
    
    -- Find existing voucher for this invoice
    SELECT id INTO v_voucher_id
    FROM vouchers
    WHERE invoice_id = NEW.id
    LIMIT 1;
    
    IF v_voucher_id IS NOT NULL THEN
      -- Update voucher amount
      UPDATE vouchers
      SET total_amount = NEW.total_amount,
          updated_at = NOW()
      WHERE id = v_voucher_id;
      
      -- Update voucher entries if accounts changed
      IF NEW.customer_account_id IS NOT NULL AND NEW.income_account_id IS NOT NULL THEN
        -- Delete old entries
        DELETE FROM voucher_entries WHERE voucher_id = v_voucher_id;
        
        -- Create new debit entry
        INSERT INTO voucher_entries (
          voucher_id,
          account_id,
          debit_amount,
          credit_amount,
          narration
        ) VALUES (
          v_voucher_id,
          NEW.customer_account_id,
          NEW.total_amount,
          0,
          'Invoice ' || NEW.invoice_number
        );
        
        -- Create new credit entry
        INSERT INTO voucher_entries (
          voucher_id,
          account_id,
          debit_amount,
          credit_amount,
          narration
        ) VALUES (
          v_voucher_id,
          NEW.income_account_id,
          0,
          NEW.total_amount,
          'Invoice ' || NEW.invoice_number
        );
        
        -- Update ledger transactions
        DELETE FROM ledger_transactions WHERE voucher_id = v_voucher_id;
        
        INSERT INTO ledger_transactions (
          user_id,
          account_id,
          voucher_id,
          transaction_date,
          debit,
          credit,
          narration
        ) VALUES 
        (
          NEW.user_id,
          NEW.customer_account_id,
          v_voucher_id,
          COALESCE(NEW.invoice_date, CURRENT_DATE),
          NEW.total_amount,
          0,
          'Invoice ' || NEW.invoice_number
        ),
        (
          NEW.user_id,
          NEW.income_account_id,
          v_voucher_id,
          COALESCE(NEW.invoice_date, CURRENT_DATE),
          0,
          NEW.total_amount,
          'Invoice ' || NEW.invoice_number
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to update voucher for invoice %: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice updates
DROP TRIGGER IF EXISTS trigger_auto_update_voucher_for_invoice ON invoices;

CREATE TRIGGER trigger_auto_update_voucher_for_invoice
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_voucher_for_invoice();
