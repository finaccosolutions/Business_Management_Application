import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, FileText, Search, Filter, X, Eye, Edit2, Trash2, Calendar, Printer, Download, CheckCircle, XCircle } from 'lucide-react';
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

interface VouchersProps {
  onNavigate?: (page: string) => void;
}

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
  const [showFilters, setShowFilters] = useState(false);
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
          .select('*, voucher_types(name, code)')
          .order('voucher_date', { ascending: false }),
        supabase
          .from('voucher_types')
          .select('*')
          .eq('is_active', true)
          .not('code', 'in', '(SALES,PURCHASE,ITMINV)')
          .order('display_order', { nullsFirst: false }),
        supabase
          .from('invoices')
          .select('total_amount')
          .order('created_at', { ascending: false }),
      ]);

      if (vouchersResult.error) throw vouchersResult.error;
      if (typesResult.error) throw typesResult.error;
      if (invoicesResult.error) throw invoicesResult.error;

      setVouchers(vouchersResult.data || []);
      setVoucherTypes(typesResult.data || []);

      const invoicesData = invoicesResult.data || [];
      setInvoiceCount(invoicesData.length);
      setInvoicesTotalAmount(invoicesData.reduce((sum, inv) => sum + inv.total_amount, 0));

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
    toast.info('Edit functionality coming soon');
  };

  const handleView = async (voucher: Voucher) => {
    setSelectedVoucher(voucher);
  };

  const handlePrint = async (voucher: Voucher) => {
    toast.info('Print functionality coming soon');
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

  const filteredVouchers = selectedTypeId
    ? vouchers.filter((voucher) => {
        const matchesType = voucher.voucher_type_id === selectedTypeId;
        const matchesSearch =
          searchQuery === '' ||
          voucher.voucher_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          voucher.narration?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'all' || voucher.status === filterStatus;
        return matchesType && matchesSearch && matchesStatus;
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

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search vouchers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
          >
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="posted">Posted</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {filteredVouchers.map((voucher) => (
            <div
              key={voucher.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-md border-2 border-gray-200 dark:border-slate-700 hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
            >
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Left Section - Voucher Info */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-4 bg-gradient-to-br rounded-xl flex-shrink-0 shadow-sm ${
                      voucher.status === 'posted'
                        ? 'from-green-100 to-emerald-200 dark:from-green-900/40 dark:to-emerald-900/40'
                        : voucher.status === 'cancelled'
                        ? 'from-red-100 to-rose-200 dark:from-red-900/40 dark:to-rose-900/40'
                        : 'from-blue-100 to-cyan-200 dark:from-blue-900/40 dark:to-cyan-900/40'
                    }`}>
                      <FileText className={`w-7 h-7 ${
                        voucher.status === 'posted'
                          ? 'text-green-700 dark:text-green-300'
                          : voucher.status === 'cancelled'
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-blue-700 dark:text-blue-300'
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{voucher.voucher_number}</h3>
                        <span
                          className={`px-3 py-1.5 text-xs font-bold rounded-full shadow-sm flex items-center gap-1.5 ${
                            statusColors[voucher.status as keyof typeof statusColors]
                          }`}
                        >
                          {voucher.status === 'posted' && <CheckCircle className="w-3.5 h-3.5" />}
                          {voucher.status === 'cancelled' && <XCircle className="w-3.5 h-3.5" />}
                          {voucher.status.toUpperCase()}
                        </span>
                        <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300">
                          {voucher.voucher_types.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Voucher Date</p>
                          <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {formatDateDisplay(voucher.voucher_date)}
                          </p>
                        </div>
                        {voucher.reference_number && (
                          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Reference No.</p>
                            <p className="font-semibold text-gray-900 dark:text-white truncate">{voucher.reference_number}</p>
                          </div>
                        )}
                        <div className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg p-3">
                          <p className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">Total Amount</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                            ₹{voucher.total_amount.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Type Code</p>
                          <p className="font-mono font-bold text-gray-900 dark:text-white">{voucher.voucher_types.code}</p>
                        </div>
                      </div>

                      {voucher.narration && (
                        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Narration</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{voucher.narration}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Section - Actions */}
                  <div className="flex flex-col gap-2 lg:flex-shrink-0 lg:ml-auto">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleView(voucher)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View</span>
                      </button>
                      {voucher.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleEdit(voucher)}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                            title="Edit Voucher"
                          >
                            <Edit2 className="w-4 h-4" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handlePost(voucher.id, voucher.voucher_number)}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                            title="Post Voucher"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Post</span>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handlePrint(voucher)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                        title="Print Voucher"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Print</span>
                      </button>
                      {voucher.status === 'posted' && (
                        <button
                          onClick={() => handleCancel(voucher.id, voucher.voucher_number)}
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                          title="Cancel Voucher"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Cancel</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(voucher.id, voucher.voucher_number)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 text-sm font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                        title="Delete Voucher"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
            {selectedVoucherType.code.toUpperCase() === 'PV' ? (
              <PaymentVoucherModal
                onClose={() => {
                  setShowModal(false);
                  setSelectedVoucherType(null);
                  fetchData();
                }}
                voucherTypeId={selectedVoucherType.id}
              />
            ) : selectedVoucherType.code.toUpperCase() === 'RV' ? (
              <ReceiptVoucherModal
                onClose={() => {
                  setShowModal(false);
                  setSelectedVoucherType(null);
                  fetchData();
                }}
                voucherTypeId={selectedVoucherType.id}
              />
            ) : selectedVoucherType.code.toUpperCase() === 'CV' ? (
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

        {selectedVoucher && (
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
                <p className="text-center text-gray-600 dark:text-gray-400">Voucher details view coming soon...</p>
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
