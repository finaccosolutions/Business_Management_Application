/*
  # Auto-Create Default Company Settings on User Signup

  ## Overview
  Automatically creates a default company_settings record when a new user signs up.
  This ensures every user has a company_settings record ready to be populated.

  ## Changes
  1. Create trigger function to initialize default company settings
  2. Add trigger to auth.users AFTER INSERT
  3. Function creates company_settings with sensible defaults based on user's country

  ## Important Notes
  - This trigger runs AFTER profile creation trigger
  - Uses user's country from profile to set appropriate defaults
  - All fields are nullable/have defaults, so partial data is acceptable
  - Includes proper error handling to not block user signup
*/

-- Create function to initialize company settings for new users
CREATE OR REPLACE FUNCTION public.initialize_company_settings()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_country text;
  v_tax_label text;
  v_currency text;
  v_currency_symbol text;
BEGIN
  -- Get user's country from profile (defaults to IN if not found)
  SELECT country INTO v_country
  FROM profiles
  WHERE id = NEW.id;
  
  v_country := COALESCE(v_country, 'IN');
  
  -- Set defaults based on country
  CASE v_country
    WHEN 'US' THEN
      v_tax_label := 'Tax ID';
      v_currency := 'USD';
      v_currency_symbol := '$';
    WHEN 'GB', 'UK' THEN
      v_tax_label := 'VAT';
      v_currency := 'GBP';
      v_currency_symbol := '£';
    WHEN 'CA' THEN
      v_tax_label := 'GST/HST';
      v_currency := 'CAD';
      v_currency_symbol := '$';
    WHEN 'AU' THEN
      v_tax_label := 'ABN';
      v_currency := 'AUD';
      v_currency_symbol := '$';
    WHEN 'AE' THEN
      v_tax_label := 'TRN';
      v_currency := 'AED';
      v_currency_symbol := 'د.إ';
    WHEN 'SG' THEN
      v_tax_label := 'GST';
      v_currency := 'SGD';
      v_currency_symbol := '$';
    WHEN 'NZ' THEN
      v_tax_label := 'NZBN';
      v_currency := 'NZD';
      v_currency_symbol := '$';
    WHEN 'MY' THEN
      v_tax_label := 'SST';
      v_currency := 'MYR';
      v_currency_symbol := 'RM';
    ELSE
      v_tax_label := 'GST';
      v_currency := 'INR';
      v_currency_symbol := '₹';
  END CASE;
  
  -- Create default company settings
  INSERT INTO company_settings (
    user_id,
    country,
    tax_label,
    currency,
    currency_symbol,
    invoice_prefix,
    payment_prefix,
    receipt_prefix,
    journal_prefix,
    contra_prefix,
    credit_note_prefix,
    debit_note_prefix,
    invoice_notes,
    default_payment_receipt_type
  )
  VALUES (
    NEW.id,
    v_country,
    v_tax_label,
    v_currency,
    v_currency_symbol,
    'INV',
    'PAY',
    'RCT',
    'JV',
    'CNT',
    'CN',
    'DN',
    'Thank you for your business!',
    'cash'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent user creation
    RAISE WARNING 'Error creating default company settings for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on auth.users (should fire after all other signup triggers)
DROP TRIGGER IF EXISTS on_auth_user_created_company_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_company_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_company_settings();

-- Grant necessary permissions
GRANT ALL ON public.company_settings TO service_role;
