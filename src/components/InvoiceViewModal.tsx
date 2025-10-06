import { X, FileText, Calendar, User, DollarSign } from 'lucide-react';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

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
  paid_at?: string;
  customers: { name: string; email?: string; phone?: string; address?: string };
}

interface InvoiceViewModalProps {
  invoice: Invoice;
  items: InvoiceItem[];
  onClose: () => void;
}

export default function InvoiceViewModal({ invoice, items, onClose }: InvoiceViewModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-cyan-600 to-blue-600">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={28} />
              Invoice Details
            </h2>
            <p className="text-cyan-100 text-sm mt-1">{invoice.invoice_number}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">INVOICE</h1>
                <p className="text-lg text-gray-600">{invoice.invoice_number}</p>
              </div>
              <div className="text-right">
                <div className="inline-block px-4 py-2 rounded-lg bg-cyan-50 text-cyan-700 font-semibold">
                  {invoice.status.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To:</h3>
                <div className="text-gray-900">
                  <p className="font-semibold text-lg">{invoice.customers.name}</p>
                  {invoice.customers.email && <p className="text-sm">{invoice.customers.email}</p>}
                  {invoice.customers.phone && <p className="text-sm">{invoice.customers.phone}</p>}
                  {invoice.customers.address && <p className="text-sm mt-1">{invoice.customers.address}</p>}
                </div>
              </div>

              <div className="text-right">
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Invoice Date</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </p>
                </div>
                {invoice.paid_at && (
                  <div>
                    <p className="text-sm text-gray-500">Paid On</p>
                    <p className="font-semibold text-green-600">
                      {new Date(invoice.paid_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-3 text-sm font-semibold text-gray-700">Description</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-700">Quantity</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-700">Rate</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-700">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-3 text-gray-900">{item.description}</td>
                      <td className="text-right py-3 text-gray-900">{item.quantity}</td>
                      <td className="text-right py-3 text-gray-900">₹{item.unit_price.toFixed(2)}</td>
                      <td className="text-right py-3 text-gray-900 font-semibold">₹{item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mb-8">
              <div className="w-64">
                <div className="flex justify-between py-2 text-gray-700">
                  <span>Subtotal:</span>
                  <span className="font-semibold">₹{invoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 text-gray-700">
                  <span>Tax:</span>
                  <span className="font-semibold">₹{invoice.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-300 text-lg font-bold text-gray-900">
                  <span>Total:</span>
                  <span className="text-cyan-600">₹{invoice.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes / Terms:</h3>
                <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
