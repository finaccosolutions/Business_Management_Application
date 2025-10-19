import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { X, Plus, FileText, Users, DollarSign, Trash2, AlertCircle, Eye, Landmark } from 'lucide-react';
import { generateEnhancedInvoiceHTML, previewEnhancedInvoice } from '../lib/enhancedInvoicePDF';
import { getNextVoucherNumber } from '../lib/voucherNumberGenerator';

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
  income_account_id?: string;
  hsn_code?: string;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
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

interface InvoiceFormModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function InvoiceFormModal({ onClose, onSuccess }: InvoiceFormModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [defaultIncomeAccountId, setDefaultIncomeAccountId] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
    income_account_id: '',
    customer_account_id: '',
  });

  const [lineItems, setLineItems] = useState([
    { service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0, hsn_sac: '' }
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [customersResult, servicesResult, worksResult, accountsResult, settingsResult] = await Promise.all([
        supabase.from('customers').select('id, name, account_id').order('name'),
        supabase.from('services').select('id, name, description, default_price, tax_rate, income_account_id, hsn_code').order('name'),
        supabase.from('works')
          .select('id, title, customer_id, service_id, status, billing_amount, customers(name, account_id), services!works_service_id_fkey(name, default_price, tax_rate, income_account_id)')
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
        supabase.from('chart_of_accounts').select('id, account_code, account_name').eq('is_active', true).order('account_name'),
        supabase.from('company_settings').select('default_income_ledger_id').eq('user_id', user!.id).maybeSingle(),
      ]);

      if (customersResult.error) throw customersResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (worksResult.error) throw worksResult.error;
      if (accountsResult.error) throw accountsResult.error;

      setCustomers(customersResult.data || []);
      setServices(servicesResult.data || []);
      setWorks(worksResult.data || []);
      setAccounts(accountsResult.data || []);
      if (settingsResult.data?.default_income_ledger_id) {
        setDefaultIncomeAccountId(settingsResult.data.default_income_ledger_id);
        setFormData(prev => ({ ...prev, income_account_id: settingsResult.data.default_income_ledger_id }));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
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
      const totalAmount = subtotal + taxAmount - discount;

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
        income_account_id: formData.income_account_id || null,
        customer_account_id: formData.customer_account_id || null,
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

      const itemsToInsert = lineItems.map(item => {
        const finalDescription = item.custom_description || item.description;
        return {
          invoice_id: invoice.id,
          service_id: item.service_id || null,
          description: finalDescription,
          quantity: parseFloat(item.quantity.toString()),
          unit_price: parseFloat(item.rate.toString()),
          amount: parseFloat(item.quantity.toString()) * parseFloat(item.rate.toString()),
          tax_rate: parseFloat(item.tax_rate?.toString() || '0'),
          hsn_sac: item.hsn_sac || null,
        };
      });

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast.success('Invoice created successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error('Failed to create invoice');
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { service_id: '', description: '', custom_description: '', quantity: 1, rate: 0, tax_rate: 0, hsn_sac: '' }]);
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
          hsn_sac: service.hsn_code || '',
          custom_description: '',
        };

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
        hsn_sac: service.hsn_code || '',
      }]);

      if (service.income_account_id) {
        setFormData(prev => ({ ...prev, income_account_id: service.income_account_id! }));
      } else if (defaultIncomeAccountId) {
        setFormData(prev => ({ ...prev, income_account_id: defaultIncomeAccountId }));
      }

      const customerAccountId = (work.customers as any)?.account_id;
      if (customerAccountId) {
        setFormData(prev => ({ ...prev, customer_account_id: customerAccountId }));
      }

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
      const nextNumber = await getNextVoucherNumber(
        supabase,
        user!.id,
        'invoice',
        'invoices'
      );

      const customer = customers.find(c => c.id === customerId);
      const customerAccountId = customer ? (customer as any).account_id : '';

      setFormData(prev => ({
        ...prev,
        invoice_number: nextNumber,
        customer_account_id: customerAccountId || ''
      }));
    } catch (error) {
      console.error('Error generating invoice number:', error);
      toast.error('Failed to generate invoice number');
    }
  };

  const handlePreview = async () => {
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
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-0 lg:left-64 right-0 bottom-0 bg-white dark:bg-slate-800 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-amber-600 to-orange-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={28} />
              Create Invoice
            </h2>
            <p className="text-amber-100 text-sm mt-1">Professional invoice for your customer</p>
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
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Users size={20} className="text-amber-600" />
                Invoice Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Customer *
                  </label>
                  <select
                    required
                    value={formData.customer_id}
                    onChange={(e) => {
                      setFormData({ ...formData, customer_id: e.target.value });
                      loadCustomerDetails(e.target.value);
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">
                      {customers.length === 0 ? 'No customers available' : 'Select customer'}
                    </option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  {customers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      No customers found. Please add a customer first.
                    </p>
                  )}
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Invoice Status *
                  </label>
                  <select
                    required
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="INV-0001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Invoice Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Payment Terms *
                  </label>
                  <select
                    required
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select ledger accounts to post this invoice to accounting records. Required for financial reports.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Income Account (Credit) *
                  </label>
                  <select
                    value={formData.income_account_id}
                    onChange={(e) => setFormData({ ...formData, income_account_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select Income Account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_code} - {account.account_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formData.income_account_id
                      ? 'Revenue account to credit for this sale'
                      : 'Select an income/revenue account to post this sale'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Customer Account (Debit) *
                  </label>
                  <input
                    type="text"
                    value={
                      formData.customer_account_id && accounts.find(a => a.id === formData.customer_account_id)
                        ? `${accounts.find(a => a.id === formData.customer_account_id)?.account_code} - ${accounts.find(a => a.id === formData.customer_account_id)?.account_name}`
                        : 'Auto-filled from selected customer'
                    }
                    disabled
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Automatically linked from customer's account mapping
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> Invoice will only be posted to ledger and appear in financial reports after both accounts are selected and status is changed from draft.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-700 rounded-xl p-6 border border-gray-200 dark:border-slate-600">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText size={20} className="text-amber-600" />
                  Services
                </h3>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <Plus size={18} />
                  Add Service
                </button>
              </div>

              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-slate-600 rounded-lg border border-gray-200 dark:border-slate-500">
                    <div className="grid grid-cols-12 gap-3 items-center mb-3">
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Service *
                        </label>
                        <select
                          value={item.service_id}
                          onChange={(e) => updateLineItem(index, 'service_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                          required
                        >
                          <option value="">
                            {services.length === 0 ? 'No services available' : 'Select service'}
                          </option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Quantity *
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                          placeholder="1"
                          min="1"
                          required
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Rate (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateLineItem(index, 'rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tax %
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.tax_rate}
                          onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Total
                        </label>
                        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg text-sm font-semibold text-amber-600 dark:text-amber-400">
                          ₹{calculateItemTotal(item).toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-1 flex items-end justify-center">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Remove item"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description (Optional)
                      </label>
                      <textarea
                        value={item.custom_description}
                        onChange={(e) => updateLineItem(index, 'custom_description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                        placeholder="Add custom notes or description..."
                        rows={2}
                      />
                      {item.description && !item.custom_description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Default: {item.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-amber-50 dark:from-slate-700 dark:to-amber-900/20 rounded-xl p-6 border border-gray-200 dark:border-slate-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-amber-600" />
                Invoice Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-base">
                  <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    ₹{calculateSubtotal().toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-base">
                  <span className="text-gray-700 dark:text-gray-300">Total Tax:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    ₹{calculateTotalTax().toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-300 dark:border-slate-600">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Discount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm dark:bg-slate-700 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-3 border-t-2 border-amber-300 dark:border-amber-700">
                  <span className="text-xl font-bold text-gray-900 dark:text-white">Total Amount:</span>
                  <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    ₹{(calculateSubtotal() + calculateTotalTax() - parseFloat(formData.discount || '0')).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-700 rounded-xl p-6 border border-gray-200 dark:border-slate-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Additional Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Notes / Terms & Conditions
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-slate-700 dark:text-white"
                    placeholder="Thank you for your business..."
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        <div className="flex flex-wrap justify-between gap-3 p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex-shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePreview}
              className="flex items-center gap-2 px-6 py-2.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors font-medium"
            >
              <Eye className="w-4 h-4" />
              Preview Invoice
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-700 hover:to-orange-700 transition-all font-medium shadow-lg"
            >
              Create Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
