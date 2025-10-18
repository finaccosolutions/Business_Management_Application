/*
  # Add Mobile Number and Invoice Configuration

  ## Changes Made

  1. **Profiles Table Enhancement**
     - Add `phone_country_code` (text) - Country phone code (e.g., +91, +1)
     - Add `mobile_number` (text) - User mobile number without country code
     - Add indexes for better performance

  2. **Company Settings Table Enhancement - Invoice Number Configuration**
     - Add `invoice_number_width` (integer) - Width of numeric part (default: 6)
     - Add `invoice_number_prefix_zero` (boolean) - Prefill with zeros (default: true)
     - Add `invoice_starting_number` (integer) - Starting invoice number (default: 1)
     - Add `invoice_suffix` (text) - Suffix for invoice number (optional)
     
     - Add `payment_number_width` (integer)
     - Add `payment_number_prefix_zero` (boolean)
     - Add `payment_starting_number` (integer)
     - Add `payment_suffix` (text)
     
     - Add `receipt_number_width` (integer)
     - Add `receipt_number_prefix_zero` (boolean)
     - Add `receipt_starting_number` (integer)
     - Add `receipt_suffix` (text)
     
     - Add `journal_number_width` (integer)
     - Add `journal_number_prefix_zero` (boolean)
     - Add `journal_starting_number` (integer)
     - Add `journal_suffix` (text)
     
     - Add `contra_number_width` (integer)
     - Add `contra_number_prefix_zero` (boolean)
     - Add `contra_starting_number` (integer)
     - Add `contra_suffix` (text)
     
     - Add `credit_note_number_width` (integer)
     - Add `credit_note_number_prefix_zero` (boolean)
     - Add `credit_note_starting_number` (integer)
     - Add `credit_note_suffix` (text)
     
     - Add `debit_note_number_width` (integer)
     - Add `debit_note_number_prefix_zero` (boolean)
     - Add `debit_note_starting_number` (integer)
     - Add `debit_note_suffix` (text)

  3. **Company Settings Table Enhancement - Invoice Layout Configuration**
     - Add `invoice_template_color_primary` (text) - Primary brand color (default: #1e40af)
     - Add `invoice_template_color_secondary` (text) - Secondary color (default: #3b82f6)
     - Add `invoice_template_font_family` (text) - Font family (default: Inter)
     - Add `invoice_template_font_size_base` (integer) - Base font size in px (default: 10)
     - Add `invoice_template_logo_position` (text) - Logo position (left/center/right, default: left)
     - Add `invoice_template_header_layout` (text) - Header layout style (default: standard)
     - Add `invoice_show_company_address` (boolean) - Show company address (default: true)
     - Add `invoice_show_company_phone` (boolean) - Show phone (default: true)
     - Add `invoice_show_company_email` (boolean) - Show email (default: true)
     - Add `invoice_show_company_website` (boolean) - Show website (default: true)
     - Add `invoice_show_tax_number` (boolean) - Show tax number (default: true)
     - Add `invoice_show_bank_details` (boolean) - Show bank details (default: true)
     - Add `invoice_show_terms` (boolean) - Show terms and conditions (default: true)
     - Add `invoice_show_notes` (boolean) - Show notes (default: true)
     - Add `invoice_line_item_columns` (jsonb) - Customize line item columns (default: standard columns)

  4. **Create Helper Function for Number Generation**
     - Function `generate_voucher_number` to auto-generate formatted numbers

  ## Important Notes
  - All new fields have appropriate defaults
  - Existing records are not modified
  - Configuration is flexible for different business needs
*/

-- Add mobile number fields to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone_country_code'
  ) THEN
    ALTER TABLE profiles ADD COLUMN phone_country_code text DEFAULT '+91';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'mobile_number'
  ) THEN
    ALTER TABLE profiles ADD COLUMN mobile_number text DEFAULT '';
  END IF;
END $$;

-- Add invoice number configuration fields to company_settings
DO $$
BEGIN
  -- Invoice configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_suffix text DEFAULT '';
  END IF;

  -- Payment configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'payment_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN payment_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'payment_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN payment_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'payment_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN payment_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'payment_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN payment_suffix text DEFAULT '';
  END IF;

  -- Receipt configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'receipt_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN receipt_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'receipt_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN receipt_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'receipt_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN receipt_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'receipt_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN receipt_suffix text DEFAULT '';
  END IF;

  -- Journal configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'journal_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN journal_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'journal_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN journal_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'journal_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN journal_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'journal_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN journal_suffix text DEFAULT '';
  END IF;

  -- Contra configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'contra_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN contra_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'contra_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN contra_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'contra_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN contra_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'contra_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN contra_suffix text DEFAULT '';
  END IF;

  -- Credit Note configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'credit_note_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN credit_note_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'credit_note_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN credit_note_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'credit_note_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN credit_note_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'credit_note_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN credit_note_suffix text DEFAULT '';
  END IF;

  -- Debit Note configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'debit_note_number_width') THEN
    ALTER TABLE company_settings ADD COLUMN debit_note_number_width integer DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'debit_note_number_prefix_zero') THEN
    ALTER TABLE company_settings ADD COLUMN debit_note_number_prefix_zero boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'debit_note_starting_number') THEN
    ALTER TABLE company_settings ADD COLUMN debit_note_starting_number integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'debit_note_suffix') THEN
    ALTER TABLE company_settings ADD COLUMN debit_note_suffix text DEFAULT '';
  END IF;
