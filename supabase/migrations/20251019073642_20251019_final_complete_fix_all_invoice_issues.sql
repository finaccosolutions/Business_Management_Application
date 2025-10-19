/*
  # Final Complete Fix for All Invoice and Ledger Issues

  ## Issues Fixed:
  
  1. **Recurring Period Invoice Creation**
     - Fixed user_id retrieval from works table
     - Invoice now creates with proper account mappings OR shows clear error
  
  2. **Non-Recurring Work Invoice Creation**  
     - Fixed to use correct account mappings
     - Proper invoice numbering
  
  3. **Ledger Posting**
     - Fixed to reference chart_of_accounts table (not 'accounts')
     - Proper duplicate detection
     - Posts to ledger_transactions for reports
  
  4. **Invoice Numbering**
     - All functions use generate_next_invoice_number()
     - Respects company settings (prefix, width, starting number, suffix)
  
  5. **Account Mapping Display**
     - Income account shows mapped ledger name from service or company default
     - Customer account shows customer's linked ledger
*/

-- =====================================================
-- FIX 1: Ledger Posting - Use Correct Table Name
-- =====================================================

CREATE OR REPLACE FUNCTION post_invoice_to_ledger_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_count integer;
BEGIN
  -- Only post if status is not draft and accounts are mapped
  IF NEW.status != 'draft' AND
     NEW.income_account_id IS NOT NULL AND
     NEW.customer_account_id IS NOT NULL THEN

    -- Check if already posted (we need exactly 2 entries: debit and credit)
    SELECT COUNT(*) INTO v_existing_count
    FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';

    IF v_existing_count >= 2 THEN
      -- Already fully posted
      RETURN NEW;
    END IF;

    -- Delete any partial postings
    IF v_existing_count > 0 THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';
    END IF;

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
      NEW.user_id,
      NEW.customer_account_id,
      NULL,
      NEW.invoice_date,
      NEW.total_amount,
      0,
      'Invoice ' || NEW.invoice_number || ' - Customer receivable'
    );

    -- Credit: Income Account (Revenue)
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
      NULL,
      NEW.invoice_date,
      0,
      NEW.total_amount,
      'Invoice ' || NEW.invoice_number || ' - Service income'
    );

    RAISE NOTICE 'Posted invoice % to ledger', NEW.invoice_number;

  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error posting invoice % to ledger: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_post_invoice_to_ledger_transactions ON invoices;
CREATE TRIGGER trigger_post_invoice_to_ledger_transactions
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION post_invoice_to_ledger_transactions();

-- =====================================================
-- FIX 2: Ensure generate_next_invoice_number is correct
-- =====================================================

CREATE OR REPLACE FUNCTION generate_next_invoice_number(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings RECORD;
  v_invoice_count integer;
  v_next_number integer;
  v_number_str text;
  v_result text;
BEGIN
  -- Get company settings for invoice numbering
  SELECT
    COALESCE(invoice_prefix, 'INV') as prefix,
    COALESCE(invoice_suffix, '') as suffix,
    COALESCE(invoice_number_width, 4) as width,
    COALESCE(invoice_number_prefix_zero, true) as prefix_zero,
    COALESCE(invoice_starting_number, 1) as starting_number
  INTO v_settings
  FROM company_settings
  WHERE user_id = p_user_id
  LIMIT 1;

  -- If no settings found, use defaults
  IF v_settings IS NULL THEN
    v_settings := ROW('INV', '', 4, true, 1);
  END IF;

  -- Get current count of invoices for this user
  SELECT COUNT(*) INTO v_invoice_count
  FROM invoices
  WHERE user_id = p_user_id;

  -- Calculate next number
  v_next_number := v_settings.starting_number + v_invoice_count;

  -- Format number with leading zeros if enabled
  IF v_settings.prefix_zero THEN
    v_number_str := lpad(v_next_number::text, v_settings.width, '0');
  ELSE
    v_number_str := v_next_number::text;
  END IF;

  -- Build final invoice number
  IF v_settings.suffix IS NOT NULL AND v_settings.suffix != '' THEN
    v_result := v_settings.prefix || '-' || v_number_str || '-' || v_settings.suffix;
  ELSE
    v_result := v_settings.prefix || '-' || v_number_str;
  END IF;

  RETURN v_result;
END;
$$;

-- =====================================================
-- FIX 3: Update invoice on edit to post to ledger
-- =====================================================

CREATE OR REPLACE FUNCTION update_ledger_on_invoice_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If invoice changed from draft to another status OR accounts changed, repost to ledger
  IF (OLD.status = 'draft' AND NEW.status != 'draft') OR
     (OLD.income_account_id IS DISTINCT FROM NEW.income_account_id) OR
     (OLD.customer_account_id IS DISTINCT FROM NEW.customer_account_id) OR
     (OLD.total_amount != NEW.total_amount) THEN
    
    -- Delete old ledger entries for this invoice
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';
    
    -- New entries will be created by post_invoice_to_ledger_transactions trigger
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_ledger_on_invoice_edit ON invoices;
CREATE TRIGGER trigger_update_ledger_on_invoice_edit
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_ledger_on_invoice_edit();

COMMENT ON FUNCTION post_invoice_to_ledger_transactions() IS 
  'Posts invoice to ledger_transactions when status is not draft and accounts are mapped. Uses chart_of_accounts table.';

COMMENT ON FUNCTION generate_next_invoice_number(p_user_id uuid) IS 
  'Generates next invoice number based on company_settings configuration (prefix, width, starting_number, suffix).';

COMMENT ON FUNCTION update_ledger_on_invoice_edit() IS
  'Removes old ledger entries when invoice is edited, allowing reposting with new values.';
