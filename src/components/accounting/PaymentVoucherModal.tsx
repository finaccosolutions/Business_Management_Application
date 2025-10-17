import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { X, Plus, Trash2, FileText } from 'lucide-react';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
}

interface DebitEntry {
  account_id: string;
  amount: string;
  narration: string;
}

interface PaymentVoucherModalProps {
  onClose: () => void;
  voucherTypeId: string;
}

export default function PaymentVoucherModal({ onClose, voucherTypeId }: PaymentVoucherModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cashBankAccountId, setCashBankAccountId] = useState<string>('');
  const [cashBankAccountName, setCashBankAccountName] = useState<string>('');
  const [paymentReceiptType, setPaymentReceiptType] = useState<'cash' | 'bank'>('cash');
  const [formData, setFormData] = useState({
    voucher_number: '',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    narration: '',
    status: 'draft',
  });

  const [debitEntries, setDebitEntries] = useState<DebitEntry[]>([
    { account_id: '', amount: '', narration: '' },
  ]);

  useEffect(() => {
    fetchAccounts();
    fetchSettings();
    generateVoucherNumber();
  }, []);

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

  const fetchSettings = async () => {
    try {
      const { data: settings, error } = await supabase
        .from('company_settings')
        .select('default_cash_ledger_id, default_bank_ledger_id, default_payment_receipt_type')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;

      if (settings) {
        const type = settings.default_payment_receipt_type || 'cash';
        setPaymentReceiptType(type);
        const accountId = type === 'bank'
          ? settings.default_bank_ledger_id
          : settings.default_cash_ledger_id;
        if (accountId) {
          setCashBankAccountId(accountId);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const getCashBankAccounts = () => {
    return accounts.filter(acc => {
      const code = acc.account_code.toLowerCase();
      const name = acc.account_name.toLowerCase();
      return code.includes('cash') || code.includes('bank') ||
             name.includes('cash') || name.includes('bank');
    });
  };

  useEffect(() => {
    if (cashBankAccountId && accounts.length > 0) {
      const account = accounts.find(a => a.id === cashBankAccountId);
      if (account) {
        setCashBankAccountName(`${account.account_code} - ${account.account_name}`);
      }
    }
  }, [cashBankAccountId, accounts]);

  const generateVoucherNumber = async () => {
    try {
      const { count } = await supabase
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('voucher_type_id', voucherTypeId);

      const nextNumber = `PV-${String((count || 0) + 1).padStart(5, '0')}`;
      setFormData((prev) => ({ ...prev, voucher_number: nextNumber }));
    } catch (error) {
      console.error('Error generating voucher number:', error);
    }
  };

  const addDebitEntry = () => {
    setDebitEntries([...debitEntries, { account_id: '', amount: '', narration: '' }]);
  };

  const removeDebitEntry = (index: number) => {
    if (debitEntries.length > 1) {
      setDebitEntries(debitEntries.filter((_, i) => i !== index));
    }
  };

  const updateDebitEntry = (index: number, field: keyof DebitEntry, value: string) => {
    const updated = [...debitEntries];
    updated[index] = { ...updated[index], [field]: value };
    setDebitEntries(updated);
  };

  const calculateTotal = () => {
    return debitEntries.reduce((sum, entry) => sum + parseFloat(entry.amount || '0'), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cashBankAccountId) {
      toast.error('Please configure default cash/bank account in Settings');
      return;
    }

    const validDebitEntries = debitEntries.filter(
      (entry) => entry.account_id && parseFloat(entry.amount || '0') > 0
    );

    if (validDebitEntries.length === 0) {
      toast.error('Please add at least one debit entry with amount');
      return;
    }

    try {
      const totalAmount = calculateTotal();

      const entriesData = [
        ...validDebitEntries.map((entry) => ({
          account_id: entry.account_id,
          debit_amount: parseFloat(entry.amount),
          credit_amount: 0,
          narration: entry.narration || formData.narration,
        })),
        {
          account_id: cashBankAccountId,
          debit_amount: 0,
          credit_amount: totalAmount,
          narration: `Payment via ${paymentReceiptType}`,
        },
      ];

      const voucherData = {
        user_id: user!.id,
        voucher_type_id: voucherTypeId,
        voucher_number: formData.voucher_number,
        voucher_date: formData.voucher_date,
        reference_number: formData.reference_number,
        narration: formData.narration,
        total_amount: totalAmount,
        status: formData.status,
        created_by: user!.id,
      };

      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .insert(voucherData)
        .select()
        .single();

      if (voucherError) throw voucherError;

      const finalEntriesData = entriesData.map((entry) => ({
        ...entry,
        voucher_id: voucher.id,
      }));

      const { error: entriesError } = await supabase
        .from('voucher_entries')
        .insert(finalEntriesData);

      if (entriesError) throw entriesError;

      toast.success('Payment voucher created successfully');
      onClose();
    } catch (error: any) {
      console.error('Error saving payment voucher:', error);
      toast.error(error.message || 'Failed to save payment voucher');
    }
  };

  const totalAmount = calculateTotal();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-0 lg:left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-red-600 to-orange-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={28} />
              Create Payment Voucher
            </h2>
            <p className="text-red-100 text-sm mt-1">Record payment transactions</p>
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
            <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-6 border border-red-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Voucher Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Voucher Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.voucher_number}
                    onChange={(e) => setFormData({ ...formData, voucher_number: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Voucher description..."
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Credit Ledger (Cash/Bank Account)</h3>
              <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-lg mb-4">
                <p className="text-xs text-red-800 mb-1">
                  <strong>Payment Voucher:</strong> Cash/Bank will be <strong>CREDITED</strong> (money going out)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Cash/Bank Ledger *
                </label>
                <select
                  value={cashBankAccountId}
                  onChange={(e) => setCashBankAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  required
                >
                  <option value="">Select cash or bank ledger</option>
                  {getCashBankAccounts().map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_code} - {account.account_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select the cash or bank account from which payment will be made
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Debit Ledgers (Expenses/Payables)</h3>
                <button
                  type="button"
                  onClick={addDebitEntry}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                >
                  <Plus size={18} />
                  Add Debit Ledger
                </button>
              </div>

              <div className="space-y-3">
                {debitEntries.map((entry, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-12 md:col-span-6">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Debit Ledger (Expense/Payable) *
                        </label>
                        <select
                          value={entry.account_id}
                          onChange={(e) => updateDebitEntry(index, 'account_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                          required
                        >
                          <option value="">Select ledger</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.account_code} - {account.account_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-10 md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Amount (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={entry.amount}
                          onChange={(e) => updateDebitEntry(index, 'amount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                          placeholder="0.00"
                          required
                        />
                      </div>

                      <div className="col-span-2 md:col-span-1 flex items-end justify-center">
                        {debitEntries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDebitEntry(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove entry"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      <div className="col-span-12 md:col-span-10">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Entry Narration (Optional)
                        </label>
                        <input
                          type="text"
                          value={entry.narration}
                          onChange={(e) => updateDebitEntry(index, 'narration', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                          placeholder="Optional description..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-red-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-base">
                  <span className="text-gray-700 font-medium">Total Payment Amount:</span>
                  <span className="font-bold text-gray-900">₹{totalAmount.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-red-200">
                  <p className="text-xs text-gray-600 mb-1">Cash/Bank Ledger:</p>
                  <p className="text-sm font-medium text-gray-900">{cashBankAccountName || 'Not configured'}</p>
                  <p className="text-xs text-red-600 mt-1">
                    Will be CREDITED with ₹{totalAmount.toFixed(2)}
                  </p>
                </div>
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
            className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-all font-medium shadow-lg"
          >
            Create Payment Voucher
          </button>
        </div>
      </div>
    </div>
  );
}
