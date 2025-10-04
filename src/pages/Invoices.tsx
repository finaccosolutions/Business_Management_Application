import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, DollarSign, Calendar, X, Users, Trash2 } from 'lucide-react';

interface Invoice {
  id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: string;
  customers: { name: string };
}

interface Customer {
  id: string;
  name: string;
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    customer_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    subtotal: '',
    tax_amount: '',
    total_amount: '',
    status: 'draft',
    customer_address: '',
    discount: '0',
    shipping: '0',
    payment_terms: 'net_30',
    notes: '',
    po_number: '',
  });


  const [lineItems, setLineItems] = useState([
    { description: '', quantity: 1, rate: 0, tax_rate: 0 }
  ]);


  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [invoicesResult, customersResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('*, customers(name)')
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
      ]);

      if (invoicesResult.error) throw invoicesResult.error;
      if (customersResult.error) throw customersResult.error;

      setInvoices(invoicesResult.data || []);
      setCustomers(customersResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    const subtotal = calculateSubtotal();
    const taxAmount = calculateTotalTax();
    const discount = parseFloat(formData.discount || '0');
    const shipping = parseFloat(formData.shipping || '0');
    const totalAmount = subtotal + taxAmount - discount + shipping;

    const invoiceData = {
      user_id: user!.id,
      customer_id: formData.customer_id,
      invoice_number: formData.invoice_number,
      invoice_date: formData.invoice_date,
      due_date: formData.due_date,
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      status: formData.status,
      updated_at: new Date().toISOString(),
    };

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Insert line items
    const itemsToInsert = lineItems.map(item => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: parseFloat(item.quantity.toString()),
      unit_price: parseFloat(item.rate.toString()),
      amount: calculateItemTotal(item),
    }));

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
    subtotal: '',
    tax_amount: '',
    total_amount: '',
    status: 'draft',
    customer_address: '',
    discount: '0',
    shipping: '0',
    payment_terms: 'net_30',
    notes: '',
    po_number: '',
  });
  setLineItems([{ description: '', quantity: 1, rate: 0, tax_rate: 0 }]);
};


  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

const addLineItem = () => {
  setLineItems([...lineItems, { description: '', quantity: 1, rate: 0, tax_rate: 0 }]);
};

const removeLineItem = (index: number) => {
  setLineItems(lineItems.filter((_, i) => i !== index));
};

const updateLineItem = (index: number, field: string, value: any) => {
  const updated = [...lineItems];
  updated[index] = { ...updated[index], [field]: value };
  setLineItems(updated);
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
    const { data, error } = await supabase
      .from('customers')
      .select('address')
      .eq('id', customerId)
      .single();
    
    if (error) throw error;
    if (data) {
      setFormData(prev => ({ ...prev, customer_address: data.address || '' }));
    }
  } catch (error) {
    console.error('Error loading customer details:', error);
  }
};

const saveAsDraft = async () => {
  const draftData = { ...formData, status: 'draft' };
  setFormData(draftData);
  await handleSubmit(new Event('submit') as any);
};


  const calculateTotal = () => {
    const subtotal = parseFloat(formData.subtotal || '0');
    const tax = parseFloat(formData.tax_amount || '0');
    const total = subtotal + tax;
    setFormData({ ...formData, total_amount: total.toFixed(2) });
  };

  const filteredInvoices =
    filterStatus === 'all' ? invoices : invoices.filter((inv) => inv.status === filterStatus);

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

      <div className="flex flex-wrap gap-2">
        {['all', 'draft', 'sent', 'paid', 'overdue'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              filterStatus === status
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {status.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredInvoices.map((invoice) => (
          <div
            key={invoice.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-cyan-50 rounded-lg">
                  <FileText className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{invoice.invoice_number}</h3>
                  <span
                    className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
                      statusColors[invoice.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {invoice.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center text-sm text-gray-700">
                <span className="font-medium mr-2">Customer:</span>
                <span>{invoice.customers.name}</span>
              </div>
              <div className="flex items-center text-sm text-gray-700">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center text-lg font-semibold text-cyan-600">
                <DollarSign className="w-5 h-5 mr-1" />
                <span>₹{invoice.total_amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <div className="flex space-x-2 pt-4 border-t border-gray-100">
                {invoice.status === 'draft' && (
                  <button
                    onClick={() => updateInvoiceStatus(invoice.id, 'sent')}
                    className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                  >
                    Mark as Sent
                  </button>
                )}
                {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                  <button
                    onClick={() => updateInvoiceStatus(invoice.id, 'paid')}
                    className="flex-1 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors text-sm"
                  >
                    Mark as Paid
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {filteredInvoices.length === 0 && (
          <div className="col-span-full text-center py-12">
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
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
          {/* Customer & Invoice Details Section */}
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl p-6 border border-cyan-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users size={20} className="text-cyan-600" />
              Customer & Invoice Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
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
                  placeholder="INV-001"
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

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Address
                </label>
                <textarea
                  value={formData.customer_address}
                  onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="Customer billing address"
                />
              </div>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText size={20} className="text-cyan-600" />
                Line Items
              </h3>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
              >
                <Plus size={18} />
                Add Item
              </button>
            </div>
            
            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-3 items-end p-3 bg-gray-50 rounded-lg">
                  <div className="col-span-4">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Item description"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="1"
                      min="1"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Rate (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => updateLineItem(index, 'rate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tax %
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.tax_rate}
                      onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      ₹{calculateItemTotal(item).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Section */}
          <div className="bg-gradient-to-r from-gray-50 to-cyan-50 rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign size={20} className="text-cyan-600" />
              Totals
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Subtotal:</span>
                <span className="text-lg font-semibold text-gray-900">
                  ₹{calculateSubtotal().toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Total Tax:</span>
                <span className="text-lg font-semibold text-gray-900">
                  ₹{calculateTotalTax().toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t-2 border-cyan-200">
                <span className="text-xl font-bold text-gray-900">Grand Total:</span>
                <span className="text-2xl font-bold text-cyan-600">
                  ₹{(calculateSubtotal() + calculateTotalTax()).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.discount}
                  onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipping/Handling (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.shipping}
                  onChange={(e) => setFormData({ ...formData, shipping: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Terms
                </label>
                <select
                  value={formData.payment_terms}
                  onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="net_15">Net 15 Days</option>
                  <option value="net_30">Net 30 Days</option>
                  <option value="net_45">Net 45 Days</option>
                  <option value="net_60">Net 60 Days</option>
                  <option value="due_on_receipt">Due on Receipt</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes / Terms & Conditions
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="Thank you for your business! Payment is due within 30 days..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Purchase Order Number
                </label>
                <input
                  type="text"
                  value={formData.po_number}
                  onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  placeholder="PO-123"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Footer Actions */}
      <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <button
          type="button"
          onClick={closeModal}
          className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={saveAsDraft}
          className="px-6 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
        >
          Save as Draft
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
)}

    </div>
  );
}