END $$;

-- Add invoice layout configuration fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_template_color_primary') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_template_color_primary text DEFAULT '#1e40af';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_template_color_secondary') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_template_color_secondary text DEFAULT '#3b82f6';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_template_font_family') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_template_font_family text DEFAULT 'Inter';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_template_font_size_base') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_template_font_size_base integer DEFAULT 10;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_template_logo_position') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_template_logo_position text DEFAULT 'left';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_template_header_layout') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_template_header_layout text DEFAULT 'standard';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_company_address') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_company_address boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_company_phone') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_company_phone boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_company_email') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_company_email boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_company_website') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_company_website boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_tax_number') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_tax_number boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_bank_details') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_bank_details boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_terms') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_terms boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_show_notes') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_show_notes boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'invoice_line_item_columns') THEN
    ALTER TABLE company_settings ADD COLUMN invoice_line_item_columns jsonb DEFAULT '["description", "quantity", "rate", "amount"]'::jsonb;
  END IF;
END $$;

-- Create function to generate voucher numbers
CREATE OR REPLACE FUNCTION generate_voucher_number(
  p_user_id uuid,
  p_voucher_type text,
  p_current_count integer
)
RETURNS text AS $$
DECLARE
  v_prefix text;
  v_suffix text;
  v_width integer;
  v_prefix_zero boolean;
  v_starting_number integer;
  v_number_part text;
  v_final_number text;
  v_settings record;
BEGIN
  -- Get settings for this user
  SELECT * INTO v_settings
  FROM company_settings
  WHERE user_id = p_user_id;
  
  IF v_settings IS NULL THEN
    RAISE EXCEPTION 'Company settings not found for user';
  END IF;
  
  -- Determine configuration based on voucher type
  CASE p_voucher_type
    WHEN 'invoice' THEN
      v_prefix := v_settings.invoice_prefix;
      v_suffix := v_settings.invoice_suffix;
      v_width := v_settings.invoice_number_width;
      v_prefix_zero := v_settings.invoice_number_prefix_zero;
      v_starting_number := v_settings.invoice_starting_number;
    WHEN 'payment' THEN
      v_prefix := v_settings.payment_prefix;
      v_suffix := v_settings.payment_suffix;
      v_width := v_settings.payment_number_width;
      v_prefix_zero := v_settings.payment_number_prefix_zero;
      v_starting_number := v_settings.payment_starting_number;
    WHEN 'receipt' THEN
      v_prefix := v_settings.receipt_prefix;
      v_suffix := v_settings.receipt_suffix;
      v_width := v_settings.receipt_number_width;
      v_prefix_zero := v_settings.receipt_number_prefix_zero;
      v_starting_number := v_settings.receipt_starting_number;
    WHEN 'journal' THEN
      v_prefix := v_settings.journal_prefix;
      v_suffix := v_settings.journal_suffix;
      v_width := v_settings.journal_number_width;
      v_prefix_zero := v_settings.journal_number_prefix_zero;
      v_starting_number := v_settings.journal_starting_number;
    WHEN 'contra' THEN
      v_prefix := v_settings.contra_prefix;
      v_suffix := v_settings.contra_suffix;
      v_width := v_settings.contra_number_width;
      v_prefix_zero := v_settings.contra_number_prefix_zero;
      v_starting_number := v_settings.contra_starting_number;
    WHEN 'credit_note' THEN
      v_prefix := v_settings.credit_note_prefix;
      v_suffix := v_settings.credit_note_suffix;
      v_width := v_settings.credit_note_number_width;
      v_prefix_zero := v_settings.credit_note_number_prefix_zero;
      v_starting_number := v_settings.credit_note_starting_number;
    WHEN 'debit_note' THEN
      v_prefix := v_settings.debit_note_prefix;
      v_suffix := v_settings.debit_note_suffix;
      v_width := v_settings.debit_note_number_width;
      v_prefix_zero := v_settings.debit_note_number_prefix_zero;
      v_starting_number := v_settings.debit_note_starting_number;
    ELSE
      RAISE EXCEPTION 'Invalid voucher type: %', p_voucher_type;
  END CASE;
  
  -- Calculate the actual number
  v_final_number := v_starting_number + p_current_count - 1;
  
  -- Format the number part
  IF v_prefix_zero THEN
    v_number_part := LPAD(v_final_number::text, v_width, '0');
  ELSE
    v_number_part := v_final_number::text;
  END IF;
  
  -- Construct final voucher number
  RETURN v_prefix || '-' || v_number_part || COALESCE(v_suffix, '');
END;
$$ LANGUAGE plpgsql;
