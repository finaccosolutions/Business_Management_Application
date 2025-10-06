import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, DollarSign, Calendar, X, Users, Trash2, Search, Filter, Eye, CreditCard as Edit2, Printer, Download, TrendingUp, Clock, CheckCircle, AlertCircle, Briefcase } from 'lucide-react';
import { generateInvoiceHTML, printInvoice, previewInvoice, downloadPDF } from '../lib/invoicePdfGenerator';
import { useToast } from '../contexts/ToastContext';

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
  customers: { name: string; email?: string; phone?: string; address?: string };
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Customer {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  default_price: number;
  tax_rate?: number;
}

interface Work {
  id: string;
  title: string;
  customer_id: string;
  service_id: string;
  status: string;
  billing_amount?: number;
  customers: { name: string };
  services: { name: string; default_price?: number; tax_rate?: number };
}

interface InvoiceStats {
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  totalInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Invoices() {
  const { user } = useAuth();
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<InvoiceStats>({
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueAmount: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    overdueInvoices: 0,
  });
  const [formData, setFormData] = useState({
    customer_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    work_id: '',
    discount: '0',
    payment_terms: 'net_30',
    notes: '',
    status: 'draft',
  });


  const [lineItems, setLineItems] = useState([
    { service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0 }
  ]);


  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [invoicesResult, customersResult, servicesResult, worksResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('*, customers(name, email, phone, address)')
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('services').select('id, name, description, default_price, tax_rate').order('name'),
        supabase.from('works')
          .select('id, title, customer_id, service_id, status, billing_amount, customers(name), services(name, default_price, tax_rate)')
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
      ]);

      if (invoicesResult.error) throw invoicesResult.error;
      if (customersResult.error) throw customersResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (worksResult.error) throw worksResult.error;

      const invoiceData = invoicesResult.data || [];
      setInvoices(invoiceData);
      setCustomers(customersResult.data || []);
      setServices(servicesResult.data || []);
      setWorks(worksResult.data || []);

      calculateStats(invoiceData);
    } catch (error) {
      console.error('Error fetching data:', error);
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
    });
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const subtotal = calculateSubtotal();
    const taxAmount = calculateTotalTax();
    const discount = parseFloat(formData.discount || '0');
    const shipping = parseFloat(formData.shipping || '0');
    const totalAmount = subtotal + taxAmount - discount + shipping;

    const invoiceData: any = {
      user_id: user!.id,
      customer_id: formData.customer_id,
      invoice_number: formData.invoice_number,
      invoice_date: formData.invoice_date,
      due_date: formData.due_date,
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      status: formData.status,
      notes: formData.notes,
      updated_at: new Date().toISOString(),
    };

    if (formData.work_id) {
      invoiceData.work_id = formData.work_id;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Insert invoice items
    const itemsToInsert = lineItems.map(item => {
      const finalDescription = item.custom_description || item.description;
      return {
        invoice_id: invoice.id,
        description: finalDescription,
        quantity: parseFloat(item.quantity.toString()),
        unit_price: parseFloat(item.rate.toString()),
        amount: calculateItemTotal(item),
      };
    });

    const { error: itemsError } = await supabase
      .from('invoice_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    setShowModal(false);
    resetForm();
    fetchData();
  } catch (error) {
    console.error('Error saving invoice:', error);
  }
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
      fetchData();
    } catch (error) {
      console.error('Error updating invoice:', error);
    }
  };

const resetForm = () => {
  setFormData({
    customer_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    work_id: '',
    discount: '0',
    payment_terms: 'net_30',
    notes: '',
    status: 'draft',
  });
  setLineItems([{ service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0 }]);
};


  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

const addLineItem = () => {
  setLineItems([...lineItems, { service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0 }]);
};

const removeLineItem = (index: number) => {
  setLineItems(lineItems.filter((_, i) => i !== index));
};

const updateLineItem = (index: number, field: string, value: any) => {
  const updated = [...lineItems];
  if (field === 'service_id') {
    const service = services.find(s => s.id === value);
    if (service) {
      updated[index] = {
        ...updated[index],
        service_id: value,
        description: service.description || service.name,
        rate: service.default_price || 0,
        tax_rate: service.tax_rate || 0,
        custom_description: '',
      };
    }
  } else {
    updated[index] = { ...updated[index], [field]: value };
  }
  setLineItems(updated);
};

