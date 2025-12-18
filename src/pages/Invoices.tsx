import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Calendar, Users, Trash2, Search, Filter, Eye, Edit2, Printer, Download, TrendingUp, Clock, CheckCircle, AlertCircle, ChevronDown, Receipt } from 'lucide-react';
import { generateEnhancedInvoiceHTML, previewEnhancedInvoice, printEnhancedInvoice, downloadEnhancedPDF } from '../lib/enhancedInvoicePDF';
import { useToast } from '../contexts/ToastContext';
import EditInvoiceModal from '../components/EditInvoiceModal';
import InvoiceDetails from '../components/InvoiceDetails';
import InvoicePaymentModal from '../components/InvoicePaymentModal';
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
  paid_amount?: number;
  balance_amount?: number;
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
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  sent: 'bg-blue-100 text-blue-700 border-blue-300',
  paid: 'bg-green-100 text-green-700 border-green-300',
  overdue: 'bg-red-100 text-red-700 border-red-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
};

interface InvoicesProps {
  onNavigate?: (page: string, params?: any) => void;
}

export default function Invoices({ onNavigate }: InvoicesProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingInvoice, setEditingInvoice] = useState<{ invoice: Invoice; items: InvoiceItem[] } | null>(null);
  const [paymentLinkingInvoice, setPaymentLinkingInvoice] = useState<Invoice | null>(null);

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



    const filterStatus = sessionStorage.getItem('invoiceFilterStatus');
    if (filterStatus) {
      setFilterStatus(filterStatus);
      sessionStorage.removeItem('invoiceFilterStatus');
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

  if (selectedInvoiceId) {
    return (
      <InvoiceDetails
        invoiceId={selectedInvoiceId}
        onBack={() => {
          setSelectedInvoiceId(null);
          fetchInvoices();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-600 mt-1">Manage, track, and create customer invoices.</p>
          </div>
          <button
            onClick={() => onNavigate?.('create-invoice')}
            className="flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-5 h-5" />
            <span>New Invoice</span>
          </button>
        </div>

        {/* Modern Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-full">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₹{stats.totalAmount.toLocaleString('en-IN')}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500 font-medium">Total Billed</span>
              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">{stats.totalInvoices} inv</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <CheckCircle className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-full">Collected</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₹{stats.paidAmount.toLocaleString('en-IN')}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500 font-medium">Received</span>
              <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">{stats.paidInvoices} inv</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-full">Pending</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500 font-medium">Unpaid</span>
              <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded font-medium">{stats.draftInvoices + stats.sentInvoices} inv</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <AlertCircle className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-full">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₹{stats.overdueAmount.toLocaleString('en-IN')}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-500 font-medium">Late</span>
              <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">{stats.overdueInvoices} inv</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-8 lg:pl-12 lg:pr-8 space-y-6">
        {/* Filters and Actions */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between">
          <div className="flex gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search invoice # or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${showFilters
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            {['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${filterStatus === status
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)} ({getFilterCount(status)})
              </button>
            ))}
          </div>
        </div>

        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-down">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
                <option value="quarter">Last 90 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort By</label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="customer">Customer</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                >
                  <ArrowUpDown className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Standard Table View */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FileText className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-blue-600 group-hover:text-blue-800">
                          {invoice.invoice_number}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateDisplay(invoice.invoice_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{invoice.customers.name}</div>
                      {invoice.customers.email && <div className="text-xs text-gray-500">{invoice.customers.email}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      ₹{invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      {(invoice.balance_amount ?? 0) > 0 ? (
                        <span className="text-red-600 font-medium">₹{(invoice.balance_amount || 0).toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${statusColors[invoice.status as keyof typeof statusColors]}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setPaymentLinkingInvoice({ ...invoice, paid_amount: invoice.paid_amount || 0, balance_amount: invoice.balance_amount || invoice.total_amount })}
                          className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                          title="Record Payment"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditInvoice(invoice)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(invoice)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-base font-medium text-gray-900">No invoices found</p>
                        <p className="text-sm text-gray-500 mt-1">Try adjusting your filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Showing {filteredInvoices.length} of {invoices.length} invoices
            </div>
            {/* Pagination can go here in future */}
          </div>
        </div>

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

        {paymentLinkingInvoice && (
          <InvoicePaymentModal
            invoice={{
              ...paymentLinkingInvoice,
              customer_name: paymentLinkingInvoice.customers.name,
              paid_amount: paymentLinkingInvoice.paid_amount || 0,
              balance_amount: paymentLinkingInvoice.balance_amount || 0,
            }}
            onClose={() => setPaymentLinkingInvoice(null)}
            onSave={() => {
              fetchInvoices();
            }}
          />
        )}
      </div>
    </div>
  );
}
