/*
  # Comprehensive Voucher Numbering and Invoice Configuration

  ## Overview
  Adds extensive voucher numbering configuration options and invoice template customization
  settings to enable complete control over document generation and appearance.

  ## 1. Voucher Numbering Settings
  Add columns to `company_settings` for each voucher type:
  - Prefix: Text before the number (e.g., "INV")
  - Suffix: Text after the number (e.g., "-2024")
  - Number Width: How many digits to display (e.g., 6 for "000001")
  - Prefix Zero: Whether to fill with leading zeros
  - Starting Number: First number to use in sequence

  Voucher Types Configured:
  - Invoice
  - Payment
  - Receipt
  - Journal
  - Contra
  - Credit Note
  - Debit Note

  ## 2. Invoice Template Configuration
  Add extensive customization options for invoice appearance:
  - Colors: header, accent, text colors
  - Fonts: family, sizes for different elements
  - Layout: positioning of supplier/customer details
  - Content: what appears in particulars, notes, terms
  - Branding: logo positioning and size
  - Footer: payment terms placement

  ## 3. Security
  - All changes are user-scoped
  - Settings are tied to company_settings record
  - No new RLS policies needed (existing policies apply)

  ## Important Notes
  - These settings control document generation formatting
  - Changes affect new documents only
  - Existing documents remain unchanged
  - All settings have sensible defaults
*/

-- Add voucher numbering configuration columns
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS invoice_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS invoice_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_starting_number integer DEFAULT 1,
  
  ADD COLUMN IF NOT EXISTS payment_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS payment_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_starting_number integer DEFAULT 1,
  
  ADD COLUMN IF NOT EXISTS receipt_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS receipt_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_starting_number integer DEFAULT 1,
  
  ADD COLUMN IF NOT EXISTS journal_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS journal_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS journal_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS journal_starting_number integer DEFAULT 1,
  
  ADD COLUMN IF NOT EXISTS contra_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contra_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS contra_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS contra_starting_number integer DEFAULT 1,
  
  ADD COLUMN IF NOT EXISTS credit_note_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS credit_note_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS credit_note_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS credit_note_starting_number integer DEFAULT 1,
  
  ADD COLUMN IF NOT EXISTS debit_note_suffix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS debit_note_number_width integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS debit_note_number_prefix_zero boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS debit_note_starting_number integer DEFAULT 1;

-- Add invoice template configuration columns
ALTER TABLE company_settings
  -- Color Configuration
  ADD COLUMN IF NOT EXISTS invoice_header_color text DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS invoice_accent_color text DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS invoice_text_color text DEFAULT '#1f2937',
  ADD COLUMN IF NOT EXISTS invoice_secondary_text_color text DEFAULT '#6b7280',
  
  -- Font Configuration
  ADD COLUMN IF NOT EXISTS invoice_font_family text DEFAULT 'Arial, sans-serif',
  ADD COLUMN IF NOT EXISTS invoice_title_font_size integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS invoice_heading_font_size integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS invoice_body_font_size integer DEFAULT 11,
  ADD COLUMN IF NOT EXISTS invoice_small_font_size integer DEFAULT 9,
  
  -- Layout Configuration
  ADD COLUMN IF NOT EXISTS invoice_logo_position text DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS invoice_logo_width integer DEFAULT 120,
  ADD COLUMN IF NOT EXISTS invoice_logo_height integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS invoice_supplier_position text DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS invoice_customer_position text DEFAULT 'right',
  
  -- Content Configuration
  ADD COLUMN IF NOT EXISTS invoice_show_logo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_tax_number boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_bank_details boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_payment_terms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_notes boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_signature boolean DEFAULT false,
  
  -- Table Configuration
  ADD COLUMN IF NOT EXISTS invoice_show_item_code boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_show_hsn_sac boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_show_discount_column boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_table_border_color text DEFAULT '#e5e7eb',
  ADD COLUMN IF NOT EXISTS invoice_table_header_bg_color text DEFAULT '#f3f4f6',
  
  -- Footer Configuration
  ADD COLUMN IF NOT EXISTS invoice_footer_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_footer_font_size integer DEFAULT 9,
  ADD COLUMN IF NOT EXISTS invoice_footer_alignment text DEFAULT 'center',
  
  -- Page Configuration
  ADD COLUMN IF NOT EXISTS invoice_page_margin_top integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS invoice_page_margin_bottom integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS invoice_page_margin_left integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS invoice_page_margin_right integer DEFAULT 20,
  
  -- Additional Fields
  ADD COLUMN IF NOT EXISTS invoice_watermark_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_watermark_opacity numeric DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS invoice_show_due_date_highlight boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_overdue_highlight_color text DEFAULT '#ef4444';

-- Add constraints for sensible ranges
ALTER TABLE company_settings
  ADD CONSTRAINT check_number_width_range CHECK (
    invoice_number_width BETWEEN 1 AND 12 AND
    payment_number_width BETWEEN 1 AND 12 AND
    receipt_number_width BETWEEN 1 AND 12 AND
    journal_number_width BETWEEN 1 AND 12 AND
    contra_number_width BETWEEN 1 AND 12 AND
    credit_note_number_width BETWEEN 1 AND 12 AND
    debit_note_number_width BETWEEN 1 AND 12
  );

ALTER TABLE company_settings
  ADD CONSTRAINT check_starting_number_positive CHECK (
    invoice_starting_number >= 1 AND
    payment_starting_number >= 1 AND
    receipt_starting_number >= 1 AND
    journal_starting_number >= 1 AND
    contra_starting_number >= 1 AND
    credit_note_starting_number >= 1 AND
    debit_note_starting_number >= 1
  );

ALTER TABLE company_settings
  ADD CONSTRAINT check_logo_dimensions CHECK (
    invoice_logo_width BETWEEN 50 AND 300 AND
    invoice_logo_height BETWEEN 30 AND 200
  );

ALTER TABLE company_settings
  ADD CONSTRAINT check_font_sizes CHECK (
    invoice_title_font_size BETWEEN 16 AND 48 AND
    invoice_heading_font_size BETWEEN 10 AND 24 AND
    invoice_body_font_size BETWEEN 8 AND 18 AND
    invoice_small_font_size BETWEEN 6 AND 14 AND
    invoice_footer_font_size BETWEEN 6 AND 14
  );

ALTER TABLE company_settings
  ADD CONSTRAINT check_page_margins CHECK (
    invoice_page_margin_top BETWEEN 0 AND 50 AND
    invoice_page_margin_bottom BETWEEN 0 AND 50 AND
    invoice_page_margin_left BETWEEN 0 AND 50 AND
    invoice_page_margin_right BETWEEN 0 AND 50
  );

-- Add comment for documentation
COMMENT ON COLUMN company_settings.invoice_suffix IS 'Optional text added after invoice numbers';
COMMENT ON COLUMN company_settings.invoice_number_width IS 'Number of digits for invoice numbers (1-12)';
COMMENT ON COLUMN company_settings.invoice_number_prefix_zero IS 'Whether to pad numbers with leading zeros';
COMMENT ON COLUMN company_settings.invoice_starting_number IS 'Starting number for invoice sequence';
COMMENT ON COLUMN company_settings.invoice_header_color IS 'Hex color code for invoice header background';
COMMENT ON COLUMN company_settings.invoice_font_family IS 'CSS font family for invoice documents';
COMMENT ON COLUMN company_settings.invoice_logo_position IS 'Position of logo: left, center, or right';