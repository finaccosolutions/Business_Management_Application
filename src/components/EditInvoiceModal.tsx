import { useState, useEffect } from 'react';
import { X, FileText, Plus, Trash2, DollarSign, Users, Briefcase, Eye } from 'lucide-react';
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
  customers: { name: string };
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Service {
  id: string;
  name: string;
  description: string;
  default_price: number;
  tax_rate?: number;
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

  const [formData, setFormData] = useState({
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    status: invoice.status,
    notes: invoice.notes || '',
    discount: '0',
  });

  const [lineItems, setLineItems] = useState(
    items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      rate: item.unit_price,
      tax_rate: 0,
    }))
  );

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const { data } = await supabase
        .from('services')
        .select('id, name, description, default_price, tax_rate')
        .order('name');
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
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
    setLineItems([...lineItems, { id: '', description: '', quantity: 1, rate: 0, tax_rate: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
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

      const invoiceUpdate = {
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        status: formData.status,
        notes: formData.notes,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
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
        const itemData = {
          invoice_id: invoice.id,
          description: item.description,
          quantity: parseFloat(item.quantity.toString()),
          unit_price: parseFloat(item.rate.toString()),
          amount: calculateItemTotal(item),
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
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users size={20} className="text-amber-600" />
                Invoice Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer
                  </label>
                  <input
                    type="text"
                    value={invoice.customers.name}
                    disabled
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>

                <div>
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
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText size={20} className="text-amber-600" />
                  Line Items
                </h3>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Plus size={18} />
                  Add Item
                </button>
              </div>

              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description *
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                          required
                        />
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
                          Tax % *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.tax_rate}
                          onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                          required
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2 flex items-center justify-between">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Total
                          </label>
                          <div className="px-3 py-2 bg-amber-50 rounded-lg text-sm font-semibold text-amber-600">
                            ₹{calculateItemTotal(item).toFixed(2)}
                          </div>
                        </div>
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
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

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
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
  );
}
