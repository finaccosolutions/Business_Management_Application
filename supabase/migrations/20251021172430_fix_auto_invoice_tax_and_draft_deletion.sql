/*
  # Fix Auto-Invoice Tax Calculation and Draft Status Ledger Deletion

  ## Issues Fixed

  ### 1. Auto-Invoice Tax Calculation
  **Problem**: Auto-generated invoices always use 18% tax even when service has no tax or different tax rate.
  **Root Cause**: `auto_create_invoice_on_all_tasks_complete()` function hardcodes:
    - `tax_amount = v_price * 0.18` (line 221)
    - `total_amount = v_price * 1.18` (line 222)
    - `tax_rate = 18.00` in invoice_items (line 245)

  **Solution**: Use the service's `tax_rate` column from the database:
    - Fetch service's tax_rate (defaults to 0 if NULL)
    - Calculate tax_amount = v_price * (tax_rate / 100)
    - Calculate total_amount = v_price + tax_amount
    - Use actual tax_rate in invoice_items

  ### 2. Draft Status Ledger Deletion
  **Problem**: When invoice status changes back to 'draft', ledger entries may not be removed.
  **Current Implementation**: Already has two deletion strategies but needs verification
  **Enhancement**: Add additional cleanup for invoice_id reference in ledger transactions

  ## Changes Made

  1. **Modified `auto_create_invoice_on_all_tasks_complete()` function**:
     - Added `v_tax_rate` variable to store service's tax_rate
     - Fetch tax_rate from services table (COALESCE to 0)
     - Calculate tax_amount dynamically: `v_price * (v_tax_rate / 100)`
     - Calculate total_amount dynamically: `v_price + v_tax_amount`
     - Use actual tax_rate in invoice_items insert

  2. **Enhanced `handle_invoice_status_change()` function**:
     - Added cleanup for ledger transactions with invoice_id reference
     - Ensures complete removal of all invoice-related ledger entries
     - Maintains existing two-strategy approach (narration + account matching)

  ## Testing Scenarios

  ### Tax Calculation:
  - Service with 0% tax → Invoice total = 1500 (no tax)
  - Service with 18% tax → Invoice total = 1770 (1500 + 270)
  - Service with 5% tax → Invoice total = 1575 (1500 + 75)
  - Service with NULL tax → Invoice total = 1500 (defaults to 0%)

  ### Draft Status:
  - Invoice status: sent → draft = Remove ALL ledger entries
  - Invoice status: paid → draft = Remove receipts AND invoice ledger entries
  - Invoice status: cancelled → draft = Remove ALL entries
*/

-- ============================================================================
-- PART 1: Fix Auto-Invoice Tax Calculation
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_invoice_on_all_tasks_complete ON recurring_period_tasks;
DROP FUNCTION IF EXISTS auto_create_invoice_on_all_tasks_complete CASCADE;

CREATE OR REPLACE FUNCTION auto_create_invoice_on_all_tasks_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_id uuid;
  v_instance_record RECORD;
  v_work_record RECORD;
  v_invoice_number TEXT;
  v_invoice_exists BOOLEAN;
  v_invoice_id uuid;
  v_price numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_all_completed boolean;
