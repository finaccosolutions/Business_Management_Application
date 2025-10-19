import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, FileText, Search, Filter, X, Eye, Edit2, Trash2, Calendar, Printer, Download, CheckCircle, XCircle, DollarSign, ArrowUpDown } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';
import PaymentVoucherModal from '../components/accounting/PaymentVoucherModal';
import ReceiptVoucherModal from '../components/accounting/ReceiptVoucherModal';
import JournalVoucherModal from '../components/accounting/JournalVoucherModal';
import ContraVoucherModal from '../components/accounting/ContraVoucherModal';
import SetupVoucherTypes from '../components/accounting/SetupVoucherTypes';
import InvoiceFormModal from '../components/InvoiceFormModal';
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
  draft: 'bg-gray-100 text-gray-700',
  posted: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const getVoucherTypeColor = (code: string, index: number) => {
  if (code === 'ITMINV') {
    return 'from-amber-500 to-orange-600';
  }
  const colors = [
    'from-blue-500 to-blue-600',
    'from-green-500 to-green-600',
    'from-cyan-500 to-cyan-600',
    'from-red-500 to-red-600',
    'from-teal-500 to-teal-600',
    'from-slate-500 to-slate-600',
  ];
  return colors[index % colors.length];
};

interface VoucherTileProps {
  voucher: Voucher;
  onView: (voucher: Voucher) => void;
  onEdit: (voucher: Voucher) => void;
  onPost: (id: string, number: string) => void;
  onPrint: (voucher: Voucher) => void;
  onCancel: (id: string, number: string) => void;
  onDelete: (id: string, number: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

function VoucherTile({ voucher, onView, onEdit, onPost, onPrint, onCancel, onDelete, onStatusChange }: VoucherTileProps) {
  const [accounts, setAccounts] = useState<{ [key: string]: string }>({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (voucher.voucher_entries && voucher.voucher_entries.length > 0) {
        const accountIds = voucher.voucher_entries.map(e => e.account_id).filter(Boolean);
        if (accountIds.length > 0) {
          const { data } = await supabase
            .from('chart_of_accounts')
            .select('id, account_name')
            .in('id', accountIds);

          if (data) {
            const accountMap: { [key: string]: string } = {};
            data.forEach(acc => {
              accountMap[acc.id] = acc.account_name;
            });
            setAccounts(accountMap);
          }
        }
      }
      setLoadingAccounts(false);
    };
    fetchAccounts();
  }, [voucher.voucher_entries]);

  const getLedgerInfo = () => {
    if (!voucher.voucher_entries || voucher.voucher_entries.length === 0) {
      return { primary: 'No ledger entries', secondary: '' };
    }

    const debitEntry = voucher.voucher_entries.find(e => e.debit_amount > 0);
    const creditEntry = voucher.voucher_entries.find(e => e.credit_amount > 0);

    if (debitEntry && creditEntry) {
      return {
        primary: accounts[debitEntry.account_id] || 'Loading...',
        secondary: accounts[creditEntry.account_id] || 'Loading...'
      };
    }

    return { primary: 'Multiple entries', secondary: '' };
  };

  const ledgerInfo = getLedgerInfo();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-200 dark:border-slate-700 hover:shadow-xl transition-all duration-200">
      <div className="p-5">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left Section - Main Info */}
          <div className="flex-1">
            <div className="flex items-start gap-4">
              <div className={`p-3 bg-gradient-to-br rounded-lg flex-shrink-0 ${
                voucher.status === 'posted'
                  ? 'from-green-100 to-emerald-200 dark:from-green-900/40 dark:to-emerald-900/40'
                  : voucher.status === 'cancelled'
                  ? 'from-red-100 to-rose-200 dark:from-red-900/40 dark:to-rose-900/40'
                  : 'from-blue-100 to-cyan-200 dark:from-blue-900/40 dark:to-cyan-900/40'
              }`}>
                <FileText className={`w-6 h-6 ${
                  voucher.status === 'posted'
                    ? 'text-green-700 dark:text-green-300'
                    : voucher.status === 'cancelled'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-blue-700 dark:text-blue-300'
                }`} />
              </div>

