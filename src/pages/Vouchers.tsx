import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, FileText, Search, Filter, X, Eye, Edit2, Trash2, Calendar, Printer, CheckCircle, XCircle, DollarSign, ArrowUpDown, MoreHorizontal, BookOpen } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';

import { formatDateDisplay } from '../lib/dateUtils';

interface VoucherType {
  id: string;
  name: string;
  code: string;
}

interface VoucherEntry {
  id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  narration: string;
  chart_of_accounts?: {
    account_code: string;
    account_name: string;
  };
}

interface Voucher {
  id: string;
  voucher_number: string;
  voucher_date: string;
  reference_number: string;
  narration: string;
  total_amount: number;
  status: string;
  voucher_type_id: string;
  voucher_types: { name: string; code: string };
  voucher_entries?: VoucherEntry[];
}

interface VoucherTypeStats {
  type: VoucherType;
  count: number;
  totalAmount: number;
  vouchers: Voucher[];
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  posted: 'bg-green-100 text-green-700 border-green-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
};

interface VouchersProps {
  onNavigate?: (page: string, params?: any) => void;
  headerAction?: React.ReactNode;
}

export default function Vouchers({ onNavigate, headerAction }: VouchersProps) {
  const { user } = useAuth();
  const toast = useToast();
  const { showConfirmation } = useConfirmation();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
  const [accountMap, setAccountMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'number'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [vouchersResult, typesResult, accountsResult] = await Promise.all([
        supabase
          .from('vouchers')
          .select(`
            *,
            voucher_types(name, code),
            voucher_entries(
              id,
              account_id,
              debit_amount,
              credit_amount,
              narration
            )
          `)
          .order('voucher_date', { ascending: false }),
        supabase
          .from('voucher_types')
          .select('*')
          .eq('is_active', true)
          .not('code', 'in', '(SALES,PURCHASE,ITMINV)')
          .order('display_order', { nullsFirst: false }),
        supabase
          .from('chart_of_accounts')
          .select('id, account_name, account_code'),
      ]);

      if (vouchersResult.error) throw vouchersResult.error;
      if (typesResult.error) throw typesResult.error;
      if (accountsResult.error) throw accountsResult.error;

      setVouchers(vouchersResult.data || []);
      setVoucherTypes(typesResult.data || []);

      const accMap = new Map<string, string>();
      accountsResult.data?.forEach(acc => {
        accMap.set(acc.id, acc.account_name);
      });
      setAccountMap(accMap);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  };

  const getLedgerDisplay = (voucher: Voucher) => {
    if (!voucher.voucher_entries || voucher.voucher_entries.length === 0) return 'No entries';

    // Simple logic: Find the first debit and first credit entry to show "DebitAcc vs CreditAcc" or similar
    const debits = voucher.voucher_entries.filter(e => e.debit_amount > 0);
    const credits = voucher.voucher_entries.filter(e => e.credit_amount > 0);

    if (debits.length === 1 && credits.length === 1) {
      // Simple Journal
      return accountMap.get(debits[0].account_id) || 'Unknown Account';
    } else if (debits.length > 0) {
      return accountMap.get(debits[0].account_id) || 'Multiple Accounts';
    }
    return 'Multiple Accounts';
  };

  const getSecondaryLedgerDisplay = (voucher: Voucher) => {
    if (!voucher.voucher_entries) return '';
    const debits = voucher.voucher_entries.filter(e => e.debit_amount > 0);
    const credits = voucher.voucher_entries.filter(e => e.credit_amount > 0);

    if (debits.length === 1 && credits.length === 1) {
      return accountMap.get(credits[0].account_id) || '';
    }
    return '';
  };


  const handleDelete = async (id: string, voucherNumber: string) => {
    showConfirmation({
      title: 'Delete Voucher',
      message: `Are you sure you want to delete voucher ${voucherNumber}? This will also remove all related ledger entries.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('vouchers').delete().eq('id', id);
          if (error) throw error;
          toast.success('Voucher deleted successfully');
          fetchData();
        } catch (error: any) {
          console.error('Error deleting voucher:', error);
          toast.error(error.message || 'Failed to delete voucher');
        }
      },
    });
  };

  const handlePost = async (id: string, voucherNumber: string) => {
    showConfirmation({
      title: 'Post Voucher',
      message: `Post voucher ${voucherNumber}? This will affect your ledgers.`,
      confirmText: 'Post',
      cancelText: 'Cancel',
      confirmColor: 'green',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('vouchers')
            .update({ status: 'posted', updated_at: new Date().toISOString() })
            .eq('id', id);

          if (error) throw error;
          toast.success('Voucher posted successfully');
          fetchData();
        } catch (error: any) {
          console.error('Error posting voucher:', error);
          toast.error(error.message || 'Failed to post voucher');
        }
      },
    });
  };

  const handleEdit = (voucher: Voucher) => {
    if (onNavigate) {
      onNavigate('create-voucher', { id: voucher.id });
    }
  };

  const handleView = async (voucher: Voucher) => {
    try {
      const { data: entries } = await supabase
        .from('voucher_entries')
        .select('*, chart_of_accounts(account_code, account_name)')
        .eq('voucher_id', voucher.id);

      if (entries) {
        setSelectedVoucher({ ...voucher, voucher_entries: entries });
      }
    } catch (error) {
      console.error('Error loading voucher details:', error);
      toast.error('Failed to load voucher details');
    }
  };

  const handlePrint = async (voucher: Voucher) => {
    try {
      const { data: entries } = await supabase
        .from('voucher_entries')
        .select('*, chart_of_accounts(account_code, account_name)')
        .eq('voucher_id', voucher.id);

      if (!entries) {
        toast.error('Failed to load voucher entries');
        return;
      }

      const voucherType = voucherTypes.find(t => t.id === voucher.voucher_type_id);
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow popups to print vouchers');
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Voucher - ${voucher.voucher_number}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .header h1 { margin: 0; color: #1a1a1a; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
            .header h2 { margin: 10px 0 0; color: #666; font-size: 16px; font-weight: normal; }
            .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .info-item { margin-bottom: 10px; }
            .info-label { font-weight: 600; color: #555; font-size: 13px; text-transform: uppercase; }
            .info-value { font-size: 15px; margin-top: 4px; }
            .entries-table { width: 100%; border-collapse: collapse; margin: 30px 0; font-size: 14px; }
            .entries-table th { background: #f8f9fa; padding: 12px; text-align: left; border-bottom: 2px solid #ddd; font-weight: 600; color: #444; }
            .entries-table td { padding: 12px; border-bottom: 1px solid #eee; }
            .entries-table tr:last-child td { border-bottom: none; }
            .text-right { text-align: right; }
            .total-row td { background: #f8f9fa; font-weight: bold; border-top: 2px solid #ddd; border-bottom: none; }
            .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { border-top: 1px solid #ccc; margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${voucherType?.name || 'Voucher'}</h1>
            <h2>${voucher.voucher_number}</h2>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Date</div>
              <div class="info-value">${formatDateDisplay(voucher.voucher_date)}</div>
            </div>
            <div class="info-item">
               <div class="info-label">Status</div>
               <div class="info-value">${voucher.status.toUpperCase()}</div>
            </div>
            ${voucher.reference_number ? `
            <div class="info-item">
              <div class="info-label">Reference</div>
              <div class="info-value">${voucher.reference_number}</div>
            </div>` : ''}
            ${voucher.narration ? `
            <div class="info-item" style="grid-column: span 2;">
              <div class="info-label">Narration</div>
              <div class="info-value">${voucher.narration}</div>
            </div>` : ''}
          </div>

          <table class="entries-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Narration</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((entry: any) => `
                <tr>
                  <td>${entry.chart_of_accounts?.account_name || 'Unknown Account'}</td>
                  <td>${entry.narration || ''}</td>
                  <td class="text-right">${entry.debit_amount > 0 ? entry.debit_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
                  <td class="text-right">${entry.credit_amount > 0 ? entry.credit_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2">Total</td>
                <td class="text-right">${entries.reduce((sum: number, e: any) => sum + (e.debit_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-right">${entries.reduce((sum: number, e: any) => sum + (e.credit_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <div class="signatures">
            <div class="signature-box">
              <div class="signature-line"></div>
              Prepared By
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              Approved By
            </div>
          </div>

          <div class="footer">
            Generated on ${new Date().toLocaleString()}
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
    } catch (error) {
      console.error('Error printing voucher:', error);
      toast.error('Failed to print voucher');
    }
  };

  const handleCancel = async (id: string, voucherNumber: string) => {
    showConfirmation({
      title: 'Cancel Voucher',
      message: `Cancel voucher ${voucherNumber}? This will reverse ledger entries.`,
      confirmText: 'Yes, Cancel',
      cancelText: 'No',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('vouchers')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', id);

          if (error) throw error;
          toast.success('Voucher cancelled successfully');
          fetchData();
        } catch (error: any) {
          console.error('Error cancelling voucher:', error);
          toast.error(error.message || 'Failed to cancel voucher');
        }
      },
    });
  };

  const applyDateFilter = (voucher: Voucher) => {
    if (dateFilter === 'all') return true;
    const now = new Date();
    const voucherDate = new Date(voucher.voucher_date);
    switch (dateFilter) {
      case 'today':
        return voucherDate.toDateString() === now.toDateString();
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return voucherDate >= weekAgo;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return voucherDate >= monthAgo;
      default:
        return true;
    }
  };

  const filteredVouchers = vouchers
    .filter((voucher) => {
      const matchesType = selectedTypeId ? voucher.voucher_type_id === selectedTypeId : true;
      const matchesSearch =
        searchQuery === '' ||
        voucher.voucher_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        voucher.narration?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        voucher.reference_number?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'all' || voucher.status === filterStatus;
      const matchesDate = applyDateFilter(voucher);
      return matchesType && matchesSearch && matchesStatus && matchesDate;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.voucher_date).getTime() - new Date(b.voucher_date).getTime();
          break;
        case 'amount':
          comparison = a.total_amount - b.total_amount;
          break;
        case 'number':
          comparison = a.voucher_number.localeCompare(b.voucher_number);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const selectedType = selectedTypeId ? voucherTypes.find(t => t.id === selectedTypeId) : null;

  return (
    <div className="space-y-6">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedType ? `${selectedType.name}s` : 'Accounting Vouchers'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">Manage journal, receipt, payment, and contra vouchers.</p>
          </div>

          <div className="flex gap-2">
            {headerAction}
            <button
              onClick={() => {
                // Navigate to create with type pre-selected if we are in a type view
                onNavigate?.('create-voucher', selectedType ? { type: selectedType.name } : undefined);
              }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
            >
              <Plus className="w-5 h-5" />
              <span>Create Voucher</span>
            </button>
          </div>
        </div>

        {/* Type Navigation Tabs - Always Visible */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedTypeId(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors ${selectedTypeId === null
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
          >
            All Vouchers
          </button>
          {voucherTypes.map(type => (
            <button
              key={type.id}
              onClick={() => setSelectedTypeId(type.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors ${selectedTypeId === type.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
            >
              {type.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 lg:pl-12 lg:pr-8 space-y-6">
        {/* Filters and Search */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between">
          <div className="flex gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search voucher #, narration..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            {['all', 'draft', 'posted', 'cancelled'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${filterStatus === status
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Vouchers Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Voucher #</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account / Narration</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredVouchers.map((voucher) => (
                  <tr
                    key={voucher.id}
                    onClick={() => handleView(voucher)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateDisplay(voucher.voucher_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                      {voucher.voucher_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {voucher.voucher_types.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-xs" title={getLedgerDisplay(voucher)}>
                        {getLedgerDisplay(voucher)}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{voucher.narration || getSecondaryLedgerDisplay(voucher)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      ₹{voucher.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${statusColors[voucher.status as keyof typeof statusColors]}`}>
                        {voucher.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2 text-gray-400 group-hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {voucher.status === 'draft' && (
                          <button onClick={() => handlePost(voucher.id, voucher.voucher_number)} className="p-1.5 hover:text-green-600 hover:bg-green-50 rounded" title="Post"><CheckCircle className="w-4 h-4" /></button>
                        )}
                        {voucher.status === 'posted' && (
                          <button onClick={() => handleCancel(voucher.id, voucher.voucher_number)} className="p-1.5 hover:text-orange-600 hover:bg-orange-50 rounded" title="Cancel"><XCircle className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => handlePrint(voucher)} className="p-1.5 hover:text-purple-600 hover:bg-purple-50 rounded" title="Print"><Printer className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(voucher)} className="p-1.5 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(voucher.id, voucher.voucher_number)} className="p-1.5 hover:text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredVouchers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-base font-medium text-gray-900">No vouchers found</p>
                        <p className="text-sm text-gray-500 mt-1">Create a new voucher to get started.</p>
                        <button
                          onClick={() => onNavigate?.('create-voucher')}
                          className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
                        >
                          Create Voucher
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500">
            Showing {filteredVouchers.length} vouchers
          </div>
        </div>
      </div>

      {/* Voucher Details Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedVoucher.voucher_types.name}</h2>
                <p className="text-sm text-gray-500">{selectedVoucher.voucher_number}</p>
              </div>
              <button onClick={() => setSelectedVoucher(null)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                  <p className="mt-1 font-medium text-gray-900">{formatDateDisplay(selectedVoucher.voucher_date)}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
                  <p className="mt-1"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${statusColors[selectedVoucher.status as keyof typeof statusColors]}`}>{selectedVoucher.status}</span></p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</label>
                  <p className="mt-1 font-medium text-gray-900">{selectedVoucher.reference_number || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Amount</label>
                  <p className="mt-1 font-bold text-blue-600">₹{selectedVoucher.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                {selectedVoucher.narration && (
                  <div className="col-span-2 md:col-span-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Narration</label>
                    <p className="mt-1 text-sm text-gray-700">{selectedVoucher.narration}</p>
                  </div>
                )}
              </div>

              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                Ledger Entries
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Account</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Debit</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedVoucher.voucher_entries?.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 text-gray-900">
                          {entry.chart_of_accounts?.account_name || accountMap.get(entry.account_id) || 'Unknown Account'}
                          <div className="text-xs text-gray-500">{entry.chart_of_accounts?.account_code}</div>
                          {entry.narration && <div className="text-xs text-gray-500 italic mt-0.5">{entry.narration}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {entry.debit_amount > 0 ? `₹${entry.debit_amount.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {entry.credit_amount > 0 ? `₹${entry.credit_amount.toLocaleString('en-IN')}` : '-'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-3 text-gray-900 text-right">Total</td>
                      <td className="px-4 py-3 text-right text-blue-600">
                        ₹{selectedVoucher.voucher_entries?.reduce((s, e) => s + (e.debit_amount || 0), 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600">
                        ₹{selectedVoucher.voucher_entries?.reduce((s, e) => s + (e.credit_amount || 0), 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => handlePrint(selectedVoucher)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={() => handleEdit(selectedVoucher)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
              >
                <Edit2 className="w-4 h-4" /> Edit Voucher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