BEGIN
  -- Only run on UPDATE when status changes to completed
  IF TG_OP != 'UPDATE' OR NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_period_id := NEW.work_recurring_instance_id;

  -- Check if ALL tasks are now completed
  SELECT NOT EXISTS (
    SELECT 1 FROM recurring_period_tasks
    WHERE work_recurring_instance_id = v_period_id
    AND status != 'completed'
  ) INTO v_all_completed;

  -- If not all tasks completed, exit
  IF NOT v_all_completed THEN
    RETURN NEW;
  END IF;

  -- Get the period instance
  SELECT * INTO v_instance_record
  FROM work_recurring_instances
  WHERE id = v_period_id;

  -- Check if invoice already generated
  IF v_instance_record.invoice_generated = true THEN
    RETURN NEW;
  END IF;

  -- Get work details with customer, service info, and tax_rate
  SELECT
    w.*,
    s.name as service_name,
    s.default_price,
    COALESCE(s.tax_rate, 0) as service_tax_rate,
    c.name as customer_name,
    COALESCE(cs.price, s.default_price) as final_price
  INTO v_work_record
  FROM works w
  JOIN services s ON w.service_id = s.id
  JOIN customers c ON w.customer_id = c.id
  LEFT JOIN customer_services cs ON cs.customer_id = w.customer_id AND cs.service_id = w.service_id
  WHERE w.id = v_instance_record.work_id;

  -- Check if auto_bill is enabled
  IF NOT COALESCE(v_work_record.auto_bill, false) THEN
    RETURN NEW;
  END IF;

  -- Check if invoice already exists for this period
  SELECT EXISTS (
    SELECT 1 FROM invoices
    WHERE work_id = v_instance_record.work_id
    AND work_recurring_instance_id = v_period_id
  ) INTO v_invoice_exists;

  IF v_invoice_exists THEN
    -- Mark as generated to prevent future attempts
    UPDATE work_recurring_instances
    SET invoice_generated = true
    WHERE id = v_period_id;
    RETURN NEW;
  END IF;

  -- Use customer-specific price or default service price
  v_price := COALESCE(v_work_record.final_price, 0);

  -- Get tax rate from service (defaults to 0 if NULL)
  v_tax_rate := COALESCE(v_work_record.service_tax_rate, 0);

  -- Calculate tax amount and total
  v_tax_amount := ROUND(v_price * (v_tax_rate / 100), 2);
  v_total_amount := v_price + v_tax_amount;

  -- Generate invoice number
  SELECT generate_invoice_number(v_work_record.user_id) INTO v_invoice_number;

  RAISE NOTICE '→ Creating auto-invoice: price=%, tax_rate=%, tax_amount=%, total=%',
    v_price, v_tax_rate, v_tax_amount, v_total_amount;

  -- Create the invoice
  INSERT INTO invoices (
    user_id,
    customer_id,
    work_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total_amount,
    status,
    work_recurring_instance_id,
    notes
  )
  VALUES (
    v_work_record.user_id,
    v_work_record.customer_id,
    v_instance_record.work_id,
    v_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    v_price,
    v_tax_amount,
    v_total_amount,
    'draft',
    v_period_id,
    'Auto-generated for ' || v_instance_record.period_name
  )
  RETURNING id INTO v_invoice_id;

  -- Create invoice item with correct tax_rate
  INSERT INTO invoice_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    amount,
    tax_rate,
    service_id
  )
  VALUES (
    v_invoice_id,
    v_work_record.service_name || ' - ' || v_instance_record.period_name,
    1,
    v_price,
    v_price,
    v_tax_rate,
    v_work_record.service_id
  );

  -- Mark invoice as generated on period
  UPDATE work_recurring_instances
  SET
    invoice_generated = true,
    invoice_id = v_invoice_id,
    is_billed = true,
    billing_amount = v_total_amount
  WHERE id = v_period_id;

  RAISE NOTICE '✓ Created invoice % with tax_rate=%, subtotal=%, tax=%, total=%',
    v_invoice_number, v_tax_rate, v_price, v_tax_amount, v_total_amount;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_auto_invoice_on_all_tasks_complete
  AFTER UPDATE ON recurring_period_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_invoice_on_all_tasks_complete();

COMMENT ON FUNCTION auto_create_invoice_on_all_tasks_complete IS
  'Auto-creates invoice when all period tasks completed.
   Uses service.tax_rate (defaults to 0%) instead of hardcoded 18%.
   Calculates: tax_amount = price * (tax_rate / 100), total = price + tax_amount';

-- ============================================================================
-- PART 2: Enhanced Draft Status - Ensure Complete Ledger Cleanup
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_handle_invoice_status_change ON invoices;
DROP FUNCTION IF EXISTS handle_invoice_status_change CASCADE;

CREATE OR REPLACE FUNCTION handle_invoice_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_status TEXT;
  v_settings RECORD;
  v_receipt_type RECORD;
  v_customer RECORD;
  v_voucher_id UUID;
  v_voucher_number TEXT;
  v_max_number INTEGER;
  v_cash_bank_ledger_id UUID;
  v_customer_account_id UUID;
  v_receipt_voucher_id UUID;
  v_existing_count INTEGER;
  v_deleted_count INTEGER;