              <div className="flex-1">
                {/* Ledger Names - Most Prominent */}
                <div className="mb-3">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{ledgerInfo.primary}</h3>
                  {ledgerInfo.secondary && (
                    <p className="text-lg text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4" />
                      {ledgerInfo.secondary}
                    </p>
                  )}
                </div>

                {/* Voucher Details */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="px-3 py-1 text-sm font-semibold rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300">
                    {voucher.voucher_number}
                  </span>
                  <span
                    className={`px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1.5 ${
                      statusColors[voucher.status as keyof typeof statusColors]
                    }`}
                  >
                    {voucher.status === 'posted' && <CheckCircle className="w-3.5 h-3.5" />}
                    {voucher.status === 'cancelled' && <XCircle className="w-3.5 h-3.5" />}
                    {voucher.status.toUpperCase()}
                  </span>
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {voucher.voucher_types.name}
                  </span>
                </div>

                {/* Secondary Info Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Date</p>
                    <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {formatDateDisplay(voucher.voucher_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Amount</p>
                    <p className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />
                      ₹{voucher.total_amount.toLocaleString('en-IN')}
                    </p>
                  </div>
                  {voucher.reference_number && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Reference</p>
                      <p className="font-medium text-gray-900 dark:text-white truncate">{voucher.reference_number}</p>
                    </div>
                  )}
                </div>

                {voucher.narration && (
                  <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-400 line-clamp-2">{voucher.narration}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Section - Actions */}
          <div className="flex flex-col gap-2 lg:w-64">
            {/* Status Dropdown */}
            <select
              value={voucher.status}
              onChange={(e) => onStatusChange(voucher.id, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Action Buttons - 2 Column Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onView(voucher)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-xs font-medium"
              >
                <Eye className="w-4 h-4" />
                <span>View</span>
              </button>

              <button
                onClick={() => onEdit(voucher)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-xs font-medium"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit</span>
              </button>

              {voucher.status === 'draft' && (
                <button
                  onClick={() => onPost(voucher.id, voucher.voucher_number)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors text-xs font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Post</span>
                </button>
              )}

              <button
                onClick={() => onPrint(voucher)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-xs font-medium"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>

              {voucher.status === 'posted' && (
                <button
                  onClick={() => onCancel(voucher.id, voucher.voucher_number)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors text-xs font-medium"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              )}

              <button
                onClick={() => onDelete(voucher.id, voucher.voucher_number)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-xs font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VouchersProps {
  onNavigate?: (page: string) => void;
}

const VoucherTileMemo = VoucherTile;

export default function Vouchers({ onNavigate }: VouchersProps) {
  const { user } = useAuth();
  const toast = useToast();
  const { showConfirmation } = useConfirmation();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [invoicesTotalAmount, setInvoicesTotalAmount] = useState(0);
  const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedVoucherType, setSelectedVoucherType] = useState<VoucherType | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [vouchersResult, typesResult, invoicesResult] = await Promise.all([
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
          .from('invoices')
          .select('subtotal')
          .order('created_at', { ascending: false }),
      ]);

      if (vouchersResult.error) throw vouchersResult.error;
      if (typesResult.error) throw typesResult.error;
      if (invoicesResult.error) throw invoicesResult.error;

      setVouchers(vouchersResult.data || []);
      setVoucherTypes(typesResult.data || []);

      const invoicesData = invoicesResult.data || [];
      setInvoiceCount(invoicesData.length);
      setInvoicesTotalAmount(invoicesData.reduce((sum, inv) => sum + inv.subtotal, 0));

      if ((typesResult.data || []).length === 0) {
        setShowSetup(true);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, voucherNumber: string) => {
    showConfirmation({
      title: 'Delete Voucher',
      message: `Are you sure you want to delete voucher ${voucherNumber}? This will also remove all related ledger entries. This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('vouchers').delete().eq('id', id);
          if (error) throw error;
          toast.success('Voucher and all related records deleted successfully');
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
      message: `Are you sure you want to post voucher ${voucherNumber}? Once posted, it will create ledger entries.`,
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

  const handleEdit = async (voucher: Voucher) => {
    const voucherType = voucherTypes.find(t => t.id === voucher.voucher_type_id);
    if (voucherType) {
      setSelectedVoucher(voucher);
      setSelectedVoucherType(voucherType);
      setShowModal(true);
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
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .header h1 { margin: 0; color: #333; }
            .header h2 { margin: 5px 0; color: #666; }
            .info-section { margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; margin: 8px 0; }
            .info-label { font-weight: bold; color: #555; }
            .entries-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .entries-table th { background: #f5f5f5; padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: bold; }
            .entries-table td { padding: 10px; border: 1px solid #ddd; }
            .entries-table tr:nth-child(even) { background: #fafafa; }
            .total-row { font-weight: bold; background: #f5f5f5 !important; }
            .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; }
            .signature-section { margin-top: 60px; display: flex; justify-content: space-between; }
            .signature { text-align: center; }
            .signature-line { width: 200px; border-top: 1px solid #333; margin-top: 50px; }
            @media print {
              body { margin: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${voucherType?.name || 'Voucher'}</h1>
            <h2>Voucher No: ${voucher.voucher_number}</h2>
          </div>

          <div class="info-section">
            <div class="info-row">
              <span><span class="info-label">Date:</span> ${formatDateDisplay(voucher.voucher_date)}</span>
              <span><span class="info-label">Status:</span> ${voucher.status.toUpperCase()}</span>
            </div>
            ${voucher.reference_number ? `
            <div class="info-row">
              <span><span class="info-label">Reference:</span> ${voucher.reference_number}</span>
            </div>
            ` : ''}
            ${voucher.narration ? `
            <div class="info-row">
              <span><span class="info-label">Narration:</span> ${voucher.narration}</span>
            </div>
            ` : ''}
          </div>

          <table class="entries-table">
            <thead>
              <tr>
                <th>Account</th>
                <th style="text-align: right;">Debit (₹)</th>
                <th style="text-align: right;">Credit (₹)</th>
                <th>Particulars</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((entry: any) => `
                <tr>
                  <td>${entry.chart_of_accounts?.account_code || ''} - ${entry.chart_of_accounts?.account_name || 'Unknown Account'}</td>
                  <td style="text-align: right;">${entry.debit_amount > 0 ? entry.debit_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                  <td style="text-align: right;">${entry.credit_amount > 0 ? entry.credit_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                  <td>${entry.narration || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td>Total</td>
                <td style="text-align: right;">${entries.reduce((sum: number, e: any) => sum + (e.debit_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="text-align: right;">${entries.reduce((sum: number, e: any) => sum + (e.credit_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div class="signature-section">
            <div class="signature">
              <div class="signature-line"></div>
              <p>Prepared By</p>
            </div>
            <div class="signature">
              <div class="signature-line"></div>
              <p>Approved By</p>
            </div>
          </div>

          <div class="footer" style="text-align: center; color: #888; font-size: 12px;">
            <p>This is a computer generated voucher</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
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
      message: `Are you sure you want to cancel voucher ${voucherNumber}? This will reverse all ledger entries.`,
      confirmText: 'Cancel Voucher',
      cancelText: 'Go Back',
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

  const voucherTypeStats: VoucherTypeStats[] = voucherTypes.map((type) => {
    const typeVouchers = vouchers.filter((v) => v.voucher_type_id === type.id);
    return {
      type,
      count: typeVouchers.length,
      totalAmount: typeVouchers.reduce((sum, v) => sum + v.total_amount, 0),
      vouchers: typeVouchers,
    };
  });

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

  const filteredVouchers = selectedTypeId
    ? vouchers.filter((voucher) => {
        const matchesType = voucher.voucher_type_id === selectedTypeId;
        const matchesSearch =
          searchQuery === '' ||
          voucher.voucher_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          voucher.narration?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          voucher.reference_number?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'all' || voucher.status === filterStatus;
        const matchesDate = applyDateFilter(voucher);
        return matchesType && matchesSearch && matchesStatus && matchesDate;
      })
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (selectedTypeId) {
    const selectedType = voucherTypes.find((t) => t.id === selectedTypeId);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <button
              onClick={() => setSelectedTypeId(null)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-2 flex items-center gap-2 transition-colors"
            >
              ← Back to All Voucher Types
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{selectedType?.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Manage {selectedType?.name.toLowerCase()} vouchers</p>
          </div>
          <button
            onClick={() => {
              setSelectedVoucherType(selectedType || null);
              setShowModal(true);
            }}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span>Create {selectedType?.name}</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by voucher number, reference, or narration..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {['all', 'draft', 'posted', 'cancelled'].map((status) => {
              const count = filteredVouchers.filter(v => status === 'all' || v.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    filterStatus === status
                      ? 'bg-white/30 text-white'
                      : 'bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-gray-300'
                  }`}>
                    {status === 'all' ? vouchers.filter(v => v.voucher_type_id === selectedTypeId).length : count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {filteredVouchers.map((voucher) => (
            <VoucherTile
              key={voucher.id}
              voucher={voucher}
              onView={handleView}
              onEdit={handleEdit}
              onPost={handlePost}
              onPrint={handlePrint}
              onCancel={handleCancel}
              onDelete={handleDelete}
              onStatusChange={async (id, status) => {
                try {
                  const { error } = await supabase
                    .from('vouchers')
                    .update({ status, updated_at: new Date().toISOString() })
                    .eq('id', id);
                  if (error) throw error;
                  toast.success(`Voucher status changed to ${status}`);
                  fetchData();
                } catch (error: any) {
                  console.error('Error updating status:', error);
                  toast.error('Failed to update status');
                }
              }}
            />
          ))}

          {filteredVouchers.length === 0 && (
            <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-800 dark:to-slate-700 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600">
              <FileText className="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No vouchers found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">Create your first voucher to get started</p>
              <button
                onClick={() => {
                  const selectedType = voucherTypes.find(t => t.id === selectedTypeId);
                  setSelectedVoucherType(selectedType || null);
                  setShowModal(true);
                }}
                className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-4 rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Voucher</span>
              </button>
            </div>
          )}
        </div>

        {showModal && selectedVoucherType && (
          <>
            {selectedVoucherType.code.toUpperCase() === 'ITMPMT' || selectedVoucherType.code.toUpperCase() === 'PV' ? (
              <PaymentVoucherModal
                onClose={() => {
                  setShowModal(false);
                  setSelectedVoucherType(null);
                  fetchData();
                }}
                voucherTypeId={selectedVoucherType.id}
              />
            ) : selectedVoucherType.code.toUpperCase() === 'ITMRCT' || selectedVoucherType.code.toUpperCase() === 'RV' ? (
              <ReceiptVoucherModal
                onClose={() => {
                  setShowModal(false);
                  setSelectedVoucherType(null);
                  fetchData();
                }}
                voucherTypeId={selectedVoucherType.id}
              />
            ) : selectedVoucherType.code.toUpperCase() === 'ITMCNT' || selectedVoucherType.code.toUpperCase() === 'CV' ? (
              <ContraVoucherModal
                onClose={() => {
                  setShowModal(false);
                  setSelectedVoucherType(null);
                  fetchData();
                }}
                voucherTypeId={selectedVoucherType.id}
              />
            ) : (
              <JournalVoucherModal
                onClose={() => {
                  setShowModal(false);
                  setSelectedVoucherType(null);
                  fetchData();
                }}
                voucherTypeId={selectedVoucherType.id}
                voucherTypeName={selectedVoucherType.name}
              />
            )}
          </>
        )}

        {selectedVoucher && !showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-cyan-600">
                <h2 className="text-2xl font-bold text-white">Voucher Details</h2>
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Voucher Number</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedVoucher.voucher_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Date</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatDateDisplay(selectedVoucher.voucher_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Type</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedVoucher.voucher_types.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedVoucher.status.toUpperCase()}</p>
                    </div>
                    {selectedVoucher.reference_number && (
                      <div className="col-span-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Reference Number</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedVoucher.reference_number}</p>
                      </div>
                    )}
                    {selectedVoucher.narration && (
                      <div className="col-span-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Narration</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedVoucher.narration}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Entries</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Account</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Debit</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Credit</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Narration</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                          {selectedVoucher.voucher_entries?.map((entry: any) => (
                            <tr key={entry.id}>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {entry.chart_of_accounts?.account_code || ''} - {entry.chart_of_accounts?.account_name || 'Loading...'}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                                {entry.debit_amount > 0 ? `₹${entry.debit_amount.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                                {entry.credit_amount > 0 ? `₹${entry.credit_amount.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.narration || '-'}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 dark:bg-slate-700 font-bold">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                              ₹{selectedVoucher.voucher_entries?.reduce((sum: number, e: any) => sum + (e.debit_amount || 0), 0).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                              ₹{selectedVoucher.voucher_entries?.reduce((sum: number, e: any) => sum + (e.credit_amount || 0), 0).toLocaleString('en-IN')}
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Voucher Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage all accounting vouchers and invoices for service transactions</p>
        </div>
      </div>

      {/* Invoices Section */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FileText className="w-6 h-6 text-amber-600" />
          Customer Invoices
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          onClick={() => {
            if (onNavigate) {
              onNavigate('invoices-list');
            }
          }}
          className="group bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden border-2 border-amber-300 dark:border-amber-700 text-left"
        >
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-white/20 rounded-lg">
                <FileText className="w-8 h-8" />
              </div>
              <div className="text-right">
                <p className="text-white/80 text-sm font-medium">Total Count</p>
                <p className="text-3xl font-bold">{invoiceCount}</p>
              </div>
            </div>
            <h2 className="text-2xl font-bold">Invoices</h2>
          </div>

          <div className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Amount</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  ₹{invoicesTotalAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Type</span>
                <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                  INVOICE
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium group-hover:translate-x-2 transition-transform">
                View All →
              </p>
            </div>
          </div>
        </button>
        </div>
      </div>

      {/* Accounting Vouchers Section */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Accounting Vouchers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {voucherTypeStats.map((stat, index) => (
          <button
            key={stat.type.id}
            onClick={() => setSelectedTypeId(stat.type.id)}
            className="group bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden border border-gray-200 dark:border-slate-700 text-left"
          >
            <div className={`bg-gradient-to-r ${getVoucherTypeColor(stat.type.code, index)} p-6 text-white`}>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-white/20 rounded-lg">
                  <FileText className="w-8 h-8" />
                </div>
                <div className="text-right">
                  <p className="text-white/80 text-sm font-medium">Total Count</p>
                  <p className="text-3xl font-bold">{stat.count}</p>
                </div>
              </div>
              <h2 className="text-2xl font-bold">{stat.type.name}</h2>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total Amount</span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    ₹{stat.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Code</span>
                  <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                    {stat.type.code}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium group-hover:translate-x-2 transition-transform">
                  View All →
                </p>
              </div>
            </div>
          </button>
        ))}
        </div>
      </div>

      {voucherTypeStats.length === 0 && (
        <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-xl">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No voucher types found</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Set up voucher types to get started</p>
        </div>
      )}

      {showSetup && (
        <SetupVoucherTypes
          onComplete={() => {
            setShowSetup(false);
            fetchData();
          }}
          onCancel={() => setShowSetup(false)}
        />
      )}
    </div>
  );
}
