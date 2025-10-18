import { useState, useEffect, useRef } from 'react';
import { Palette, Eye, FileText, DollarSign, Type, Layout, Image as ImageIcon, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface InvoiceTemplateSettings {
  show_logo: boolean;
  show_company_details: boolean;
  show_tax_number: boolean;
  show_bank_details: boolean;
  show_payment_terms: boolean;
  show_notes: boolean;
  header_color: string;
  accent_color: string;
  text_color: string;
  font_family: string;
  font_size: string;
  logo_position: 'left' | 'center' | 'right';
  logo_size: string;
  page_size: 'A4' | 'Letter';
  page_margin: string;
  currency_symbol: string;
  currency: string;
  invoice_notes: string;
  invoice_terms: string;
  tax_label: string;
  include_item_numbers: boolean;
  show_item_tax: boolean;
  footer_text: string;
  watermark_text: string;
  show_supplier_section: boolean;
  show_buyer_section: boolean;
  supplier_position: 'left' | 'right';
  buyer_position: 'left' | 'right';
  number_position: 'left' | 'right' | 'top';
  split_gst: boolean;
}

interface InvoiceTemplateSettingsProps {
  settings: any;
  onUpdateSettings: (updates: any) => void;
}

export default function InvoiceTemplateSettings({ settings, onUpdateSettings }: InvoiceTemplateSettingsProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(settings.company_logo_url || '');

  const [templateSettings, setTemplateSettings] = useState<InvoiceTemplateSettings>({
    show_logo: settings.invoice_show_logo !== false,
    show_company_details: settings.invoice_show_company_details !== false,
    show_tax_number: settings.invoice_show_tax_number !== false,
    show_bank_details: settings.invoice_show_bank_details !== false,
    show_payment_terms: settings.invoice_show_payment_terms !== false,
    show_notes: settings.invoice_show_notes !== false,
    header_color: settings.invoice_header_color || '#1e40af',
    accent_color: settings.invoice_accent_color || '#0ea5e9',
    text_color: settings.invoice_text_color || '#1f2937',
    font_family: settings.invoice_font_family || 'Inter',
    font_size: settings.invoice_font_size || 'medium',
    logo_position: settings.invoice_logo_position || 'left',
    logo_size: settings.invoice_logo_size || 'medium',
    page_size: settings.invoice_page_size || 'A4',
    page_margin: settings.invoice_page_margin || '20',
    currency_symbol: settings.currency_symbol || '₹',
    currency: settings.currency || 'INR',
    invoice_notes: settings.invoice_notes || 'Thank you for your business!',
    invoice_terms: settings.invoice_terms || '',
    tax_label: settings.tax_label || 'GST',
    include_item_numbers: settings.invoice_include_item_numbers !== false,
    show_item_tax: settings.invoice_show_item_tax !== false,
    footer_text: settings.invoice_footer_text || '',
    watermark_text: settings.invoice_watermark_text || '',
    show_supplier_section: settings.invoice_show_supplier_section !== false,
    show_buyer_section: settings.invoice_show_buyer_section !== false,
    supplier_position: settings.invoice_supplier_position || 'left',
    buyer_position: settings.invoice_buyer_position || 'left',
    number_position: settings.invoice_number_position || 'right',
    split_gst: settings.invoice_split_gst !== false,
  });

  useEffect(() => {
    const updates: any = {
      invoice_show_logo: templateSettings.show_logo,
      invoice_show_company_details: templateSettings.show_company_details,
      invoice_show_tax_number: templateSettings.show_tax_number,
      invoice_show_bank_details: templateSettings.show_bank_details,
      invoice_show_payment_terms: templateSettings.show_payment_terms,
      invoice_show_notes: templateSettings.show_notes,
      invoice_header_color: templateSettings.header_color,
      invoice_accent_color: templateSettings.accent_color,
      invoice_text_color: templateSettings.text_color,
      invoice_font_family: templateSettings.font_family,
      invoice_font_size: templateSettings.font_size,
      invoice_logo_position: templateSettings.logo_position,
      invoice_logo_size: templateSettings.logo_size,
      invoice_page_size: templateSettings.page_size,
      invoice_page_margin: templateSettings.page_margin,
      currency_symbol: templateSettings.currency_symbol,
      currency: templateSettings.currency,
      invoice_notes: templateSettings.invoice_notes,
      invoice_terms: templateSettings.invoice_terms,
      tax_label: templateSettings.tax_label,
      invoice_include_item_numbers: templateSettings.include_item_numbers,
      invoice_show_item_tax: templateSettings.show_item_tax,
      invoice_footer_text: templateSettings.footer_text,
      invoice_watermark_text: templateSettings.watermark_text,
      invoice_show_supplier_section: templateSettings.show_supplier_section,
      invoice_show_buyer_section: templateSettings.show_buyer_section,
      invoice_supplier_position: templateSettings.supplier_position,
      invoice_buyer_position: templateSettings.buyer_position,
      invoice_number_position: templateSettings.number_position,
      invoice_split_gst: templateSettings.split_gst,
      company_logo_url: logoUrl,
    };
    onUpdateSettings(updates);
  }, [templateSettings, logoUrl]);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo: ' + (error.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const updateSetting = <K extends keyof InvoiceTemplateSettings>(
    key: K,
    value: InvoiceTemplateSettings[K]
  ) => {
    setTemplateSettings(prev => ({ ...prev, [key]: value }));
  };

  const fontSizeMap = {
    small: '12px',
    medium: '14px',
    large: '16px',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Palette size={20} className="text-blue-600" />
            Colors & Branding
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Header Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={templateSettings.header_color}
                  onChange={(e) => updateSetting('header_color', e.target.value)}
                  className="w-16 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={templateSettings.header_color}
                  onChange={(e) => updateSetting('header_color', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="#1e40af"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Accent Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={templateSettings.accent_color}
                  onChange={(e) => updateSetting('accent_color', e.target.value)}
                  className="w-16 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={templateSettings.accent_color}
                  onChange={(e) => updateSetting('accent_color', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="#0ea5e9"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={templateSettings.text_color}
                  onChange={(e) => updateSetting('text_color', e.target.value)}
                  className="w-16 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={templateSettings.text_color}
                  onChange={(e) => updateSetting('text_color', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="#1f2937"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Type size={20} className="text-blue-600" />
            Typography
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Font Family
              </label>
              <select
                value={templateSettings.font_family}
                onChange={(e) => updateSetting('font_family', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="Inter">Inter (Modern)</option>
                <option value="Arial">Arial (Classic)</option>
                <option value="Times New Roman">Times New Roman (Traditional)</option>
                <option value="Roboto">Roboto (Clean)</option>
                <option value="Open Sans">Open Sans (Friendly)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Font Size
              </label>
              <select
                value={templateSettings.font_size}
                onChange={(e) => updateSetting('font_size', e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="small">Small (12px)</option>
                <option value="medium">Medium (14px)</option>
                <option value="large">Large (16px)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ImageIcon size={20} className="text-blue-600" />
            Logo Settings
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Logo
              </label>
              <div className="flex items-center gap-4">
                {logoUrl && (
                  <div className="w-24 h-24 border-2 border-gray-200 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50">
                    <img src={logoUrl} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    <Upload size={18} />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Recommended: PNG or JPG, max 2MB
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo Position
              </label>
              <div className="flex gap-2">
                {['left', 'center', 'right'].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => updateSetting('logo_position', pos as any)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors capitalize ${
                      templateSettings.logo_position === pos
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo Size
              </label>
              <select
                value={templateSettings.logo_size}
                onChange={(e) => updateSetting('logo_size', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="small">Small (80px)</option>
                <option value="medium">Medium (120px)</option>
                <option value="large">Large (160px)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Layout size={20} className="text-blue-600" />
            Layout & Format
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Size
              </label>
              <select
                value={templateSettings.page_size}
                onChange={(e) => updateSetting('page_size', e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="A4">A4 (210 x 297 mm)</option>
                <option value="Letter">Letter (8.5 x 11 in)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Margin (mm)
              </label>
              <input
                type="number"
                min="10"
                max="50"
                value={templateSettings.page_margin}
                onChange={(e) => updateSetting('page_margin', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier Details Position
              </label>
              <div className="flex gap-2">
                {['left', 'right'].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => updateSetting('supplier_position', pos as any)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors capitalize ${
                      templateSettings.supplier_position === pos
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buyer Details Position
              </label>
              <div className="flex gap-2">
                {['left', 'right'].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => updateSetting('buyer_position', pos as any)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors capitalize ${
                      templateSettings.buyer_position === pos
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invoice Number Position
              </label>
              <div className="flex gap-2">
                {['left', 'right', 'top'].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => updateSetting('number_position', pos as any)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors capitalize ${
                      templateSettings.number_position === pos
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            Content Settings
          </h3>
          <div className="space-y-3">
            {[
              { key: 'show_logo', label: 'Show Company Logo' },
              { key: 'show_company_details', label: 'Show Company Details' },
              { key: 'show_supplier_section', label: 'Show Supplier Details Section' },
              { key: 'show_buyer_section', label: 'Show Buyer Details Section' },
              { key: 'show_tax_number', label: 'Show Tax Registration Number' },
              { key: 'show_bank_details', label: 'Show Bank Details' },
              { key: 'show_payment_terms', label: 'Show Payment Terms' },
              { key: 'show_notes', label: 'Show Notes' },
              { key: 'include_item_numbers', label: 'Include Item Numbers' },
              { key: 'show_item_tax', label: 'Show Tax on Each Item' },
              { key: 'split_gst', label: 'Split GST into CGST/SGST/IGST' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templateSettings[key as keyof InvoiceTemplateSettings] as boolean}
                  onChange={(e) => updateSetting(key as any, e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign size={20} className="text-blue-600" />
            Currency & Tax
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency Code
              </label>
              <input
                type="text"
                value={templateSettings.currency}
                onChange={(e) => updateSetting('currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="INR"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency Symbol
              </label>
              <input
                type="text"
                value={templateSettings.currency_symbol}
                onChange={(e) => updateSetting('currency_symbol', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="₹"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tax Label
              </label>
              <input
                type="text"
                value={templateSettings.tax_label}
                onChange={(e) => updateSetting('tax_label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="GST, VAT, Tax"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Text</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Notes
              </label>
              <textarea
                value={templateSettings.invoice_notes}
                onChange={(e) => updateSetting('invoice_notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Thank you for your business!"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Terms & Conditions
              </label>
              <textarea
                value={templateSettings.invoice_terms}
                onChange={(e) => updateSetting('invoice_terms', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Payment due within 30 days..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Footer Text
              </label>
              <input
                type="text"
                value={templateSettings.footer_text}
                onChange={(e) => updateSetting('footer_text', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Custom footer message"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Watermark Text
              </label>
              <input
                type="text"
                value={templateSettings.watermark_text}
                onChange={(e) => updateSetting('watermark_text', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="DRAFT, PAID, etc."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
          <div className="flex items-center gap-2 mb-4">
            <Eye size={20} className="text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Live Preview</h3>
          </div>

          <div
            className="bg-white rounded-lg shadow-lg overflow-hidden"
            style={{
              fontFamily: templateSettings.font_family,
              fontSize: fontSizeMap[templateSettings.font_size],
              color: templateSettings.text_color,
            }}
          >
            <div
              className="p-6"
              style={{ backgroundColor: templateSettings.header_color }}
            >
              <div className={`flex items-center ${
                templateSettings.logo_position === 'center' ? 'justify-center' :
                templateSettings.logo_position === 'right' ? 'justify-end' : 'justify-start'
              }`}>
                {templateSettings.show_logo && (
                  <div
                    className="bg-white rounded-lg p-3"
                    style={{
                      width: templateSettings.logo_size === 'small' ? '80px' :
                             templateSettings.logo_size === 'large' ? '160px' : '120px',
                      height: templateSettings.logo_size === 'small' ? '80px' :
                              templateSettings.logo_size === 'large' ? '160px' : '120px',
                    }}
                  >
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      LOGO
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {templateSettings.show_buyer_section && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="text-xs font-bold text-gray-600 uppercase mb-1">Party:</div>
                  <div className="font-bold text-sm mb-1">Customer Name</div>
                  <div className="text-xs text-gray-600">
                    <div>123 Business Street</div>
                    <div>City, State - 12345</div>
                    <div>Phone: +91 1234567890</div>
                    <div className="font-semibold">GSTIN: 29AAACT1234A1Z5</div>
                  </div>
                </div>
              )}

              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-bold mb-1" style={{ color: templateSettings.accent_color }}>
                      INVOICE
                    </h2>
                  </div>
                  <div className="text-right text-xs">
                    <div className="mb-1">
                      <span className="font-medium">Date:</span> {new Date().toLocaleDateString()}
                    </div>
                    <div>
                      <span className="font-medium">Invoice #:</span> INV-000001
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3 mt-3">
                <table className="w-full text-xs border border-gray-300">
                  <thead className="bg-gray-100">
                    <tr>
                      {templateSettings.include_item_numbers && <th className="border border-gray-300 p-1 text-center">#</th>}
                      <th className="border border-gray-300 p-1 text-left">Particulars</th>
                      <th className="border border-gray-300 p-1 text-center">HSN/SAC</th>
                      <th className="border border-gray-300 p-1 text-center">Qty</th>
                      <th className="border border-gray-300 p-1 text-right">Rate</th>
                      <th className="border border-gray-300 p-1 text-right">Taxable Value</th>
                      {templateSettings.show_item_tax && (
                        <th className="border border-gray-300 p-1 text-right">
                          {templateSettings.split_gst ? 'GST Amount' : 'Tax Amount'}
                        </th>
                      )}
                      <th className="border border-gray-300 p-1 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {templateSettings.include_item_numbers && <td className="border border-gray-300 p-1 text-center">1</td>}
                      <td className="border border-gray-300 p-1">Sample Service</td>
                      <td className="border border-gray-300 p-1 text-center">-</td>
                      <td className="border border-gray-300 p-1 text-center">1</td>
                      <td className="border border-gray-300 p-1 text-right">{templateSettings.currency_symbol}1,000.00</td>
                      <td className="border border-gray-300 p-1 text-right">{templateSettings.currency_symbol}1,000.00</td>
                      {templateSettings.show_item_tax && (
                        <td className="border border-gray-300 p-1 text-right">{templateSettings.currency_symbol}180.00</td>
                      )}
                      <td className="border border-gray-300 p-1 text-right font-semibold">{templateSettings.currency_symbol}1,180.00</td>
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={templateSettings.include_item_numbers ? 5 : 4} className="border border-gray-300 p-1 text-right">Total</td>
                      <td className="border border-gray-300 p-1 text-right">{templateSettings.currency_symbol}1,000.00</td>
                      {templateSettings.show_item_tax && (
                        <td className="border border-gray-300 p-1 text-right">{templateSettings.currency_symbol}180.00</td>
                      )}
                      <td className="border border-gray-300 p-1 text-right">{templateSettings.currency_symbol}1,180.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <div className="w-1/2 text-xs">
                    <div className="font-semibold">Taxable Amount</div>
                    <div className="font-bold">{templateSettings.currency_symbol}1,000.00</div>
                  </div>
                  <div className="w-1/2 border-l pl-3">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{templateSettings.currency_symbol}1,000.00</span>
                      </div>
                      {templateSettings.split_gst ? (
                        <>
                          <div className="flex justify-between">
                            <span>Add: CGST @ 9%:</span>
                            <span>{templateSettings.currency_symbol}90.00</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Add: SGST @ 9%:</span>
                            <span>{templateSettings.currency_symbol}90.00</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span>{templateSettings.tax_label} @ 18%:</span>
                          <span>{templateSettings.currency_symbol}180.00</span>
                        </div>
                      )}
                      <div
                        className="flex justify-between font-bold pt-1 border-t"
                        style={{ borderColor: templateSettings.accent_color }}
                      >
                        <span>Invoice Value:</span>
                        <span>{templateSettings.currency_symbol}1,180.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3 mt-3 text-xs">
                <div className="font-semibold mb-1">Amount in Words</div>
                <div className="font-bold">One Thousand One Hundred Eighty Rupees Only</div>
              </div>

              {templateSettings.show_bank_details && (
                <div className="border-t pt-3 mt-3 text-xs">
                  <h3 className="font-bold mb-2 uppercase">Bank Details</h3>
                  <div className="grid grid-cols-2 gap-1">
                    <div><span className="font-semibold">Bank Name:</span> State Bank of India</div>
                    <div><span className="font-semibold">Account Number:</span> 1234567890</div>
                    <div><span className="font-semibold">IFSC Code:</span> SBIN0001234</div>
                    <div><span className="font-semibold">Account Holder:</span> Company Name</div>
                  </div>
                </div>
              )}

              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-end text-xs">
                  <div className="w-3/5">
                    <div className="font-semibold mb-1">For Company Name</div>
                    <div className="text-gray-500">+91 1234567890</div>
                    <div className="text-gray-500">info@company.com</div>
                  </div>
                  <div className="w-2/5 text-right">
                    <div className="mt-8 pt-2 border-t border-gray-400 font-semibold">Authorised Signatory</div>
                  </div>
                </div>
              </div>

            </div>

            {templateSettings.watermark_text && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="text-6xl font-bold opacity-10 transform -rotate-45"
                  style={{ color: templateSettings.accent_color }}
                >
                  {templateSettings.watermark_text}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-600 mt-4 text-center">
            This preview demonstrates the visual styling. Actual invoices will include complete data.
          </p>
        </div>
      </div>
    </div>
  );
}
