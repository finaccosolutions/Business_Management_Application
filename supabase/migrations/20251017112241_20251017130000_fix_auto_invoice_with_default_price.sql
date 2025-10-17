/*
  # Fix Auto-Invoice Generation to Use Service Default Price

  This migration fixes the auto-invoice generation to properly handle cases where
  billing_amount is not explicitly set on the work or recurring instance.

  ## Changes
  1. Updates the auto_generate_invoice_for_period function to:
     - Use period billing_amount if set
     - Fall back to work billing_amount if period amount is null
     - Fall back to service default_price if both are null
     - Only generate invoice if auto_bill is enabled on the work
  
  2. Ensures invoices are automatically created when all tasks in a period are completed

  ## What It Does
  - When all tasks in a recurring period are completed, the period status changes to 'completed'
  - This triggers the auto-invoice function which:
    - Checks if the work has auto_bill enabled
    - Determines the billing amount from period → work → service (in that order)
    - Creates an invoice with proper line items
    - Marks the period as billed
*/

-- Drop and recreate the auto_generate_invoice_for_period function with proper fallback logic
CREATE OR REPLACE FUNCTION public.auto_generate_invoice_for_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_work RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_tax_amount numeric(10, 2);
  v_total_amount numeric(10, 2);
  v_subtotal numeric(10, 2);
  v_tax_rate numeric(5, 2);
  v_auto_bill boolean;
BEGIN
  -- Only proceed if status changed to completed and not already billed
  IF NEW.status = 'completed' AND 
     (OLD.status IS NULL OR OLD.status != 'completed') AND 
     NEW.is_billed = false THEN
    
    -- Get work, customer, and service details
    SELECT 
      w.id as work_id,
      w.user_id,
      w.customer_id,
      w.service_id,
      w.title as work_title,
      w.auto_bill,
      w.billing_amount as work_billing_amount,
      c.name as customer_name,
      s.name as service_name,
      COALESCE(s.tax_rate, 0) as service_tax_rate,
      s.default_price as service_default_price
    INTO v_work
    FROM works w
    JOIN customers c ON w.customer_id = c.id
    JOIN services s ON w.service_id = s.id
    WHERE w.id = NEW.work_id;

    IF v_work IS NULL THEN
      RETURN NEW;
    END IF;

    -- Check if auto_bill is enabled
    v_auto_bill := COALESCE(v_work.auto_bill, false);

    IF NOT v_auto_bill THEN
      -- Auto-billing is not enabled, skip invoice generation
      RETURN NEW;
    END IF;

    -- Determine billing amount: period → work → service default
    v_subtotal := COALESCE(
      NEW.billing_amount,
      v_work.work_billing_amount,
      v_work.service_default_price
    );

    -- If still no billing amount, skip invoice generation
    IF v_subtotal IS NULL OR v_subtotal <= 0 THEN
      RAISE NOTICE 'Skipping invoice generation: no billing amount found for period %', NEW.id;
      RETURN NEW;
    END IF;

    -- Calculate tax and total
    v_tax_rate := v_work.service_tax_rate;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_total_amount := v_subtotal + v_tax_amount;

    -- Generate unique invoice number
    SELECT 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
           LPAD(COALESCE((
             SELECT COUNT(*) + 1
             FROM invoices
             WHERE user_id = v_work.user_id
               AND DATE(created_at) = CURRENT_DATE
           ), 1)::text, 4, '0')
    INTO v_invoice_number;

    -- Create invoice
    INSERT INTO invoices (
      user_id,
      customer_id,
      work_id,
      invoice_number,
      issue_date,
      due_date,
      status,
      subtotal,
      tax_amount,
      discount_amount,
      total_amount,
      notes
    ) VALUES (
      v_work.user_id,
      v_work.customer_id,
      v_work.work_id,
      v_invoice_number,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '30 days',
      'pending',
      v_subtotal,
      v_tax_amount,
      0,
      v_total_amount,
      'Auto-generated for recurring period: ' || NEW.period_name
    )
    RETURNING id INTO v_invoice_id;

    -- Create invoice line item
    INSERT INTO invoice_items (
      invoice_id,
      description,
      quantity,
      unit_price,
      tax_rate,
      amount
    ) VALUES (
      v_invoice_id,
      v_work.service_name || ' - ' || NEW.period_name || ' (' || TO_CHAR(NEW.period_start_date, 'DD Mon') || ' - ' || TO_CHAR(NEW.period_end_date, 'DD Mon YYYY') || ')',
      1,
      v_subtotal,
      v_tax_rate,
      v_subtotal
    );

    -- Update recurring instance with invoice info
    NEW.is_billed := true;
    NEW.invoice_id := v_invoice_id;
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());

    -- Log activity
    BEGIN
      PERFORM log_work_activity(
        NEW.work_id,
        'invoice_generated',
        'Invoice Auto-Generated',
        'Invoice ' || v_invoice_number || ' automatically generated for period: ' || NEW.period_name || ' (Amount: ' || v_total_amount || ')',
        jsonb_build_object(
          'invoice_id', v_invoice_id,
          'invoice_number', v_invoice_number,
          'amount', v_total_amount,
          'period_id', NEW.id,
          'period_name', NEW.period_name
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    RAISE NOTICE 'Invoice % created for period % (Amount: %)', v_invoice_number, NEW.period_name, v_total_amount;
  END IF;

  RETURN NEW;
END;
$function$;