BEGIN
  -- Get old status (handle INSERT case)
  v_old_status := COALESCE(OLD.status, 'draft');

  -- Skip if status hasn't changed
  IF TG_OP = 'UPDATE' AND NEW.status = v_old_status THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE '========================================================================';
  RAISE NOTICE '→ Invoice % status change: % → %', NEW.invoice_number, v_old_status, NEW.status;
  RAISE NOTICE '========================================================================';

  -- ==========================================================================
  -- CASE 1: Status changed TO 'draft' - CLEAN EVERYTHING FIRST
  -- ==========================================================================
  IF NEW.status = 'draft' AND v_old_status != 'draft' THEN

    RAISE NOTICE '→ Cleaning all entries for invoice % (reverting to draft)', NEW.invoice_number;

    -- Delete ALL receipt vouchers for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      -- Delete ledger entries
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted ledger entries for receipt voucher %', v_receipt_voucher_id;

      -- Delete voucher entries
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted voucher entries for receipt voucher %', v_receipt_voucher_id;

      -- Delete voucher
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    -- Delete invoice ledger entries - Strategy 1: By narration pattern
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '  ✓ Deleted % invoice ledger entries (by narration)', v_deleted_count;

    -- Delete invoice ledger entries - Strategy 2: By account_id and date
    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          (account_id = NEW.customer_account_id AND debit = NEW.total_amount AND credit = 0)
          OR
          (account_id = NEW.income_account_id AND debit = 0 AND credit = NEW.total_amount)
        );

      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '  ✓ Deleted % additional invoice ledger entries (by account)', v_deleted_count;
    END IF;

    -- Delete invoice ledger entries - Strategy 3: By invoice_id if column exists
    -- (Some implementations may store invoice_id in ledger_transactions)
    BEGIN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND invoice_id = NEW.id;

      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      IF v_deleted_count > 0 THEN
        RAISE NOTICE '  ✓ Deleted % invoice ledger entries (by invoice_id)', v_deleted_count;
      END IF;
    EXCEPTION
      WHEN undefined_column THEN
        -- invoice_id column doesn't exist, skip this strategy
        NULL;
    END;

    RAISE NOTICE '✓ Cleaned all entries for invoice % (status → draft)', NEW.invoice_number;

  END IF;

  -- ==========================================================================
  -- CASE 2: Status changed TO 'cancelled' - CLEAN EVERYTHING
  -- ==========================================================================
  IF NEW.status = 'cancelled' AND v_old_status != 'cancelled' THEN

    RAISE NOTICE '→ Cancelling invoice % - cleaning all entries', NEW.invoice_number;

    -- Delete ALL receipt vouchers
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    -- Delete invoice ledger entries - all strategies
    DELETE FROM ledger_transactions
    WHERE user_id = NEW.user_id
      AND voucher_id IS NULL
      AND narration LIKE '%Invoice ' || NEW.invoice_number || '%';

    IF NEW.customer_account_id IS NOT NULL OR NEW.income_account_id IS NOT NULL THEN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          (account_id = NEW.customer_account_id AND debit = NEW.total_amount AND credit = 0)
          OR
          (account_id = NEW.income_account_id AND debit = 0 AND credit = NEW.total_amount)
        );
    END IF;

    BEGIN
      DELETE FROM ledger_transactions
      WHERE user_id = NEW.user_id AND invoice_id = NEW.id;
    EXCEPTION
      WHEN undefined_column THEN NULL;
    END;

    RAISE NOTICE '✓ Cancelled invoice % - all entries deleted', NEW.invoice_number;

  END IF;

  -- ==========================================================================
  -- CASE 3: Status changed FROM 'paid' to something else (but not draft/cancelled)
  -- ==========================================================================
  IF NEW.status NOT IN ('paid', 'draft', 'cancelled') AND v_old_status = 'paid' THEN

    RAISE NOTICE '→ Status changed from paid to % - deleting receipts', NEW.status;

    -- Delete ALL receipt vouchers for this invoice
    FOR v_receipt_voucher_id IN
      SELECT id FROM vouchers WHERE user_id = NEW.user_id AND invoice_id = NEW.id
    LOOP
      DELETE FROM ledger_transactions WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM voucher_entries WHERE voucher_id = v_receipt_voucher_id;
      DELETE FROM vouchers WHERE id = v_receipt_voucher_id;
      RAISE NOTICE '  ✓ Deleted receipt voucher %', v_receipt_voucher_id;
    END LOOP;

    RAISE NOTICE '✓ Deleted receipts for invoice % (status: paid → %)', NEW.invoice_number, NEW.status;

  END IF;

  -- ==========================================================================
  -- CASE 4: Status is NOT 'draft' and NOT 'cancelled' - Ensure Posted to Ledger
  -- ==========================================================================
  IF NEW.status NOT IN ('draft', 'cancelled') THEN

    -- Only post if accounts are mapped
    IF NEW.income_account_id IS NOT NULL AND NEW.customer_account_id IS NOT NULL THEN

      -- Check if already posted (prevent duplicates)
      SELECT COUNT(*) INTO v_existing_count
      FROM ledger_transactions
      WHERE user_id = NEW.user_id
        AND voucher_id IS NULL
        AND transaction_date = NEW.invoice_date
        AND (
          (account_id = NEW.customer_account_id AND debit = NEW.total_amount AND credit = 0)
          OR
          (account_id = NEW.income_account_id AND debit = 0 AND credit = NEW.total_amount)
        );

      IF v_existing_count = 0 THEN

        RAISE NOTICE '→ Posting invoice % to ledger', NEW.invoice_number;

        -- Debit: Customer Account (Accounts Receivable)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.customer_account_id, NULL, NEW.invoice_date,
          NEW.total_amount, 0,
          'Invoice ' || NEW.invoice_number || ' - Customer receivable',
          NOW()
        );

        -- Credit: Income Account (Revenue)
        INSERT INTO ledger_transactions (
          user_id, account_id, voucher_id, transaction_date,
          debit, credit, narration, created_at
        ) VALUES (
          NEW.user_id, NEW.income_account_id, NULL, NEW.invoice_date,
          0, NEW.total_amount,
          'Invoice ' || NEW.invoice_number || ' - Service income',
          NOW()
        );

        RAISE NOTICE '✓ Posted invoice % to ledger (Debit: Customer, Credit: Income)', NEW.invoice_number;

      ELSE
        RAISE NOTICE '⚠ Invoice % already posted to ledger', NEW.invoice_number;
      END IF;

    ELSE
      RAISE NOTICE '⚠ Invoice % missing ledger mappings (income: %, customer: %)',
        NEW.invoice_number, NEW.income_account_id, NEW.customer_account_id;
    END IF;

  END IF;

  -- ==========================================================================
  -- CASE 5: Status changed TO 'paid' - Create Receipt Voucher
  -- ==========================================================================
  IF NEW.status = 'paid' AND v_old_status != 'paid' THEN

    RAISE NOTICE '→ Creating receipt voucher for invoice %', NEW.invoice_number;

    -- Get company settings
    SELECT * INTO v_settings
    FROM company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Get customer details
    SELECT * INTO v_customer
    FROM customers
    WHERE id = NEW.customer_id
    LIMIT 1;

    IF v_settings IS NULL THEN
      RAISE WARNING '✗ Company settings not found for user %', NEW.user_id;
      RETURN NEW;
    END IF;

    IF v_customer IS NULL THEN
      RAISE WARNING '✗ Customer not found: %', NEW.customer_id;
      RETURN NEW;
    END IF;

    -- Determine cash/bank ledger from settings
    IF v_settings.default_payment_receipt_type = 'bank' THEN
      v_cash_bank_ledger_id := v_settings.default_bank_ledger_id;
      RAISE NOTICE '  Using bank ledger: %', v_cash_bank_ledger_id;
    ELSE
      v_cash_bank_ledger_id := v_settings.default_cash_ledger_id;
      RAISE NOTICE '  Using cash ledger: %', v_cash_bank_ledger_id;
    END IF;

    -- Get customer account (prefer customer.account_id, fallback to invoice.customer_account_id)
    v_customer_account_id := COALESCE(v_customer.account_id, NEW.customer_account_id);
    RAISE NOTICE '  Customer account: %', v_customer_account_id;

    -- Update customer.account_id if missing
    IF v_customer.account_id IS NULL AND NEW.customer_account_id IS NOT NULL THEN
      UPDATE customers
      SET account_id = NEW.customer_account_id
      WHERE id = NEW.customer_id;
      v_customer_account_id := NEW.customer_account_id;
      RAISE NOTICE '  Updated customer account mapping';
    END IF;

    IF v_customer_account_id IS NULL THEN
      RAISE WARNING '✗ Customer % missing account_id', v_customer.name;
      RETURN NEW;
    END IF;

    IF v_cash_bank_ledger_id IS NULL THEN
      RAISE WARNING '✗ No cash/bank ledger configured in company settings';
      RETURN NEW;
    END IF;

    -- Get receipt voucher type
    SELECT * INTO v_receipt_type
    FROM voucher_types
    WHERE user_id = NEW.user_id
      AND (code = 'ITMRCT' OR code = 'RV' OR code = 'RECEIPT' OR name ILIKE '%receipt%')
      AND is_active = true
    ORDER BY
      CASE
        WHEN code = 'ITMRCT' THEN 1
        WHEN code = 'RV' THEN 2
        WHEN code = 'RECEIPT' THEN 3
        ELSE 4
      END
    LIMIT 1;

    IF v_receipt_type.id IS NULL THEN
      RAISE WARNING '✗ No active receipt voucher type found';
      RETURN NEW;
    END IF;

    RAISE NOTICE '  Using voucher type: % (%)', v_receipt_type.name, v_receipt_type.code;

    -- Check if receipt already exists
    SELECT id INTO v_receipt_voucher_id
    FROM vouchers
    WHERE user_id = NEW.user_id
      AND invoice_id = NEW.id
      AND voucher_type_id = v_receipt_type.id
    LIMIT 1;

    IF v_receipt_voucher_id IS NOT NULL THEN
      RAISE NOTICE '⚠ Receipt already exists for invoice %', NEW.invoice_number;
      RETURN NEW;
    END IF;

    -- Generate voucher number
    SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM '[0-9]+$') AS INTEGER)), 0)
    INTO v_max_number
    FROM vouchers
    WHERE user_id = NEW.user_id AND voucher_type_id = v_receipt_type.id;

    v_voucher_number := COALESCE(v_settings.receipt_prefix, 'RV-') ||
                       LPAD((v_max_number + 1)::text, COALESCE(v_settings.receipt_number_width, 5), '0');

    RAISE NOTICE '  Generated receipt number: %', v_voucher_number;

    -- Create receipt voucher with status = 'posted'
    INSERT INTO vouchers (
      user_id, voucher_type_id, voucher_number, voucher_date,
      reference_number, narration, total_amount, status,
      invoice_id, created_by, created_at
    ) VALUES (
      NEW.user_id, v_receipt_type.id, v_voucher_number, CURRENT_DATE,
      NEW.invoice_number,
      'Receipt for Invoice ' || NEW.invoice_number || ' - ' || v_customer.name,
      NEW.total_amount, 'posted',
      NEW.id, NEW.user_id, NOW()
    ) RETURNING id INTO v_voucher_id;

    RAISE NOTICE '  ✓ Created receipt voucher %', v_voucher_id;

    -- Create voucher entries
    INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, narration)
    VALUES
      (v_voucher_id, v_cash_bank_ledger_id, NEW.total_amount, 0,
       'Receipt from ' || v_customer.name),
      (v_voucher_id, v_customer_account_id, 0, NEW.total_amount,
       'Payment received for Invoice ' || NEW.invoice_number);

    RAISE NOTICE '  ✓ Created voucher entries';

    -- Post immediately to ledger
    INSERT INTO ledger_transactions (
      user_id, account_id, voucher_id, transaction_date,
      debit, credit, narration, created_at
    ) VALUES
      (NEW.user_id, v_cash_bank_ledger_id, v_voucher_id, CURRENT_DATE,
       NEW.total_amount, 0, 'Receipt from ' || v_customer.name, NOW()),
      (NEW.user_id, v_customer_account_id, v_voucher_id, CURRENT_DATE,
       0, NEW.total_amount, 'Payment received for Invoice ' || NEW.invoice_number, NOW());

    RAISE NOTICE '  ✓ Posted to ledger (Debit: Cash/Bank, Credit: Customer)';
    RAISE NOTICE '✓ Created receipt % for invoice %', v_voucher_number, NEW.invoice_number;

  END IF;

  RAISE NOTICE '========================================================================';
  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error in invoice % status change: %', NEW.invoice_number, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger
