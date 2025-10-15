import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, FileText, Search, Filter, X, Eye, Edit2, Trash2, Calendar } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';
import VoucherModal from '../components/accounting/VoucherModal';
import SetupVoucherTypes from '../components/accounting/SetupVoucherTypes';
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

const voucherTypeColors = [
  'from-blue-500 to-blue-600',
  'from-green-500 to-green-600',
  'from-orange-500 to-orange-600',
  'from-red-500 to-red-600',
  'from-cyan-500 to-cyan-600',
  'from-teal-500 to-teal-600',
];

export default function Vouchers() {
  const { user } = useAuth();
  const toast = useToast();
  const { showConfirmation } = useConfirmation();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [vouchersResult, typesResult] = await Promise.all([
        supabase
          .from('vouchers')
          .select('*, voucher_types(name, code)')
          .order('voucher_date', { ascending: false }),
        supabase
          .from('voucher_types')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { nullsFirst: false }),
      ]);

      if (vouchersResult.error) throw vouchersResult.error;
      if (typesResult.error) throw typesResult.error;

      setVouchers(vouchersResult.data || []);
      setVoucherTypes(typesResult.data || []);

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

  const handleDelete = async (id: string) => {
    showConfirmation({
      title: 'Delete Voucher',
      message: 'Are you sure you want to delete this voucher? This action cannot be undone.',
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

  const handlePost = async (id: string) => {
    showConfirmation({
      title: 'Post Voucher',
      message: 'Are you sure you want to post this voucher? Once posted, it will create ledger entries.',
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
              className="text-blue-600 hover:text-blue-700 mb-2 flex items-center gap-2"
            >
              ← Back to All Voucher Types
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{selectedType?.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Manage {selectedType?.name.toLowerCase()} vouchers</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
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

        <div className="space-y-3">
          {filteredVouchers.map((voucher) => (
            <div
              key={voucher.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-3 bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{voucher.voucher_number}</h3>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          statusColors[voucher.status as keyof typeof statusColors]
                        }`}
                      >
                        {voucher.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Date</p>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatDateDisplay(voucher.voucher_date)}
                        </p>
                      </div>
                      {voucher.reference_number && (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Reference</p>
                          <p className="font-medium text-gray-900 dark:text-white">{voucher.reference_number}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Amount</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          ₹{voucher.total_amount.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {voucher.narration && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{voucher.narration}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {voucher.status === 'draft' && (
                    <button
                      onClick={() => handlePost(voucher.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors text-xs font-medium"
                      title="Post Voucher"
                    >
                      Post
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedVoucher(voucher)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-xs font-medium"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {voucher.status === 'draft' && (
                    <button
                      onClick={() => handleDelete(voucher.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-xs font-medium"
                      title="Delete Voucher"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredVouchers.length === 0 && (
            <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-xl">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No vouchers found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first voucher to get started</p>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>New Voucher</span>
              </button>
            </div>
          )}
        </div>

        {showModal && voucherTypes.length > 0 && (
          <VoucherModal
            onClose={() => {
              setShowModal(false);
              fetchData();
            }}
            voucherTypes={voucherTypes}
            selectedTypeId={selectedTypeId}
          />
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {voucherTypeStats.map((stat, index) => (
          <button
            key={stat.type.id}
            onClick={() => setSelectedTypeId(stat.type.id)}
            className="group bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden border border-gray-200 dark:border-slate-700 text-left"
          >
            <div className={`bg-gradient-to-r ${voucherTypeColors[index % voucherTypeColors.length]} p-6 text-white`}>
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