const loadWorkDetails = async (workId: string) => {
  try {
    const work = works.find(w => w.id === workId);
    if (!work) return;

    const service = services.find(s => s.id === work.service_id);
    if (!service) return;

    setFormData(prev => ({
      ...prev,
      customer_id: work.customer_id,
      work_id: workId,
    }));

    const price = work.billing_amount || service.default_price || 0;
    const taxRate = service.tax_rate || 0;

    setLineItems([{
      service_id: work.service_id,
      description: service.description || service.name,
      custom_description: work.title,
      quantity: 1,
      rate: price,
      tax_rate: taxRate,
    }]);

    loadCustomerDetails(work.customer_id);
  } catch (error) {
    console.error('Error loading work details:', error);
  }
};

const calculateItemTotal = (item: any) => {
  const subtotal = parseFloat(item.quantity || 0) * parseFloat(item.rate || 0);
  const tax = subtotal * (parseFloat(item.tax_rate || 0) / 100);
  return subtotal + tax;
};

const calculateSubtotal = () => {
  return lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity || 0) * parseFloat(item.rate || 0));
  }, 0);
};

const calculateTotalTax = () => {
  return lineItems.reduce((sum, item) => {
    const subtotal = parseFloat(item.quantity || 0) * parseFloat(item.rate || 0);
    const tax = subtotal * (parseFloat(item.tax_rate || 0) / 100);
    return sum + tax;
  }, 0);
};

const loadCustomerDetails = async (customerId: string) => {
  try {
    const { data: invoiceCount } = await supabase
      .from('invoices')
      .select('invoice_number', { count: 'exact', head: true })
      .eq('user_id', user!.id);

    const count = invoiceCount ? 1 : 0;
    const nextNumber = `INV-${String(count + 1).padStart(4, '0')}`;
    setFormData(prev => ({ ...prev, invoice_number: nextNumber }));
  } catch (error) {
    console.error('Error generating invoice number:', error);
  }
};

