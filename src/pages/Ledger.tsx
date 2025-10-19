import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { BookOpen, Download, Search, Calendar, Filter, X, ArrowLeft, FileText, Edit2, FileSpreadsheet } from 'lucide-react';
import { formatDateDisplay } from '../lib/dateUtils';
import { exportToXLSX, exportToPDF } from '../lib/exportUtils';
import PaymentVoucherModal from '../components/accounting/PaymentVoucherModal';
import ReceiptVoucherModal from '../components/accounting/ReceiptVoucherModal';
import JournalVoucherModal from '../components/accounting/JournalVoucherModal';
import ContraVoucherModal from '../components/accounting/ContraVoucherModal';
import EditInvoiceModal from '../components/EditInvoiceModal';

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
  voucher_type_code?: string;
  voucher_id?: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  narration: string;
}

interface LedgerProps {
  onNavigate?: (page: string) => void;
}

export default function Ledger({ onNavigate }: LedgerProps = {}) {
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
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [returnPath, setReturnPath] = useState<string | null>(null);

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
            if (params.returnPath) setReturnPath(params.returnPath);
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
        const accountGroups = data.account_groups as any;
        setSelectedAccount({
          id: data.id,
          account_code: data.account_code,
          account_name: data.account_name,
          group_name: accountGroups?.name || 'Ungrouped',
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
            voucher_types(name, code),
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

          const chartOfAccounts = otherTxns?.chart_of_accounts as any;
          if (chartOfAccounts?.account_name) {
            particularsName = chartOfAccounts.account_name;
          }
        }

        processedEntries.push({
          id: txn.id,
          transaction_date: txn.transaction_date,
          voucher_number: txn.vouchers?.voucher_number || 'N/A',
          voucher_type: txn.vouchers?.voucher_types?.name || 'Unknown',
          voucher_type_code: txn.vouchers?.voucher_types?.code || '',
          voucher_id: txn.vouchers?.id || '',
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
    const openingBalance = filteredEntries.length > 0 ? filteredEntries[0].balance - filteredEntries[0].debit + filteredEntries[0].credit : 0;
    const closingBalance = filteredEntries.length > 0 ? filteredEntries[filteredEntries.length - 1].balance : 0;
    return { totalDebit, totalCredit, openingBalance, closingBalance };
  };

  const exportLedgerToXLSX = () => {
    if (filteredEntries.length === 0) return;

    const exportData = filteredEntries.map(entry => ({
      'Date': formatDateDisplay(entry.transaction_date),
      'Voucher No': entry.voucher_number,
      'Type': entry.voucher_type,
      'Particulars': entry.particulars,
      'Debit': entry.debit,
      'Credit': entry.credit,
      'Balance': entry.balance,
    }));

    exportToXLSX(
      exportData,
      `ledger_${selectedAccount?.account_code}`,
      'Ledger Transactions'
    );
  };

  const exportLedgerToPDF = () => {
    if (filteredEntries.length === 0) return;

    const exportData = filteredEntries.map(entry => ({
      date: formatDateDisplay(entry.transaction_date),
      voucher: entry.voucher_number,
      particulars: entry.particulars,
      debit: entry.debit,
      credit: entry.credit,
      balance: entry.balance,
    }));

    const columns = [
      { header: 'Date', key: 'date' },
      { header: 'Voucher No', key: 'voucher' },
      { header: 'Particulars', key: 'particulars' },
      { header: 'Debit (₹)', key: 'debit' },
      { header: 'Credit (₹)', key: 'credit' },
      { header: 'Balance (₹)', key: 'balance' },
    ];

    exportToPDF(
      exportData,
      columns,
      `ledger_${selectedAccount?.account_code}`,
      'Ledger Transactions',
      `${selectedAccount?.account_code} - ${selectedAccount?.account_name}`
    );
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
    if (returnPath) {
      // Navigate back to the source page using the app's navigation system
      if (returnPath === '/reports' && onNavigate) {
        sessionStorage.removeItem('ledgerParams');
        onNavigate('reports');
      } else if (returnPath === '/chart-of-accounts' && onNavigate) {
        sessionStorage.removeItem('ledgerParams');
        onNavigate('chart-of-accounts');
      } else {
        // Fallback: use browser back button
        window.history.back();
      }
    } else {
      setSelectedAccount(null);
      setEntries([]);
      sessionStorage.removeItem('ledgerParams');
    }
  };

  const handleTransactionClick = async (entry: LedgerEntry) => {
    if (!entry.voucher_id) return;

    try {
      // Fetch full voucher details
      const { data: voucherData, error } = await supabase
        .from('vouchers')
        .select(`
          *,
          voucher_types(name, code),
          voucher_entries(
            id,
            account_id,
            debit_amount,
            credit_amount,
            narration,
            chart_of_accounts(account_code, account_name)
          )
        `)
        .eq('id', entry.voucher_id)
        .single();

      if (error) throw error;

      setSelectedVoucher(voucherData);

      // Check if it's an invoice voucher
      if (voucherData.voucher_types?.code === 'ITMINV') {
        // Fetch invoice items
        const { data: itemsData, error: itemsError } = await supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', entry.voucher_id)
          .order('id');

        if (itemsError) throw itemsError;
        setInvoiceItems(itemsData || []);
        setShowInvoiceModal(true);
      } else {
        setShowVoucherModal(true);
      }
    } catch (error) {
      console.error('Error fetching voucher:', error);
      toast.error('Failed to load voucher details');
    }
  };

  const handleVoucherModalClose = () => {
    setShowVoucherModal(false);
    setShowInvoiceModal(false);
    setSelectedVoucher(null);
    // Refresh ledger entries after editing
    if (selectedAccount) {
      fetchLedgerEntries();
    }
  };

  const renderVoucherModal = () => {
    if (!selectedVoucher) return null;

    const voucherTypeCode = selectedVoucher.voucher_types?.code;
    const voucherTypeId = selectedVoucher.voucher_type_id;

    switch (voucherTypeCode) {
      case 'PMT':
        return (
          <PaymentVoucherModal
            onClose={handleVoucherModalClose}
            voucherTypeId={voucherTypeId}
            editVoucher={selectedVoucher}
          />
        );
      case 'RCPT':
        return (
          <ReceiptVoucherModal
            onClose={handleVoucherModalClose}
            voucherTypeId={voucherTypeId}
            editVoucher={selectedVoucher}
          />
        );
      case 'JV':
        return (
          <JournalVoucherModal
            onClose={handleVoucherModalClose}
            voucherTypeId={voucherTypeId}
            editVoucher={selectedVoucher}
          />
        );
      case 'CNTR':
        return (
          <ContraVoucherModal
            onClose={handleVoucherModalClose}
            voucherTypeId={voucherTypeId}
            editVoucher={selectedVoucher}
          />
        );
      default:
        return null;
    }
  };

  const { totalDebit, totalCredit, openingBalance, closingBalance } = calculateTotals();
  const activeFiltersCount = getActiveFiltersCount();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 rounded-xl shadow-xl p-4 text-white flex-shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2">
            {selectedAccount && (
              <>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-lg transition-colors ${
                    showFilters
                      ? 'bg-white text-slate-800'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  } relative`}
                  title="Filters"
                >
                  <Filter className="w-5 h-5" />
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full min-w-[20px] text-center">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={exportLedgerToXLSX}
                  disabled={filteredEntries.length === 0}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                  title="Export to Excel"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                </button>
                <button
                  onClick={exportLedgerToPDF}
                  disabled={filteredEntries.length === 0}
                  className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                  title="Export to PDF"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={handleBackToSelection}
                  className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                  title="Back to account selection"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Account Selection */}
      {!selectedAccount ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex-1 overflow-auto">
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
          {/* Collapsible Filters Section */}
          {showFilters && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Filters & Date Range</h3>
                  {activeFiltersCount > 0 && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                      {activeFiltersCount} active
                    </span>
                  )}
                </div>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Date Range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                </div>

                {/* Search */}
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

                {/* Other Filters */}
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
            </div>
          )}

          {/* Transactions Table Container - Full Height with Fixed Bottom Panel */}
          <div className="flex flex-col flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {filteredEntries.length === 0 ? (
              <div className="p-12 text-center flex-1 flex flex-col items-center justify-center">
                <BookOpen className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
                <p className="text-gray-600">
                  {searchTerm || voucherTypeFilter || minAmount || maxAmount || transactionType !== 'all'
                    ? 'No transactions match your filter criteria'
                    : 'No transactions for this account in the selected period'}
                </p>
              </div>
            ) : (
              <>
                {/* Fixed Title Bar */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Ledger Transactions</h2>
                    <div className="text-sm text-gray-600">
                      {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
                    </div>
                  </div>
                </div>

                {/* Fixed Table Headers */}
                <div className="flex-shrink-0 bg-gradient-to-r from-slate-700 to-slate-600">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white" style={{ width: '12%' }}>
                          Date
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white" style={{ width: '13%' }}>
                          Voucher No.
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-white" style={{ width: '30%' }}>
                          Particulars
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-white" style={{ width: '15%' }}>
                          Debit (₹)
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-white" style={{ width: '15%' }}>
                          Credit (₹)
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-white" style={{ width: '15%' }}>
                          Balance (₹)
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Scrollable Transaction Rows Only */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredEntries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="hover:bg-blue-50 transition-colors cursor-pointer group"
                          onClick={() => handleTransactionClick(entry)}
                          title="Click to view/edit voucher"
                        >
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900" style={{ width: '12%' }}>
                            <div className="flex items-center gap-2">
                              {formatDateDisplay(entry.transaction_date)}
                              {entry.voucher_id && (
                                <Edit2 className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap" style={{ width: '13%' }}>
                            <div className="flex flex-col">
                              <span className="font-mono text-sm text-blue-600 font-medium">
                                {entry.voucher_number}
                              </span>
                              <span className="text-xs text-gray-500">{entry.voucher_type}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm font-medium text-gray-900" style={{ width: '30%' }}>
                            {entry.particulars}
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap" style={{ width: '15%' }}>
                            {entry.debit > 0 ? (
                              <span className="text-sm font-semibold text-blue-600">
                                ₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap" style={{ width: '15%' }}>
                            {entry.credit > 0 ? (
                              <span className="text-sm font-semibold text-red-600">
                                ₹{entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap" style={{ width: '15%' }}>
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
                </div>

                {/* Fixed Bottom Summary Panel */}
                <div className="flex-shrink-0 border-t-4 border-slate-700 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50">
                  <table className="w-full">
                    <tbody>
                      {/* Opening Balance Row */}
                      <tr className="border-b-2 border-slate-300 bg-gradient-to-r from-blue-50 to-slate-50">
                        <td className="px-6 py-3 text-left font-semibold text-slate-800 text-sm" style={{ width: '55%' }}>
                          Opening Balance
                        </td>
                        <td className="px-6 py-3 text-right" style={{ width: '15%' }}></td>
                        <td className="px-6 py-3 text-right" style={{ width: '15%' }}></td>
                        <td className="px-6 py-3 text-right" style={{ width: '15%' }}>
                          <span className={`text-base font-bold ${
                            openingBalance >= 0 ? 'text-green-700' : 'text-red-700'
                          }`}>
                            ₹{Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            <span className="text-xs ml-2 font-bold bg-white/60 px-2 py-0.5 rounded">{openingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                          </span>
                        </td>
                      </tr>

                      {/* Totals Row */}
                      <tr className="bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300 border-b-4 border-slate-500">
                        <td className="px-6 py-4 text-left font-black text-slate-900 text-base uppercase tracking-wide" style={{ width: '55%' }}>
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            Total
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right" style={{ width: '15%' }}>
                          <span className="text-lg font-black text-blue-800">
                            ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right" style={{ width: '15%' }}>
                          <span className="text-lg font-black text-red-800">
                            ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right" style={{ width: '15%' }}></td>
                      </tr>

                      {/* Closing Balance Row */}
                      <tr className="bg-gradient-to-r from-slate-50 to-blue-50">
                        <td className="px-6 py-3 text-left font-semibold text-slate-800 text-sm" style={{ width: '55%' }}>
                          Closing Balance
                        </td>
                        <td className="px-6 py-3 text-right" style={{ width: '15%' }}></td>
                        <td className="px-6 py-3 text-right" style={{ width: '15%' }}></td>
                        <td className="px-6 py-3 text-right" style={{ width: '15%' }}>
                          <span className={`text-base font-bold ${
                            closingBalance >= 0 ? 'text-green-700' : 'text-red-700'
                          }`}>
                            ₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            <span className="text-xs ml-2 font-bold bg-white/60 px-2 py-0.5 rounded">{closingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>

    {/* Voucher Modals */}
    {showVoucherModal && renderVoucherModal()}
    {showInvoiceModal && selectedVoucher && invoiceItems && (
      <EditInvoiceModal
        invoice={selectedVoucher}
        items={invoiceItems}
        onClose={handleVoucherModalClose}
        onSave={handleVoucherModalClose}
      />
    )}
    </>
  );
}
