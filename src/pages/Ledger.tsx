import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { BookOpen, Download, Search, Calendar } from 'lucide-react';
import { formatDateDisplay } from '../lib/dateUtils';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  voucher_number: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function Ledger() {
  const { user } = useAuth();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user) {
      fetchAccounts();
      const params = new URLSearchParams(window.location.search);
      const accountParam = params.get('account');
      const startParam = params.get('start');
      const endParam = params.get('end');

      if (accountParam) setSelectedAccount(accountParam);
      if (startParam) setStartDate(startParam);
      if (endParam) setEndDate(endParam);
    }
  }, [user]);

  useEffect(() => {
    if (selectedAccount) {
      fetchLedgerEntries();
    }
  }, [selectedAccount, startDate, endDate]);

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
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerEntries = async () => {
    try {
      let query = supabase
        .from('ledger_transactions')
        .select(`
          *,
          vouchers(voucher_number)
        `)
        .eq('account_id', selectedAccount)
        .order('transaction_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }
      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      let runningBalance = 0;
      const processedEntries = (data || []).map((txn: any) => {
        runningBalance += (Number(txn.debit) || 0) - (Number(txn.credit) || 0);
        return {
          id: txn.id,
          transaction_date: txn.transaction_date,
          voucher_number: txn.vouchers?.voucher_number || 'N/A',
          particulars: txn.narration || '-',
          debit: Number(txn.debit) || 0,
          credit: Number(txn.credit) || 0,
          balance: runningBalance,
        };
      });

      setEntries(processedEntries);
    } catch (error) {
      console.error('Error fetching ledger entries:', error);
      toast.error('Failed to load ledger entries');
    }
  };

  const calculateTotals = () => {
    const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
    const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;
    return { totalDebit, totalCredit, closingBalance };
  };

  const exportToCSV = () => {
    if (entries.length === 0) return;

    const headers = ['Date', 'Voucher No', 'Particulars', 'Debit', 'Credit', 'Balance'];
    const rows = entries.map(entry => [
      formatDateDisplay(entry.transaction_date),
      entry.voucher_number,
      entry.particulars,
      entry.debit > 0 ? entry.debit.toFixed(2) : '0.00',
      entry.credit > 0 ? entry.credit.toFixed(2) : '0.00',
      entry.balance.toFixed(2),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_${selectedAccount}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredEntries = entries.filter(entry =>
    entry.voucher_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.particulars.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { totalDebit, totalCredit, closingBalance } = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 rounded-xl shadow-xl p-6 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-8 h-8" />
              Account Ledger
            </h1>
            <p className="text-slate-300 mt-2">Detailed account-wise transaction history</p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={!selectedAccount || entries.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Account *
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Choose an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.account_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {startDate && (
              <p className="text-xs text-gray-500 mt-1">{formatDateDisplay(startDate)}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {endDate && (
              <p className="text-xs text-gray-500 mt-1">{formatDateDisplay(endDate)}</p>
            )}
          </div>
        </div>
      </div>

      {selectedAccount && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by voucher number or particulars..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Debit</p>
                  <p className="text-3xl font-bold mt-2">₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-lg">
                  <BookOpen className="w-8 h-8" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Total Credit</p>
                  <p className="text-3xl font-bold mt-2">₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-lg">
                  <BookOpen className="w-8 h-8" />
                </div>
              </div>
            </div>

            <div className={`bg-gradient-to-br ${closingBalance >= 0 ? 'from-green-500 to-green-600' : 'from-orange-500 to-orange-600'} rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`${closingBalance >= 0 ? 'text-green-100' : 'text-orange-100'} text-sm font-medium`}>Closing Balance</p>
                  <p className="text-3xl font-bold mt-2">₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs mt-1">{closingBalance >= 0 ? 'Dr' : 'Cr'}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-lg">
                  <BookOpen className="w-8 h-8" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b-2 border-blue-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Voucher No.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Particulars
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Debit (₹)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Credit (₹)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Balance (₹)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {formatDateDisplay(entry.transaction_date)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm text-blue-600 font-medium">
                          {entry.voucher_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{entry.particulars}</span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {entry.debit > 0 ? (
                          <span className="text-sm font-semibold text-blue-600">
                            ₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {entry.credit > 0 ? (
                          <span className="text-sm font-semibold text-red-600">
                            ₹{entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={`text-sm font-bold ${
                          entry.balance >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          ₹{Math.abs(entry.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          <span className="text-xs ml-1">{entry.balance >= 0 ? 'Dr' : 'Cr'}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gradient-to-r from-gray-50 to-blue-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-right font-bold text-gray-900 uppercase">
                      Total:
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-blue-700">
                        ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-red-700">
                        ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-bold ${
                        closingBalance >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        ₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        <span className="text-xs ml-1">{closingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>

              {filteredEntries.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
                  <p className="text-gray-600">
                    {selectedAccount
                      ? searchTerm
                        ? 'No transactions match your search criteria'
                        : 'No transactions for this account in the selected period'
                      : 'Select an account to view its ledger'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