CREATE TRIGGER trigger_handle_invoice_status_change
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION handle_invoice_status_change();

COMMENT ON FUNCTION handle_invoice_status_change IS
  'Complete invoice status management with enhanced draft deletion (3 strategies):
   - Status → draft: Deletes ALL receipts and invoice ledger entries
   - Status → cancelled: Deletes ALL entries
   - Status paid → sent: Deletes receipt vouchers (keeps invoice entries)
   - Status NOT draft/cancelled: Posts invoice to ledger
   - Status → paid: Creates receipt voucher with ledger entries

   Draft deletion uses:
   1. Narration pattern matching
   2. Account+amount+date matching
   3. invoice_id reference matching (if column exists)';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '✓✓✓ MIGRATION COMPLETE ✓✓✓';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. ✓ FIXED AUTO-INVOICE TAX CALCULATION';
  RAISE NOTICE '   - Now uses service.tax_rate field (defaults to 0%)';
  RAISE NOTICE '   - No more hardcoded 18% tax';
  RAISE NOTICE '   - Correctly calculates: tax = price * (rate/100), total = price + tax';
  RAISE NOTICE '';
  RAISE NOTICE '2. ✓ ENHANCED DRAFT STATUS LEDGER DELETION';
  RAISE NOTICE '   - Uses 3 deletion strategies for complete cleanup';
  RAISE NOTICE '   - Removes ALL receipts and invoice ledger entries';
  RAISE NOTICE '   - Ensures clean revert to draft status';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'Test with:';
  RAISE NOTICE '- Service with 0% tax → Invoice total = price (no tax added)';
  RAISE NOTICE '- Service with 18% tax → Invoice total = price * 1.18';
  RAISE NOTICE '- Invoice status draft → All ledger entries removed';
  RAISE NOTICE '========================================================================';
END $$;
