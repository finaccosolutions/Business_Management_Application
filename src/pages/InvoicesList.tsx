import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Calendar, Users, Trash2, Search, Filter, Eye, Edit2, Printer, Download, TrendingUp, Clock, CheckCircle, AlertCircle, ChevronDown, ArrowLeft } from 'lucide-react';
import { generateEnhancedInvoiceHTML, previewEnhancedInvoice, printEnhancedInvoice, downloadEnhancedPDF } from '../lib/enhancedInvoicePDF';
import { useToast } from '../contexts/ToastContext';
import EditInvoiceModal from '../components/EditInvoiceModal';
import InvoiceFormModal from '../components/InvoiceFormModal';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { formatDateDisplay } from '../lib/dateUtils';

interface Invoice {
  id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  work_id?: string;
  notes?: string;
  paid_at?: string;
  customers: { name: string; email?: string; phone?: string; address?: string; gstin?: string; city?: string; state?: string; state_code?: string; postal_code?: string };
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface InvoiceStats {
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  draftInvoices: number;
  sentInvoices: number;
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300',
  overdue: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300',
};

interface InvoicesListProps {
  onBack?: () => void;
}

export default function InvoicesList({ onBack }: InvoicesListProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingInvoice, setEditingInvoice] = useState<{ invoice: Invoice; items: InvoiceItem[] } | null>(null);
  const { showConfirmation } = useConfirmation();
  const [stats, setStats] = useState<InvoiceStats>({
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueAmount: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    overdueInvoices: 0,
    draftInvoices: 0,
    sentInvoices: 0,
  });