const saveAsDraft = async () => {
  const draftData = { ...formData, status: 'draft' };
  setFormData(draftData);
  await handleSubmit(new Event('submit') as any);
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

      const html = generateInvoiceHTML(
        invoice,
        items || [],
        settings || { company_name: 'Your Company' }
      );

      printInvoice(html);
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

      const html = generateInvoiceHTML(
        invoice,
        items || [],
        settings || { company_name: 'Your Company' }
      );

      await downloadPDF(html, `Invoice-${invoice.invoice_number}`);
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

      const html = generateInvoiceHTML(
        invoice,
        items || [],
        settings || { company_name: 'Your Company' }
      );

      previewInvoice(html);
    } catch (error) {
      console.error('Error previewing invoice:', error);
      toast.error('Failed to preview invoice');
    }
  };


  const handleEditInvoice = (invoice: Invoice) => {
    toast.info('Edit functionality coming soon!');
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const getFilterCount = (status: string) => {
    if (status === 'all') return invoices.length;
    return invoices.filter(inv => inv.status === status).length;
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchesSearch = searchQuery === '' ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customers.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
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
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-1">Manage your invoices and billing</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-6 py-3 rounded-lg hover:from-cyan-600 hover:to-cyan-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Create Invoice</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cyan-100 text-sm font-medium">Total Invoices</p>
              <p className="text-3xl font-bold mt-2">{stats.totalInvoices}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <FileText className="w-8 h-8" />
            </div>
          </div>
          <p className="text-cyan-100 text-sm mt-4">₹{stats.totalAmount.toLocaleString('en-IN')}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Paid</p>
              <p className="text-3xl font-bold mt-2">{stats.paidInvoices}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <CheckCircle className="w-8 h-8" />
            </div>
          </div>
          <p className="text-green-100 text-sm mt-4">₹{stats.paidAmount.toLocaleString('en-IN')}</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm font-medium">Pending</p>
              <p className="text-3xl font-bold mt-2">{stats.totalInvoices - stats.paidInvoices - stats.overdueInvoices}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <Clock className="w-8 h-8" />
            </div>
          </div>
          <p className="text-yellow-100 text-sm mt-4">₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Overdue</p>
              <p className="text-3xl font-bold mt-2">{stats.overdueInvoices}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <AlertCircle className="w-8 h-8" />
            </div>
          </div>
          <p className="text-red-100 text-sm mt-4">₹{stats.overdueAmount.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search invoices by number or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-2 px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-5 h-5" />
          <span>Filters</span>
        </button>
      </div>

      {/* Filter Pills */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-lg">
          {['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'].map((status) => {
            const count = getFilterCount(status);
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  filterStatus === status
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  filterStatus === status
                    ? 'bg-white/30 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Invoice List - Enhanced Cards */}
      <div className="space-y-3">
        {filteredInvoices.map((invoice) => (
          <div
            key={invoice.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left - Invoice Details */}
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg flex-shrink-0">
                  <FileText className="w-6 h-6 text-cyan-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">{invoice.invoice_number}</h3>
                    <span
                      className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        statusColors[invoice.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {invoice.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Customer</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {invoice.customers.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Invoice Date</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Due Date</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(invoice.due_date).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Total Amount</p>
                      <p className="text-lg font-bold text-cyan-600 flex items-center gap-0.5">
                        <DollarSign className="w-4 h-4" />
                        {invoice.total_amount.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  {invoice.status === 'paid' && invoice.paid_at && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Paid on {new Date(invoice.paid_at).toLocaleDateString('en-IN')}
                    </p>
                  )}
                </div>
              </div>

              {/* Right - Actions */}
              <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditInvoice(invoice);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-xs font-medium"
                    title="Edit Invoice"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(invoice);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-xs font-medium"
                    title="Preview Invoice"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Preview</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrint(invoice);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
                    title="Print Invoice"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadPDF(invoice);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-medium"
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                    <span>PDF</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteInvoice(invoice.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-medium"
                    title="Delete Invoice"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                  <select
                    value={invoice.status}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateInvoiceStatus(invoice.id, e.target.value);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
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
        ))}

        {filteredInvoices.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
            <p className="text-gray-600 mb-4">
              {filterStatus === 'all'
                ? 'Create your first invoice'
                : 'No invoices match the selected filter'}
            </p>
            {filterStatus === 'all' && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 bg-cyan-600 text-white px-6 py-3 rounded-lg hover:bg-cyan-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Create Invoice</span>
              </button>
            )}
          </div>
        )}
      </div>

{showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
    <div className="fixed top-16 left-0 lg:left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
      {/* Gradient Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-cyan-600 to-blue-600 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText size={28} />
            Create Invoice
          </h2>
          <p className="text-cyan-100 text-sm mt-1">Professional invoice for your customer</p>
        </div>
        <button
          onClick={closeModal}
          className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Scrollable Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Work Selection - Quick Fill */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Briefcase size={20} className="text-green-600" />
              Quick Fill from Work (Optional)
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Completed Work
              </label>
              <select
                value={formData.work_id}
                onChange={(e) => {
                  setFormData({ ...formData, work_id: e.target.value });
                  if (e.target.value) {
                    loadWorkDetails(e.target.value);
                  }
                }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Select a work to auto-fill invoice details</option>
                {works.map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.title} - {work.customers.name} ({work.services.name})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">Selecting a work will auto-fill customer and service details</p>
            </div>
          </div>

          {/* Customer & Invoice Details Section */}
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl p-6 border border-cyan-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users size={20} className="text-cyan-600" />
              Invoice Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer *
                </label>
                <select
                  required
                  value={formData.customer_id}
                  onChange={(e) => {
                    setFormData({ ...formData, customer_id: e.target.value });
                    loadCustomerDetails(e.target.value);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invoice Status *
                </label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invoice Number *
                </label>
                <input
                  type="text"
                  required
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="INV-0001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.invoice_date}
                  onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Terms *
                </label>
                <select
                  required
                  value={formData.payment_terms}
                  onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="due_on_receipt">Due on Receipt</option>
                  <option value="net_15">Net 15 Days</option>
                  <option value="net_30">Net 30 Days</option>
                  <option value="net_45">Net 45 Days</option>
                  <option value="net_60">Net 60 Days</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
          </div>

          {/* Services Section */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText size={20} className="text-cyan-600" />
                Services
              </h3>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
              >
                <Plus size={18} />
                Add Service
              </button>
            </div>

            <div className="space-y-4">
              {lineItems.map((item, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  {/* Single Row for Service Details */}
                  <div className="grid grid-cols-12 gap-3 items-center mb-3">
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Service *
                      </label>
                      <select
                        value={item.service_id}
                        onChange={(e) => updateLineItem(index, 'service_id', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                        required
                      >
                        <option value="">Select service</option>
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                        placeholder="1"
                        min="1"
                        required
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Rate (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateLineItem(index, 'rate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tax % *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.tax_rate}
                        onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                        placeholder="0"
                        required
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Total
                      </label>
                      <div className="px-3 py-2 bg-cyan-50 rounded-lg text-sm font-semibold text-cyan-600">
                        ₹{calculateItemTotal(item).toFixed(2)}
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-1 flex items-end justify-center">
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Description Row Below */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      value={item.custom_description}
                      onChange={(e) => updateLineItem(index, 'custom_description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                      placeholder="Add custom notes or description..."
                      rows={2}
                    />
                    {item.description && !item.custom_description && (
                      <p className="text-xs text-gray-500 mt-1">Default: {item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Section */}
          <div className="bg-gradient-to-r from-gray-50 to-cyan-50 rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign size={20} className="text-cyan-600" />
              Invoice Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-base">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-semibold text-gray-900">
                  ₹{calculateSubtotal().toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-base">
                <span className="text-gray-700">Total Tax:</span>
                <span className="font-semibold text-gray-900">
                  ₹{calculateTotalTax().toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-300">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Discount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discount}
                    onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t-2 border-cyan-300">
                <span className="text-xl font-bold text-gray-900">Total Amount:</span>
                <span className="text-2xl font-bold text-cyan-600">
                  ₹{(calculateSubtotal() + calculateTotalTax() - parseFloat(formData.discount || '0')).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes / Terms & Conditions
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="Thank you for your business..."
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Footer Actions */}
      <div className="flex flex-wrap justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!formData.customer_id || lineItems.length === 0) {
                toast.error('Please complete the invoice before previewing');
                return;
              }

              try {
                const subtotal = calculateSubtotal();
                const taxAmount = calculateTotalTax();
                const discount = parseFloat(formData.discount || '0');
                const totalAmount = subtotal + taxAmount - discount;

                const customer = customers.find(c => c.id === formData.customer_id);
                if (!customer) {
                  toast.error('Customer not found');
                  return;
                }

                const draftInvoice = {
                  invoice_number: formData.invoice_number,
                  invoice_date: formData.invoice_date,
                  due_date: formData.due_date,
                  subtotal,
                  tax_amount: taxAmount,
                  total_amount: totalAmount,
                  status: formData.status,
                  notes: formData.notes,
                  customers: customer,
                };

                const previewItems = lineItems.map(item => ({
                  description: item.custom_description || item.description,
                  quantity: parseFloat(item.quantity.toString()),
                  unit_price: parseFloat(item.rate.toString()),
                  amount: calculateItemTotal(item),
                }));

                const { data: settings } = await supabase
                  .from('company_settings')
                  .select('*')
                  .eq('user_id', user!.id)
                  .maybeSingle();

                const html = generateInvoiceHTML(
                  draftInvoice as any,
                  previewItems,
                  settings || { company_name: 'Your Company' }
                );

                previewInvoice(html);
              } catch (error) {
                console.error('Error previewing invoice:', error);
                toast.error('Failed to preview invoice');
              }
            }}
            className="flex items-center gap-2 px-6 py-2.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors font-medium"
          >
            <Eye className="w-4 h-4" />
            Preview Invoice
          </button>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={closeModal}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-700 hover:to-blue-700 transition-all font-medium shadow-lg"
          >
            Create Invoice
          </button>
        </div>
      </div>
    </div>
  </div>
)}


    </div>
  );
}
