import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { X, FileText, ArrowRightLeft } from 'lucide-react';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
}

interface ContraVoucherModalProps {
  onClose: () => void;
  voucherTypeId: string;
}

export default function ContraVoucherModal({ onClose, voucherTypeId }: ContraVoucherModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [formData, setFormData] = useState({
    voucher_number: '',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    narration: '',
    status: 'draft',
  });

  useEffect(() => {
    fetchAccounts();
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

  const generateVoucherNumber = async () => {
    try {
      const { count } = await supabase
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('voucher_type_id', voucherTypeId);

      const nextNumber = `CV-${String((count || 0) + 1).padStart(5, '0')}`;
      setFormData((prev) => ({ ...prev, voucher_number: nextNumber }));
    } catch (error) {
      console.error('Error generating voucher number:', error);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromAccountId || !toAccountId) {
      toast.error('Please select both from and to accounts');
      return;
    }

    if (fromAccountId === toAccountId) {
      toast.error('From and To accounts must be different');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (!transferAmount || transferAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const entriesData = [
        {
          account_id: toAccountId,
          debit_amount: transferAmount,
          credit_amount: 0,
          narration: formData.narration || 'Contra transfer',
        },
        {
          account_id: fromAccountId,
          debit_amount: 0,
          credit_amount: transferAmount,
          narration: formData.narration || 'Contra transfer',
        },
      ];

      const voucherData = {
        user_id: user!.id,
        voucher_type_id: voucherTypeId,
        voucher_number: formData.voucher_number,
        voucher_date: formData.voucher_date,
        reference_number: formData.reference_number,
        narration: formData.narration,
        total_amount: transferAmount,
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

      toast.success('Contra voucher created successfully');
      onClose();
    } catch (error: any) {
      console.error('Error saving contra voucher:', error);
      toast.error(error.message || 'Failed to save contra voucher');
    }
  };

  const fromAccount = accounts.find(a => a.id === fromAccountId);
  const toAccount = accounts.find(a => a.id === toAccountId);
  const cashBankAccounts = getCashBankAccounts();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-0 lg:left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-cyan-600 to-blue-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={28} />
              Create Contra Voucher
            </h2>
            <p className="text-cyan-100 text-sm mt-1">Transfer between cash and bank accounts</p>
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
            <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl p-6 border border-cyan-200">
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="Voucher description..."
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-300 rounded-lg">
              <p className="text-sm font-semibold text-cyan-900 mb-2">
                <ArrowRightLeft className="w-4 h-4 inline mr-2" />
                Contra Voucher
              </p>
              <p className="text-xs text-cyan-800">
                Transfer funds between cash and bank accounts. Both accounts must be cash or bank ledgers.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Transfer Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Account (Credit) *
                  </label>
                  <select
                    value={fromAccountId}
                    onChange={(e) => setFromAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select source account</option>
                    {cashBankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_code} - {account.account_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Money will be deducted from this account</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    To Account (Debit) *
                  </label>
                  <select
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select destination account</option>
                    {cashBankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_code} - {account.account_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Money will be added to this account</p>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-lg"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            {fromAccountId && toAccountId && amount && (
              <div className="bg-gradient-to-r from-gray-50 to-cyan-50 rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">From (Credit):</p>
                      <p className="text-sm font-medium text-gray-900">
                        {fromAccount ? `${fromAccount.account_code} - ${fromAccount.account_name}` : '-'}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-red-600">-₹{parseFloat(amount || '0').toFixed(2)}</p>
                  </div>

                  <div className="flex justify-center">
                    <ArrowRightLeft className="w-8 h-8 text-cyan-600" />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">To (Debit):</p>
                      <p className="text-sm font-medium text-gray-900">
                        {toAccount ? `${toAccount.account_code} - ${toAccount.account_name}` : '-'}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-green-600">+₹{parseFloat(amount || '0').toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}
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
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-700 hover:to-blue-700 transition-all font-medium shadow-lg"
          >
            Create Contra Voucher
          </button>
        </div>
      </div>
    </div>
  );
}