  useEffect(() => {
    if (user) {
      fetchInvoices();
    }
  }, [user]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(name, email, phone, address, gstin, city, state, state_code, postal_code)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const invoiceData = data || [];
      setInvoices(invoiceData);
      calculateStats(invoiceData);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (invoiceData: Invoice[]) => {
    const totalAmount = invoiceData.reduce((sum, inv) => sum + inv.total_amount, 0);
    const paidAmount = invoiceData
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.total_amount, 0);
    const overdueAmount = invoiceData
      .filter(inv => inv.status === 'overdue')
      .reduce((sum, inv) => sum + inv.total_amount, 0);
    const pendingAmount = invoiceData
      .filter(inv => inv.status === 'sent' || inv.status === 'draft')
      .reduce((sum, inv) => sum + inv.total_amount, 0);

    setStats({
      totalAmount,
      paidAmount,
      pendingAmount,
      overdueAmount,
      totalInvoices: invoiceData.length,
      paidInvoices: invoiceData.filter(inv => inv.status === 'paid').length,
      overdueInvoices: invoiceData.filter(inv => inv.status === 'overdue').length,
      draftInvoices: invoiceData.filter(inv => inv.status === 'draft').length,
      sentInvoices: invoiceData.filter(inv => inv.status === 'sent').length,
    });
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase.from('invoices').update(updateData).eq('id', id);

      if (error) throw error;
      toast.success('Invoice status updated');
      fetchInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error('Failed to update status');
    }
  };

  const handlePrint = async (invoice: Invoice) => {
    try {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      const { data: settings } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      const html = generateEnhancedInvoiceHTML(
        invoice,
        items || [],
        settings || { company_name: 'Your Company', country: 'India' }
      );

      printEnhancedInvoice(html);
    } catch (error) {
      console.error('Error printing invoice:', error);
      toast.error('Failed to print invoice');
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      toast.info('Generating PDF...');
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      const { data: settings } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      const html = generateEnhancedInvoiceHTML(
        invoice,
        items || [],
        settings || { company_name: 'Your Company', country: 'India' }
      );

      await downloadEnhancedPDF(html, `Invoice-${invoice.invoice_number}`);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePreview = async (invoice: Invoice) => {
    try {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      const { data: settings } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      const html = generateEnhancedInvoiceHTML(
        invoice,
        items || [],
        settings || { company_name: 'Your Company', country: 'India' }
      );

      previewEnhancedInvoice(html);
    } catch (error) {
      console.error('Error previewing invoice:', error);
      toast.error('Failed to preview invoice');
    }
  };

  const handleEditInvoice = async (invoice: Invoice) => {
    try {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      if (items) {
        setEditingInvoice({ invoice, items });
      }
    } catch (error) {
      console.error('Error loading invoice items:', error);
      toast.error('Failed to load invoice details');
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    showConfirmation({
      title: 'Delete Invoice',
      message: 'Are you sure you want to delete this invoice? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('invoices').delete().eq('id', id);
          if (error) throw error;
          fetchInvoices();
          toast.success('Invoice deleted successfully');
        } catch (error) {
          console.error('Error deleting invoice:', error);
          toast.error('Failed to delete invoice');
        }
      }
    });
  };

  const getFilterCount = (status: string) => {
    if (status === 'all') return invoices.length;
    return invoices.filter(inv => inv.status === status).length;
  };

  const applyDateFilter = (invoice: Invoice) => {
    if (dateFilter === 'all') return true;

    const now = new Date();
    const invoiceDate = new Date(invoice.invoice_date);

    switch (dateFilter) {
      case 'today':
        return invoiceDate.toDateString() === now.toDateString();
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return invoiceDate >= weekAgo;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return invoiceDate >= monthAgo;
      case 'quarter':
        const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return invoiceDate >= quarterAgo;
      default:
        return true;
    }
  };

  const filteredInvoices = invoices
    .filter((inv) => {
      const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
      const matchesSearch = searchQuery === '' ||
        inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.customers.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate = applyDateFilter(inv);
      return matchesStatus && matchesSearch && matchesDate;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime();
          break;
        case 'amount':
          comparison = a.total_amount - b.total_amount;
          break;
        case 'customer':
          comparison = a.customers.name.localeCompare(b.customers.name);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Vouchers
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Customer Invoices</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your invoices and billing</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-3 rounded-lg hover:from-amber-600 hover:to-orange-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Create Invoice</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Revenue</p>
              <p className="text-3xl font-bold mt-2">₹{stats.totalAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <TrendingUp className="w-8 h-8" />
            </div>
          </div>
          <p className="text-blue-100 text-sm mt-4">{stats.totalInvoices} Total Invoices</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Paid</p>
              <p className="text-3xl font-bold mt-2">₹{stats.paidAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <CheckCircle className="w-8 h-8" />
            </div>
          </div>
          <p className="text-green-100 text-sm mt-4">{stats.paidInvoices} Invoices</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm font-medium">Pending</p>
              <p className="text-3xl font-bold mt-2">₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <Clock className="w-8 h-8" />
            </div>
          </div>
          <p className="text-yellow-100 text-sm mt-4">{stats.draftInvoices + stats.sentInvoices} Invoices</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Overdue</p>
              <p className="text-3xl font-bold mt-2">₹{stats.overdueAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <AlertCircle className="w-8 h-8" />
            </div>
          </div>
          <p className="text-red-100 text-sm mt-4">{stats.overdueInvoices} Invoices</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by invoice number or customer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="quarter">Last 90 Days</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
              <option value="customer">Sort by Customer</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              <ChevronDown className={`w-5 h-5 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600'
              }`}
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            {['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'].map((status) => {
              const count = getFilterCount(status);
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
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice List */}
      <div className="space-y-3">
        {filteredInvoices.map((invoice) => (
          <div
            key={invoice.id}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-lg transition-all duration-200"
          >
            <div className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Left Section - Invoice Info */}
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-3 bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/50 dark:to-orange-900/50 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{invoice.invoice_number}</h3>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                          statusColors[invoice.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700 border-gray-300'
                        }`}
                      >
                        {invoice.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Customer</p>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                          <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{invoice.customers.name}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Invoice Date</p>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {formatDateDisplay(invoice.invoice_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Due Date</p>
                        <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {formatDateDisplay(invoice.due_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Amount</p>
                        <p className="text-xl font-bold text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                          ₹{invoice.subtotal.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {invoice.status === 'paid' && invoice.paid_at && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Paid on {formatDateDisplay(invoice.paid_at)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Section - Actions */}
                <div className="flex flex-col gap-2 lg:flex-shrink-0 lg:ml-auto">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handlePreview(invoice)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-xs font-medium"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Preview</span>
                    </button>
                    <button
                      onClick={() => handleEditInvoice(invoice)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors text-xs font-medium"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(invoice)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors text-xs font-medium"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => handlePrint(invoice)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-xs font-medium"
                      title="Print"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={() => handleDeleteInvoice(invoice.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-xs font-medium"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={invoice.status}
                      onChange={(e) => updateInvoiceStatus(invoice.id, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                      title="Change Status"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredInvoices.length === 0 && (
          <div className="text-center py-16 bg-gray-50 dark:bg-slate-800 rounded-xl">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No invoices found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {filterStatus === 'all' && searchQuery === ''
                ? 'Create your first invoice to get started'
                : 'No invoices match your current filters'}
            </p>
            {filterStatus === 'all' && searchQuery === '' && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Create Invoice</span>
              </button>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <InvoiceFormModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            fetchInvoices();
            setShowModal(false);
          }}
        />
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice.invoice}
          items={editingInvoice.items}
          onClose={() => setEditingInvoice(null)}
          onSave={() => {
            fetchInvoices();
            setEditingInvoice(null);
          }}
        />
      )}
    </div>
  );
}
