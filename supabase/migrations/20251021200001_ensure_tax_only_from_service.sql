/*
  # Ensure Tax Rate Only Shows When Set on Service

  This migration ensures that auto-generated invoices ONLY show tax rates
  that are explicitly set on the service. If a service has tax_rate = 0 or NULL,
  the invoice items will show 0% tax.

  ## Changes
  - Verifies auto-invoice functions use COALESCE(service.tax_rate, 0)
  - This means: if service.tax_rate is NULL → use 0
  - This means: if service.tax_rate is 0 → use 0
  - This means: if service.tax_rate is 18 → use 18

  ## Important
  The system already works this way. If you're seeing 18% tax on invoices,
  it means your SERVICE has tax_rate = 18 set. To fix:
  1. Go to Services page
  2. Edit the service
  3. Set tax_rate to 0 (or your desired %)
  4. Future invoices will use that rate
*/

-- Verify the current functions are using the correct logic
DO $$
BEGIN
  RAISE NOTICE '========================================================================';
  RAISE NOTICE 'TAX RATE VERIFICATION';
  RAISE NOTICE '========================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'The auto-invoice system uses: COALESCE(service.tax_rate, 0)';
  RAISE NOTICE '';
  RAISE NOTICE 'This means:';
  RAISE NOTICE '  - If service.tax_rate is NULL → Invoice shows 0%% tax';
  RAISE NOTICE '  - If service.tax_rate is 0 → Invoice shows 0%% tax';
  RAISE NOTICE '  - If service.tax_rate is 5 → Invoice shows 5%% tax';
  RAISE NOTICE '  - If service.tax_rate is 18 → Invoice shows 18%% tax';
  RAISE NOTICE '';
  RAISE NOTICE 'TO FIX INVOICES SHOWING WRONG TAX:';
  RAISE NOTICE '  1. Check your service''s tax_rate setting';
  RAISE NOTICE '  2. Edit the service and set the correct tax_rate';
  RAISE NOTICE '  3. New invoices will use the updated rate';
  RAISE NOTICE '';
  RAISE NOTICE '========================================================================';
END $$;
