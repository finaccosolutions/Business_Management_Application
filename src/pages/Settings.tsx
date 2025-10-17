import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  CreditCard,
  Save,
  Upload,
  Image as ImageIcon,
  DollarSign,
  Hash,
  Landmark,
} from 'lucide-react';

interface CompanySettings {
  id?: string;
  company_name: string;
  company_logo_url: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  tax_registration_number: string;
  tax_label: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc_code: string;
  bank_swift_code: string;
  bank_branch: string;
  invoice_prefix: string;
  payment_prefix: string;
  receipt_prefix: string;
  journal_prefix: string;
  contra_prefix: string;
  credit_note_prefix: string;
  debit_note_prefix: string;
  invoice_terms: string;
  invoice_notes: string;
  currency: string;
  currency_symbol: string;
  default_cash_ledger_id: string | null;
  default_bank_ledger_id: string | null;
  default_income_ledger_id: string | null;
  default_discount_ledger_id: string | null;
  default_payment_receipt_type: 'cash' | 'bank';
}

interface Ledger {
  id: string;
  account_code: string;
  account_name: string;
  account_groups: { account_type: string };
}

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'bank' | 'invoice' | 'ledgers'>('company');
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('');
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: '',
    company_logo_url: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    phone: '',
    email: '',
    website: '',
    tax_registration_number: '',
    tax_label: 'GST',
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_swift_code: '',
    bank_branch: '',
    invoice_prefix: 'INV',
    payment_prefix: 'PAY',
    receipt_prefix: 'RCT',
    journal_prefix: 'JV',
    contra_prefix: 'CNT',
    credit_note_prefix: 'CN',
    debit_note_prefix: 'DN',
    invoice_terms: '',
    invoice_notes: 'Thank you for your business!',
    currency: 'INR',
    currency_symbol: '₹',
    default_cash_ledger_id: null,
    default_bank_ledger_id: null,
    default_income_ledger_id: null,
    default_discount_ledger_id: null,
    default_payment_receipt_type: 'cash',
  });

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const [settingsResult, ledgersResult] = await Promise.all([
        supabase
          .from('company_settings')
          .select('*')
          .eq('user_id', user?.id)
          .maybeSingle(),
        supabase
          .from('chart_of_accounts')
          .select('id, account_code, account_name, account_groups(account_type)')
          .eq('is_active', true)
          .order('account_name')
      ]);

      if (settingsResult.error && settingsResult.error.code !== 'PGRST116') throw settingsResult.error;
      if (ledgersResult.error) throw ledgersResult.error;

      if (settingsResult.data) {
        setSettings(settingsResult.data);
      }
      setLedgers(ledgersResult.data || []);
    } catch (error: any) {
      console.error('Error fetching settings:', error.message);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const settingsData = {
        ...settings,
        user_id: user?.id,
        updated_at: new Date().toISOString(),
      };

      if (settings.id) {
        const { error } = await supabase
          .from('company_settings')
          .update(settingsData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('company_settings')
          .insert(settingsData)
          .select()
          .single();

        if (error) throw error;
        setSettings({ ...settings, id: data.id });
      }

      toast.success('Settings saved successfully!');
    } catch (error: any) {
      console.error('Error saving settings:', error.message);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo file size must be less than 2MB');
      return;
    }

    toast.info('Logo upload feature coming soon. Please use an external URL for now.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Company Settings</h1>
          <p className="text-gray-600 mt-1">Manage your company information and preferences</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('company')}
            className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
              activeTab === 'company'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Building2 size={20} />
            Company Details
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
              activeTab === 'bank'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Landmark size={20} />
            Bank Details
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
              activeTab === 'invoice'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText size={20} />
            Voucher Settings
          </button>
          <button
            onClick={() => setActiveTab('ledgers')}
            className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
              activeTab === 'ledgers'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Landmark size={20} />
            Ledger Mapping
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6">
          {activeTab === 'company' && (
            <div className="space-y-6">
              {/* Company Logo */}
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ImageIcon size={20} className="text-blue-600" />
                  Company Logo
                </h3>
                <div className="flex items-center gap-6">
                  {settings.company_logo_url ? (
                    <div className="w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
                      <img
                        src={settings.company_logo_url}
                        alt="Company Logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white">
                      <ImageIcon size={32} className="text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Logo URL (or upload)
                    </label>
                    <input
                      type="url"
                      value={settings.company_logo_url}
                      onChange={(e) => setSettings({ ...settings, company_logo_url: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                      placeholder="https://example.com/logo.png"
                    />
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer border border-blue-200 w-fit">
                      <Upload size={18} />
                      <span className="text-sm font-medium">Upload Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Recommended: 400x400px, Max 2MB</p>
                  </div>
                </div>
              </div>

              {/* Basic Information */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Building2 size={20} className="text-blue-600" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={settings.company_name}
                      onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Your Company Name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <Mail size={14} />
                      Email
                    </label>
                    <input
                      type="email"
                      value={settings.email}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="company@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <Phone size={14} />
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={settings.phone}
                      onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="+91 1234567890"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <Globe size={14} />
                      Website
                    </label>
                    <input
                      type="url"
                      value={settings.website}
                      onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://www.yourcompany.com"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin size={20} className="text-blue-600" />
                  Address
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Address Line 1
                    </label>
                    <input
                      type="text"
                      value={settings.address_line1}
                      onChange={(e) => setSettings({ ...settings, address_line1: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Street address, building, etc."
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      value={settings.address_line2}
                      onChange={(e) => setSettings({ ...settings, address_line2: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Apartment, suite, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                    <input
                      type="text"
                      value={settings.city}
                      onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="City"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                    <input
                      type="text"
                      value={settings.state}
                      onChange={(e) => setSettings({ ...settings, state: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="State/Province"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      value={settings.postal_code}
                      onChange={(e) => setSettings({ ...settings, postal_code: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="ZIP/Postal Code"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                    <input
                      type="text"
                      value={settings.country}
                      onChange={(e) => setSettings({ ...settings, country: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Country"
                    />
                  </div>
                </div>
              </div>

              {/* Tax Information */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" />
                  Tax Registration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tax Label
                    </label>
                    <input
                      type="text"
                      value={settings.tax_label}
                      onChange={(e) => setSettings({ ...settings, tax_label: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="GST, VAT, Tax"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Label to display on invoices (e.g., "GST", "VAT")
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tax Registration Number
                    </label>
                    <input
                      type="text"
                      value={settings.tax_registration_number}
                      onChange={(e) =>
                        setSettings({ ...settings, tax_registration_number: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="29AAACT1234A1Z5"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Your GSTIN, VAT number, or tax ID
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bank' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Landmark size={20} className="text-blue-600" />
                  Bank Account Details
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  These details will appear on your invoices for payment purposes
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={settings.bank_name}
                      onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="State Bank of India"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={settings.bank_account_number}
                      onChange={(e) =>
                        setSettings({ ...settings, bank_account_number: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="1234567890"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={settings.bank_ifsc_code}
                      onChange={(e) => setSettings({ ...settings, bank_ifsc_code: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="SBIN0001234"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SWIFT/BIC Code
                    </label>
                    <input
                      type="text"
                      value={settings.bank_swift_code}
                      onChange={(e) => setSettings({ ...settings, bank_swift_code: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="SBININBB123"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                    <input
                      type="text"
                      value={settings.bank_branch}
                      onChange={(e) => setSettings({ ...settings, bank_branch: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Main Branch, City Center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'invoice' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Hash size={20} className="text-blue-600" />
                  Voucher Number Prefixes
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configure prefixes for all voucher types
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Invoice Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.invoice_prefix}
                      onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="INV"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.invoice_prefix}-000001
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Receipt Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.receipt_prefix}
                      onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="RCT"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.receipt_prefix}-000001
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.payment_prefix}
                      onChange={(e) => setSettings({ ...settings, payment_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="PAY"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.payment_prefix}-000001
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Journal Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.journal_prefix}
                      onChange={(e) => setSettings({ ...settings, journal_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="JV"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.journal_prefix}-000001
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contra Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.contra_prefix}
                      onChange={(e) => setSettings({ ...settings, contra_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="CNT"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.contra_prefix}-000001
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Credit Note Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.credit_note_prefix}
                      onChange={(e) => setSettings({ ...settings, credit_note_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="CN"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.credit_note_prefix}-000001
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Debit Note Prefix
                    </label>
                    <input
                      type="text"
                      value={settings.debit_note_prefix}
                      onChange={(e) => setSettings({ ...settings, debit_note_prefix: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="DN"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: {settings.debit_note_prefix}-000001
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" />
                  Invoice Configuration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <DollarSign size={14} />
                      Currency
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={settings.currency}
                        onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="INR"
                      />
                      <input
                        type="text"
                        value={settings.currency_symbol}
                        onChange={(e) =>
                          setSettings({ ...settings, currency_symbol: e.target.value })
                        }
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="₹"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Invoice Notes
                    </label>
                    <textarea
                      value={settings.invoice_notes}
                      onChange={(e) => setSettings({ ...settings, invoice_notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Thank you for your business!"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Terms & Conditions
                    </label>
                    <textarea
                      value={settings.invoice_terms}
                      onChange={(e) => setSettings({ ...settings, invoice_terms: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Payment due within 30 days. Late fees may apply."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ledgers' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Landmark size={20} className="text-blue-600" />
                  Ledger Mapping Configuration
                </h3>
                <p className="text-sm text-gray-700 mb-4">
                  Map default ledgers for automatic voucher creation and invoicing. These settings help streamline your accounting workflow.
                </p>
                <div className="bg-white border border-blue-200 rounded-lg p-4">
                  <p className="text-xs text-gray-700 font-medium mb-2">How it works:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                    <li>Set default ledgers for common transactions</li>
                    <li>When creating receipts/payments, mapped ledgers are auto-filled</li>
                    <li>When invoices are marked as paid, receipt vouchers are auto-created</li>
                    <li>Service-specific income ledgers override company defaults</li>
                  </ul>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Default Payment Ledgers</h3>
                <p className="text-sm text-gray-600 mb-4">
                  These ledgers are used for receipt and payment vouchers
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Cash Ledger
                    </label>
                    <select
                      value={settings.default_cash_ledger_id || ''}
                      onChange={(e) => setSettings({ ...settings, default_cash_ledger_id: e.target.value || null })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- Select Cash Ledger --</option>
                      {ledgers
                        .filter((l) => l.account_groups.account_type === 'asset')
                        .map((ledger) => (
                        <option key={ledger.id} value={ledger.id}>
                          {ledger.account_code} - {ledger.account_name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for cash transactions (e.g., Cash in Hand)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Bank Ledger
                    </label>
                    <select
                      value={settings.default_bank_ledger_id || ''}
                      onChange={(e) => setSettings({ ...settings, default_bank_ledger_id: e.target.value || null })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- Select Bank Ledger --</option>
                      {ledgers
                        .filter((l) => l.account_groups.account_type === 'asset')
                        .map((ledger) => (
                        <option key={ledger.id} value={ledger.id}>
                          {ledger.account_code} - {ledger.account_name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for bank transactions (e.g., Bank Account)
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Receipt/Payment Type
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="payment_type"
                          value="cash"
                          checked={settings.default_payment_receipt_type === 'cash'}
                          onChange={(e) => setSettings({ ...settings, default_payment_receipt_type: 'cash' })}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Cash</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="payment_type"
                          value="bank"
                          checked={settings.default_payment_receipt_type === 'bank'}
                          onChange={(e) => setSettings({ ...settings, default_payment_receipt_type: 'bank' })}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Bank</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Default type for auto-created receipts when invoices are marked as paid
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Income & Discount Ledgers</h3>
                <p className="text-sm text-gray-600 mb-4">
                  These ledgers are used for invoice creation and discounts
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Income Ledger
                    </label>
                    <select
                      value={settings.default_income_ledger_id || ''}
                      onChange={(e) => setSettings({ ...settings, default_income_ledger_id: e.target.value || null })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- Select Income Ledger --</option>
                      {ledgers
                        .filter((l) => l.account_groups.account_type === 'income')
                        .map((ledger) => (
                        <option key={ledger.id} value={ledger.id}>
                          {ledger.account_code} - {ledger.account_name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for service income when creating invoices
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Discount Ledger
                    </label>
                    <select
                      value={settings.default_discount_ledger_id || ''}
                      onChange={(e) => setSettings({ ...settings, default_discount_ledger_id: e.target.value || null })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- Select Discount Ledger --</option>
                      {ledgers
                        .filter((l) => l.account_groups.account_type === 'expense')
                        .map((ledger) => (
                        <option key={ledger.id} value={ledger.id}>
                          {ledger.account_code} - {ledger.account_name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for invoice discounts
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-900 font-medium mb-2">Note:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
                  <li>Service-specific income ledgers (configured in Service Details) override company defaults</li>
                  <li>Receipt vouchers are auto-created when invoices are marked as paid (if ledgers are mapped)</li>
                  <li>Payment and receipt vouchers use these default ledgers for auto-filling</li>
                </ul>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg font-medium"
            >
              <Save size={20} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
