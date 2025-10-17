import { useState, useEffect } from 'react';
import { X, FileText, Plus, Trash2, DollarSign, Users, Briefcase, Eye, Calendar, Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { generateEnhancedInvoiceHTML, previewEnhancedInvoice } from '../lib/enhancedInvoicePDF';

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
  notes?: string;
  work_id?: string;
  income_account_id?: string;
  customer_account_id?: string;
  customers: { name: string };
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_rate?: number;
}

interface Service {
  id: string;
  name: string;
  description: string;
  default_price: number;
  tax_rate?: number;
  income_account_id?: string;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
}

interface Customer {
  id: string;
  name: string;
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

interface EditInvoiceModalProps {
  invoice: Invoice;
  items: InvoiceItem[];
  onClose: () => void;
  onSave: () => void;
}

export default function EditInvoiceModal({ invoice, items, onClose, onSave }: EditInvoiceModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [defaultIncomeAccountId, setDefaultIncomeAccountId] = useState<string>('');

  const [formData, setFormData] = useState({
    customer_id: invoice.customer_id,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    work_id: invoice.work_id || '',
    discount: '0',
    payment_terms: 'net_30',
    notes: invoice.notes || '',
    status: invoice.status,
    income_account_id: invoice.income_account_id || '',
    customer_account_id: invoice.customer_account_id || '',
  });

  const [lineItems, setLineItems] = useState(
    items.map((item) => ({
      id: item.id,
      service_id: '',
      description: item.description,
      custom_description: item.description,
      quantity: item.quantity,
      rate: item.unit_price,
      tax_rate: item.tax_rate || 0,
    }))
  );

  useEffect(() => {
    fetchServices();
    fetchCustomers();
    fetchWorks();
    fetchAccounts();
  }, []);

  const fetchServices = async () => {
    try {
      const { data } = await supabase
        .from('services')
        .select('id, name, description, default_price, tax_rate, income_account_id')
        .order('name');
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const [accountsResult, settingsResult] = await Promise.all([
        supabase.from('chart_of_accounts').select('id, account_code, account_name').eq('is_active', true).order('account_name'),
        supabase.from('company_settings').select('default_income_ledger_id').eq('user_id', user!.id).maybeSingle(),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      setAccounts(accountsResult.data || []);

      if (settingsResult.data?.default_income_ledger_id) {
        setDefaultIncomeAccountId(settingsResult.data.default_income_ledger_id);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data } = await supabase
        .from('customers')
        .select('id, name, account_id')
        .order('name');
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchWorks = async () => {
    try {
      const { data } = await supabase
        .from('works')
        .select('id, title, customer_id, service_id, status, billing_amount, customers(name), services!works_service_id_fkey(name, default_price, tax_rate)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      setWorks(data || []);
    } catch (error) {
      console.error('Error fetching works:', error);
    }
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
        id: '',
        service_id: work.service_id,
        description: service.description || service.name,
        custom_description: work.title,
        quantity: 1,
        rate: price,
        tax_rate: taxRate,
      }]);
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
      return sum + parseFloat(item.quantity || 0) * parseFloat(item.rate || 0);
    }, 0);
  };

  const calculateTotalTax = () => {
    return lineItems.reduce((sum, item) => {
      const subtotal = parseFloat(item.quantity || 0) * parseFloat(item.rate || 0);
      const tax = subtotal * (parseFloat(item.tax_rate || 0) / 100);
      return sum + tax;
    }, 0);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { id: '', service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0 }]);
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

        // Auto-set income account from service or default
        if (service.income_account_id && !formData.income_account_id) {
          setFormData(prev => ({ ...prev, income_account_id: service.income_account_id! }));
        } else if (!service.income_account_id && defaultIncomeAccountId && !formData.income_account_id) {
          setFormData(prev => ({ ...prev, income_account_id: defaultIncomeAccountId }));
        }
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const subtotal = calculateSubtotal();
      const taxAmount = calculateTotalTax();
      const discount = parseFloat(formData.discount || '0');
      const totalAmount = subtotal + taxAmount - discount;

      const invoiceUpdate: any = {
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        status: formData.status,
        notes: formData.notes,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        income_account_id: formData.income_account_id || null,
        customer_account_id: formData.customer_account_id || null,
        updated_at: new Date().toISOString(),
      };

      const { error: invoiceError } = await supabase
        .from('invoices')
        .update(invoiceUpdate)
        .eq('id', invoice.id);

      if (invoiceError) throw invoiceError;

