import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { BookOpen, Download, Search, Calendar, Filter, X, ArrowLeft } from 'lucide-react';
import { formatDateDisplay } from '../lib/dateUtils';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  group_name?: string;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  voucher_number: string;
  voucher_type: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  narration: string;
}

export default function Ledger() {
  const { user } = useAuth();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [transactionType, setTransactionType] = useState<'all' | 'debit' | 'credit'>('all');
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      fetchAccounts();

      // Check sessionStorage first (from Reports navigation)
      const storedParams = sessionStorage.getItem('ledgerParams');
      if (storedParams) {
        try {
          const params = JSON.parse(storedParams);
          if (params.account) {
            if (params.start) setStartDate(params.start);
            if (params.end) setEndDate(params.end);
            fetchAccountDetails(params.account);
            // Clear after reading
            sessionStorage.removeItem('ledgerParams');
          }
        } catch (e) {
          console.error('Error parsing ledger params:', e);
        }
      } else {
        // Fallback to URL parameters
        const params = new URLSearchParams(window.location.search);
        const accountParam = params.get('account');
        const startParam = params.get('start');
        const endParam = params.get('end');

        if (startParam) setStartDate(startParam);
        if (endParam) setEndDate(endParam);

        if (accountParam) {
          // Fetch specific account details
          fetchAccountDetails(accountParam);
        }
      }
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
        .select(`
          id,
          account_code,
          account_name,
          account_groups(name)
        `)
        .eq('is_active', true)
        .order('account_code');

      if (error) throw error;

      const formattedAccounts = (data || []).map((acc: any) => ({
        id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        group_name: acc.account_groups?.name || 'Ungrouped',
      }));

      setAccounts(formattedAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountDetails = async (accountId: string) => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select(`
          id,
          account_code,
          account_name,
          account_groups(name)
        `)
        .eq('id', accountId)
        .single();

      if (error) throw error;

      if (data) {
        setSelectedAccount({
          id: data.id,
          account_code: data.account_code,
          account_name: data.account_name,
          group_name: data.account_groups?.name || 'Ungrouped',
        });
      }
    } catch (error) {
      console.error('Error fetching account details:', error);
      toast.error('Failed to load account details');
    }
  };

  const fetchLedgerEntries = async () => {
    if (!selectedAccount) return;

    try {
      let query = supabase
        .from('ledger_transactions')
        .select(`
          *,
          vouchers(
            voucher_number,
            voucher_types(name),
            id
          )
        `)
        .eq('account_id', selectedAccount.id)
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

      const processedEntries = [];
      let runningBalance = 0;

      for (const txn of (data || [])) {
        runningBalance += (Number(txn.debit) || 0) - (Number(txn.credit) || 0);

        let particularsName = txn.narration || '-';

        if (txn.vouchers?.id) {
          const { data: otherTxns } = await supabase
            .from('ledger_transactions')
            .select(`
              account_id,
              chart_of_accounts(account_name)
            `)
            .eq('voucher_id', txn.vouchers.id)
            .neq('account_id', selectedAccount.id)
            .limit(1)
            .maybeSingle();

          if (otherTxns?.chart_of_accounts?.account_name) {
            particularsName = otherTxns.chart_of_accounts.account_name;
          }
        }

        processedEntries.push({
          id: txn.id,
          transaction_date: txn.transaction_date,
          voucher_number: txn.vouchers?.voucher_number || 'N/A',
          voucher_type: txn.vouchers?.voucher_types?.name || 'Unknown',
          particulars: particularsName,
          narration: txn.narration || '-',
          debit: Number(txn.debit) || 0,
          credit: Number(txn.credit) || 0,
          balance: runningBalance,
        });
      }

      setEntries(processedEntries);

      const types = Array.from(new Set(processedEntries.map(e => e.voucher_type)));
      setVoucherTypes(types);
    } catch (error) {
      console.error('Error fetching ledger entries:', error);
      toast.error('Failed to load ledger entries');
    }
  };

  const calculateTotals = () => {
    const totalDebit = filteredEntries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = filteredEntries.reduce((sum, entry) => sum + entry.credit, 0);
    const closingBalance = filteredEntries.length > 0 ? filteredEntries[filteredEntries.length - 1].balance : 0;
    return { totalDebit, totalCredit, closingBalance };
  };

  const exportToCSV = () => {
    if (filteredEntries.length === 0) return;

    const headers = ['Date', 'Voucher No', 'Type', 'Particulars', 'Debit', 'Credit', 'Balance'];
    const rows = filteredEntries.map(entry => [
      formatDateDisplay(entry.transaction_date),
      entry.voucher_number,
      entry.voucher_type,
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
    a.download = `ledger_${selectedAccount?.account_code}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredEntries = entries.filter(entry => {
    // Search filter
    const matchesSearch =
      entry.voucher_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.particulars.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.voucher_type.toLowerCase().includes(searchTerm.toLowerCase());

    // Voucher type filter
    const matchesVoucherType = !voucherTypeFilter || entry.voucher_type === voucherTypeFilter;

    // Amount filter
    const amount = entry.debit > 0 ? entry.debit : entry.credit;
    const matchesMinAmount = !minAmount || amount >= parseFloat(minAmount);
    const matchesMaxAmount = !maxAmount || amount <= parseFloat(maxAmount);

    // Transaction type filter
    const matchesTransactionType =
      transactionType === 'all' ||
      (transactionType === 'debit' && entry.debit > 0) ||
      (transactionType === 'credit' && entry.credit > 0);

    return matchesSearch && matchesVoucherType && matchesMinAmount && matchesMaxAmount && matchesTransactionType;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setVoucherTypeFilter('');
    setMinAmount('');
    setMaxAmount('');
    setTransactionType('all');
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (voucherTypeFilter) count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    if (transactionType !== 'all') count++;
    return count;
  };

  const handleBackToSelection = () => {
    setSelectedAccount(null);
    setEntries([]);
    // Clear URL parameters
    window.history.pushState({}, '', '/ledger');
  };

  const { totalDebit, totalCredit, closingBalance } = calculateTotals();
  const activeFiltersCount = getActiveFiltersCount();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-40">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 rounded-xl shadow-xl p-6 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {selectedAccount && (
                <button
                  onClick={handleBackToSelection}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Back to account selection"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <BookOpen className="w-8 h-8" />
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {selectedAccount ? 'Account Ledger' : 'Ledger'}
                </h1>
                {selectedAccount && (
                  <p className="text-slate-300 mt-1 text-sm">
                    {selectedAccount.account_code} - {selectedAccount.account_name}
                    {selectedAccount.group_name && (
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded text-xs">
                        {selectedAccount.group_name}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            {!selectedAccount && (
              <p className="text-slate-300 mt-2">View detailed transaction history for any account</p>
            )}
          </div>
          {selectedAccount && (
            <button
              onClick={exportToCSV}
              disabled={filteredEntries.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Account Selection */}
      {!selectedAccount ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Select Account</h2>
            <p className="text-gray-600 text-sm">Choose an account to view its ledger transactions</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search accounts by code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid gap-2 max-h-96 overflow-y-auto">
              {accounts
                .filter(acc =>
                  acc.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  acc.account_code.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((account) => (
                  <div
                    key={account.id}
                    onClick={() => setSelectedAccount(account)}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-blue-600 font-medium">
                            {account.account_code}
                          </span>
                          <span className="text-gray-400">•</span>
                          <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {account.account_name}
                          </span>
                        </div>
                        {account.group_name && (
                          <p className="text-xs text-gray-500 mt-1">{account.group_name}</p>
                        )}
                      </div>
                      <BookOpen className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Date Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Date Range</h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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

          {/* Additional Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
                {activeFiltersCount > 0 && (
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    {activeFiltersCount} active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by voucher number, type, or particulars..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Voucher Type
                    </label>
                    <select
                      value={voucherTypeFilter}
                      onChange={(e) => setVoucherTypeFilter(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Types</option>
                      {voucherTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transaction Type
                    </label>
                    <select
                      value={transactionType}
                      onChange={(e) => setTransactionType(e.target.value as 'all' | 'debit' | 'credit')}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Transactions</option>
                      <option value="debit">Debit Only</option>
                      <option value="credit">Credit Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Min Amount
                    </label>
                    <input
                      type="number"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Amount
                    </label>
                    <input
                      type="number"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200" style={{ marginBottom: filteredEntries.length > 0 ? '180px' : '0' }}>
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50 sticky top-0 z-20">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Ledger Transactions
                </h2>
                <div className="text-sm text-gray-600">
                  {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 450px)', overflowY: 'auto' }}>
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-700 to-slate-600 text-white sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">
                      Voucher No.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">
                      Particulars (Ledger Name)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">
                      Debit (₹)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">
                      Credit (₹)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">
                      Balance (₹)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatDateDisplay(entry.transaction_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm text-blue-600 font-medium">
                            {entry.voucher_number}
                          </span>
                          <span className="text-xs text-gray-500">{entry.voucher_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{entry.particulars}</div>
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
              </table>

              {filteredEntries.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
                  <p className="text-gray-600">
                    {searchTerm || voucherTypeFilter || minAmount || maxAmount || transactionType !== 'all'
                      ? 'No transactions match your filter criteria'
                      : 'No transactions for this account in the selected period'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Bottom Summary Panel */}
          {filteredEntries.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t-4 border-slate-700 shadow-2xl z-50">
              <div className="max-w-7xl mx-auto px-6 py-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white shadow-lg">
                    <div>
                      <p className="text-xs font-medium text-blue-100 uppercase tracking-wide">Total Debit</p>
                      <p className="text-2xl font-bold mt-1">
                        ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <BookOpen className="w-8 h-8 opacity-70" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500 to-red-600 rounded-lg text-white shadow-lg">
                    <div>
                      <p className="text-xs font-medium text-red-100 uppercase tracking-wide">Total Credit</p>
                      <p className="text-2xl font-bold mt-1">
                        ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <BookOpen className="w-8 h-8 opacity-70" />
                  </div>

                  <div className={`flex items-center justify-between p-4 bg-gradient-to-r ${
                    closingBalance >= 0 ? 'from-green-500 to-green-600' : 'from-orange-500 to-orange-600'
                  } rounded-lg text-white shadow-lg`}>
                    <div>
                      <p className={`text-xs font-medium uppercase tracking-wide ${
                        closingBalance >= 0 ? 'text-green-100' : 'text-orange-100'
                      }`}>
                        Closing Balance
                      </p>
                      <p className="text-2xl font-bold mt-1">
                        ₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        <span className="text-sm ml-2">{closingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                      </p>
                    </div>
                    <BookOpen className="w-8 h-8 opacity-70" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
