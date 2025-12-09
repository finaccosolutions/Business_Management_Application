import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Receipt, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatDateDisplay } from '../lib/dateUtils';

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  customer_name: string;
}

interface Voucher {
  voucher_id: string;
  voucher_number: string;
  voucher_date: string;
  total_amount: number;
  unallocated_amount: number;
}

interface PaymentAllocation {
  payment_id: string;
  voucher_id: string;
  voucher_number: string;
  payment_amount: number;
  payment_date: string;
  allocated_at: string;
  is_advance: boolean;
  notes?: string;
}

interface InvoicePaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSave: () => void;
}

export default function InvoicePaymentModal({ invoice, onClose, onSave }: InvoicePaymentModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [availableReceipts, setAvailableReceipts] = useState<Voucher[]>([]);
  const [existingPayments, setExistingPayments] = useState<PaymentAllocation[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchAvailableReceipts();
    fetchExistingPayments();
  }, []);

  const fetchAvailableReceipts = async () => {
    try {
      const { data, error } = await supabase
        .from('advance_receipts_view')
        .select('*')
        .order('voucher_date', { ascending: false });

      if (error) throw error;
      setAvailableReceipts(data || []);
    } catch (error: any) {
      toast.showToast(error.message, 'error');
    }
  };

  const fetchExistingPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_payment_summary_view')
        .select('payments')
        .eq('invoice_id', invoice.id)
        .maybeSingle();

      if (error) throw error;
      setExistingPayments(data?.payments || []);
    } catch (error: any) {
      console.error('Error fetching payments:', error);
    }
  };

  const handleAllocatePayment = async () => {
    if (!selectedVoucher || !allocationAmount) {
      toast.showToast('Please select a receipt and enter amount', 'error');
      return;
    }

    const amount = parseFloat(allocationAmount);
    if (amount <= 0) {
      toast.showToast('Amount must be greater than 0', 'error');
      return;
    }

    if (amount > invoice.balance_amount) {
      toast.showToast('Amount cannot exceed invoice balance', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('allocate_payment_to_invoice', {
        p_user_id: user?.id,
        p_voucher_id: selectedVoucher,
        p_invoice_id: invoice.id,
        p_amount: amount,
        p_notes: notes || null,
      });

      if (error) throw error;

      if (data.success) {
        toast.showToast('Payment allocated successfully', 'success');
        setSelectedVoucher('');
        setAllocationAmount('');
        setNotes('');
        await fetchAvailableReceipts();
        await fetchExistingPayments();
        onSave();
      } else {
        toast.showToast(data.error || 'Failed to allocate payment', 'error');
      }
    } catch (error: any) {
      toast.showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePayment = async (paymentId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('invoice_payments')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;

      toast.showToast('Payment removed successfully', 'success');
      await fetchAvailableReceipts();
      await fetchExistingPayments();
      onSave();
    } catch (error: any) {
      toast.showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedVoucherData = availableReceipts.find(v => v.voucher_id === selectedVoucher);
  const maxAmount = selectedVoucherData
    ? Math.min(selectedVoucherData.unallocated_amount, invoice.balance_amount)
    : invoice.balance_amount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Manage Invoice Payments</h2>
            <p className="text-sm text-gray-600 mt-1">
              Invoice: {invoice.invoice_number} | Balance: ₹{invoice.balance_amount.toFixed(2)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Amount</p>
                <p className="text-2xl font-bold text-blue-900">₹{invoice.total_amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-green-600 font-medium">Paid Amount</p>
                <p className="text-2xl font-bold text-green-900">₹{invoice.paid_amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-orange-600 font-medium">Balance Amount</p>
                <p className="text-2xl font-bold text-orange-900">₹{invoice.balance_amount.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {invoice.balance_amount > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Allocate Payment
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Receipt/Advance
                  </label>
                  <select
                    value={selectedVoucher}
                    onChange={(e) => setSelectedVoucher(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select Receipt --</option>
                    {availableReceipts.map((voucher) => (
                      <option key={voucher.voucher_id} value={voucher.voucher_id}>
                        {voucher.voucher_number} - {formatDateDisplay(voucher.voucher_date)} -
                        Available: ₹{voucher.unallocated_amount.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount to Allocate
                    {selectedVoucherData && (
                      <span className="text-xs text-gray-500 ml-2">
                        (Max: ₹{maxAmount.toFixed(2)})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(e.target.value)}
                    placeholder="Enter amount"
                    step="0.01"
                    min="0"
                    max={maxAmount}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes about this payment allocation"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <button
                  onClick={handleAllocatePayment}
                  disabled={loading || !selectedVoucher || !allocationAmount}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Allocate Payment
                </button>
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-green-600" />
              Linked Payments
            </h3>

            {existingPayments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No payments linked yet</p>
            ) : (
              <div className="space-y-3">
                {existingPayments.map((payment) => (
                  <div
                    key={payment.payment_id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-800">
                          {payment.voucher_number}
                        </span>
                        {payment.is_advance && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                            Advance
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateDisplay(payment.payment_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ₹{payment.payment_amount.toFixed(2)}
                        </span>
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemovePayment(payment.payment_id)}
                      disabled={loading}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50 p-2"
                      title="Remove payment allocation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