      const existingItemIds = items.map((item) => item.id);
      const itemsToDelete = existingItemIds.filter(
        (id) => !lineItems.some((item) => item.id === id)
      );

      if (itemsToDelete.length > 0) {
        await supabase.from('invoice_items').delete().in('id', itemsToDelete);
      }

      for (const item of lineItems) {
        const finalDescription = item.custom_description || item.description;
        const itemData = {
          invoice_id: invoice.id,
          description: finalDescription,
          quantity: parseFloat(item.quantity.toString()),
          unit_price: parseFloat(item.rate.toString()),
          amount: parseFloat(item.quantity.toString()) * parseFloat(item.rate.toString()),
          tax_rate: parseFloat(item.tax_rate?.toString() || '0'),
        };

        if (item.id) {
          await supabase.from('invoice_items').update(itemData).eq('id', item.id);
        } else {
          await supabase.from('invoice_items').insert(itemData);
        }
      }

      toast.success('Invoice updated successfully!');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error('Failed to update invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-0 lg:left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-amber-600 to-orange-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={28} />
              Edit Invoice
            </h2>
            <p className="text-amber-100 text-sm mt-1">{invoice.invoice_number}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

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

            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users size={20} className="text-amber-600" />
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
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="INV-0001"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status *
                  </label>
                  <select
                    required
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
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

            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Landmark size={20} className="text-blue-600" />
                Accounting Accounts
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Income Account (Credit)
                  </label>
                  <select
                    value={formData.income_account_id}
                    onChange={(e) => setFormData({ ...formData, income_account_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Auto-select from service/settings</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_code} - {account.account_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Auto-selected from service mapping or company default
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Customer Account (Debit)
                  </label>
                  <input
                    type="text"
                    value={accounts.find(a => a.id === formData.customer_account_id)?.account_name || 'Auto-selected from customer'}
                    disabled
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Automatically linked to customer account
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText size={20} className="text-amber-600" />
                  Services
                </h3>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Plus size={18} />
                  Add Service
                </button>
              </div>

              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-12 gap-3 items-center mb-3">
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Service *
                        </label>
                        <select
                          value={item.service_id}
                          onChange={(e) => updateLineItem(index, 'service_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                          required
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Tax %
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.tax_rate}
                          onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Total
                        </label>
                        <div className="px-3 py-2 bg-amber-50 rounded-lg text-sm font-semibold text-amber-600">
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
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Description (Optional)
                      </label>
                      <textarea
                        value={item.custom_description}
                        onChange={(e) => updateLineItem(index, 'custom_description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
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

            <div className="bg-gradient-to-r from-gray-50 to-amber-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-amber-600" />
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
                <div className="py-3 border-y border-gray-300">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Discount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discount}
                    onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-between items-center pt-3 border-t-2 border-amber-300">
                  <span className="text-xl font-bold text-gray-900">Total Amount:</span>
                  <span className="text-2xl font-bold text-amber-600">
                    ₹
                    {(
                      calculateSubtotal() +
                      calculateTotalTax() -
                      parseFloat(formData.discount || '0')
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes / Terms & Conditions
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  placeholder="Additional notes..."
                />
              </div>
            </div>
          </div>
        </form>

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

                  const { data: customerData } = await supabase
                    .from('customers')
                    .select('name, email, phone, address, gstin')
                    .eq('id', formData.customer_id)
                    .single();

                  const draftInvoice = {
                    invoice_number: formData.invoice_number,
                    invoice_date: formData.invoice_date,
                    due_date: formData.due_date,
                    subtotal,
                    tax_amount: taxAmount,
                    total_amount: totalAmount,
                    status: formData.status,
                    notes: formData.notes,
                    customers: customerData || customer,
                  };

                  const previewItems = lineItems.map(item => ({
                    description: item.custom_description || item.description,
                    quantity: parseFloat(item.quantity.toString()),
                    unit_price: parseFloat(item.rate.toString()),
                    amount: calculateItemTotal(item),
                    tax_rate: parseFloat(item.tax_rate.toString()),
                  }));

                  const { data: settings } = await supabase
                    .from('company_settings')
                    .select('*')
                    .eq('user_id', user!.id)
                    .maybeSingle();

                  const html = generateEnhancedInvoiceHTML(
                    draftInvoice as any,
                    previewItems,
                    settings || { company_name: 'Your Company', country: 'India' }
                  );

                  previewEnhancedInvoice(html);
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
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-700 hover:to-orange-700 transition-all font-medium shadow-lg disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
