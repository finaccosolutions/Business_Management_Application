import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { X, Plus, Trash2, FileText } from 'lucide-react';

interface VoucherType {
  id: string;
  name: string;
  code: string;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
}

interface VoucherEntry {
  account_id: string;
  debit_amount: string;
  credit_amount: string;
  narration: string;
}

interface VoucherModalProps {
  onClose: () => void;
  voucherTypes: VoucherType[];
  selectedTypeId?: string;
}

export default function VoucherModal({ onClose, voucherTypes, selectedTypeId }: VoucherModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [cashBankLedgerId, setCashBankLedgerId] = useState<string>('');
  const [formData, setFormData] = useState({
    voucher_type_id: selectedTypeId || '',
    voucher_number: '',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    narration: '',
    status: 'draft',
  });

  const [entries, setEntries] = useState<VoucherEntry[]>([
    { account_id: '', debit_amount: '0', credit_amount: '0', narration: '' },
    { account_id: '', debit_amount: '0', credit_amount: '0', narration: '' },
  ]);

  useEffect(() => {
    fetchAccounts();
    fetchLedgersAndSettings();
  }, []);

  useEffect(() => {
    if (formData.voucher_type_id) {
      generateVoucherNumber(formData.voucher_type_id);
    }
  }, [formData.voucher_type_id]);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name')
        .eq('is_active', true)
        .order('account_code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to load accounts');
    }
  };

  const fetchLedgersAndSettings = async () => {
    try {
      const [ledgersResult, settingsResult] = await Promise.all([
        supabase.from('ledgers').select('id, name').order('name'),
        supabase.from('company_settings').select('default_cash_ledger_id, default_bank_ledger_id, default_payment_receipt_type').eq('user_id', user!.id).maybeSingle()
      ]);

      if (ledgersResult.data) setLedgers(ledgersResult.data);

      if (settingsResult.data) {
        const ledgerId = settingsResult.data.default_payment_receipt_type === 'bank'
          ? settingsResult.data.default_bank_ledger_id
          : settingsResult.data.default_cash_ledger_id;
        if (ledgerId) setCashBankLedgerId(ledgerId);
      }
    } catch (error) {
      console.error('Error fetching ledgers and settings:', error);
    }
  };

  const getVoucherPrefix = (typeId: string) => {
    const type = voucherTypes.find(t => t.id === typeId);
    if (!type) return 'VCH';

    const prefixMap: { [key: string]: string } = {
      'PAYMENT': 'PV',
      'RECEIPT': 'RV',
      'JOURNAL': 'JV',
      'CONTRA': 'CV',
      'DEBIT': 'DN',
      'CREDIT': 'CN',
    };

    return prefixMap[type.code] || type.code.substring(0, 2).toUpperCase();
  };

  const generateVoucherNumber = async (typeId: string) => {
    try {
      const { count } = await supabase
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('voucher_type_id', typeId);

      const prefix = getVoucherPrefix(typeId);
      const nextNumber = `${prefix}-${String((count || 0) + 1).padStart(5, '0')}`;
      setFormData((prev) => ({ ...prev, voucher_number: nextNumber }));
    } catch (error) {
      console.error('Error generating voucher number:', error);
    }
  };

  const isPaymentVoucher = () => {
    const type = voucherTypes.find(t => t.id === formData.voucher_type_id);
    return type?.code === 'PAYMENT';
  };

  const isReceiptVoucher = () => {
    const type = voucherTypes.find(t => t.id === formData.voucher_type_id);
    return type?.code === 'RECEIPT';
  };

  const addEntry = () => {
    setEntries([...entries, { account_id: '', debit_amount: '0', credit_amount: '0', narration: '' }]);
  };

  const removeEntry = (index: number) => {
    if (entries.length > 2) {
      setEntries(entries.filter((_, i) => i !== index));
    }
  };

  const updateEntry = (index: number, field: keyof VoucherEntry, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  const calculateTotals = () => {
    const totalDebit = entries.reduce((sum, entry) => sum + parseFloat(entry.debit_amount || '0'), 0);
    const totalCredit = entries.reduce((sum, entry) => sum + parseFloat(entry.credit_amount || '0'), 0);
    return { totalDebit, totalCredit, difference: totalDebit - totalCredit };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { totalDebit, totalCredit, difference } = calculateTotals();

    if (Math.abs(difference) > 0.01) {
      toast.error('Debit and Credit amounts must be equal');
      return;
    }

    if (totalDebit === 0 || totalCredit === 0) {
      toast.error('Please enter valid amounts');
      return;
    }

    try {
      const voucherData = {
        user_id: user!.id,
        voucher_type_id: formData.voucher_type_id,
        voucher_number: formData.voucher_number,
        voucher_date: formData.voucher_date,
        reference_number: formData.reference_number,
        narration: formData.narration,
        total_amount: totalDebit,
        status: formData.status,
        created_by: user!.id,
      };

      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .insert(voucherData)
        .select()
        .single();

      if (voucherError) throw voucherError;

      const entriesData = entries
        .filter((entry) => entry.account_id && (parseFloat(entry.debit_amount) > 0 || parseFloat(entry.credit_amount) > 0))
        .map((entry) => ({
          voucher_id: voucher.id,
          account_id: entry.account_id,
          debit_amount: parseFloat(entry.debit_amount || '0'),
          credit_amount: parseFloat(entry.credit_amount || '0'),
          narration: entry.narration,
        }));

      const { error: entriesError } = await supabase
        .from('voucher_entries')
        .insert(entriesData);

      if (entriesError) throw entriesError;

      toast.success('Voucher created successfully');
      onClose();
    } catch (error: any) {
      console.error('Error saving voucher:', error);
      toast.error(error.message || 'Failed to save voucher');
    }
  };

  const { totalDebit, totalCredit, difference } = calculateTotals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-0 lg:left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={28} />
              Create Voucher
            </h2>
            <p className="text-blue-100 text-sm mt-1">Double-entry bookkeeping voucher</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Voucher Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Voucher Type *
                  </label>
                  <select
                    required
                    value={formData.voucher_type_id}
                    onChange={(e) => setFormData({ ...formData, voucher_type_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select type</option>
                    {voucherTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Voucher Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.voucher_number}
                    onChange={(e) => setFormData({ ...formData, voucher_number: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.voucher_date}
                    onChange={(e) => setFormData({ ...formData, voucher_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Narration
                  </label>
                  <textarea
                    value={formData.narration}
                    onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Voucher description..."
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Accounting Entries</h3>
                <button
                  type="button"
                  onClick={addEntry}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Plus size={18} />
                  Add Entry
                </button>
              </div>

              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Account *
                        </label>
                        <select
                          value={entry.account_id}
                          onChange={(e) => updateEntry(index, 'account_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select account</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.account_code} - {account.account_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-5 md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Debit (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={entry.debit_amount}
                          onChange={(e) => updateEntry(index, 'debit_amount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div className="col-span-5 md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Credit (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={entry.credit_amount}
                          onChange={(e) => updateEntry(index, 'credit_amount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div className="col-span-2 md:col-span-2 flex items-end justify-center">
                        {entries.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeEntry(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove entry"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      <div className="col-span-12">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Entry Narration (Optional)
                        </label>
                        <input
                          type="text"
                          value={entry.narration}
                          onChange={(e) => updateEntry(index, 'narration', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="Optional entry description..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-base">
                  <span className="text-gray-700 font-medium">Total Debit:</span>
                  <span className="font-bold text-gray-900">₹{totalDebit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-base">
                  <span className="text-gray-700 font-medium">Total Credit:</span>
                  <span className="font-bold text-gray-900">₹{totalCredit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t-2 border-blue-300">
                  <span className="text-xl font-bold text-gray-900">Difference:</span>
                  <span
                    className={`text-2xl font-bold ${
                      Math.abs(difference) < 0.01 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    ₹{Math.abs(difference).toFixed(2)}
                  </span>
                </div>
                {Math.abs(difference) > 0.01 && (
                  <p className="text-sm text-red-600 text-center mt-2">
                    Debit and Credit must be equal for a valid voucher
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={Math.abs(difference) > 0.01}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Voucher
          </button>
        </div>
      </div>
    </div>
  );
}
