import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { DollarSign, TrendingUp, AlertCircle, FileText, Calendar } from 'lucide-react';
import { formatDateDisplay } from '../../lib/dateUtils';
import { exportToXLSX } from '../../lib/exportUtils';

interface ReceivableItem {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_name: string;
  customer_id: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: string;
  payments: any[];
}

interface ReceivablesSummary {
  totalReceivables: number;
  currentReceivables: number;
  overdueReceivables: number;
  totalInvoices: number;
  overdueInvoices: number;
}

export default function ReceivablesReport() {
  const { user } = useAuth();
  const [receivables, setReceivables] = useState<ReceivableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReceivablesSummary>({
    totalReceivables: 0,
    currentReceivables: 0,
    overdueReceivables: 0,
    totalInvoices: 0,
    overdueInvoices: 0,
  });
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (user) {
      fetchCustomers();
      fetchReceivables();
    }
  }, [user]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .eq('type', 'customer')
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchReceivables = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_payment_summary_view')
        .select('*')
        .gt('balance_amount', 0)
        .order('due_date', { ascending: true });

      if (error) throw error;

      const receivablesData = data || [];
      setReceivables(receivablesData);
      calculateSummary(receivablesData);
    } catch (error) {
      console.error('Error fetching receivables:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (data: ReceivableItem[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const summary = data.reduce(
      (acc, item) => {
        const dueDate = new Date(item.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const isOverdue = dueDate < today;

        acc.totalReceivables += item.balance_amount;
        acc.totalInvoices += 1;

        if (isOverdue) {
          acc.overdueReceivables += item.balance_amount;
          acc.overdueInvoices += 1;
        } else {
          acc.currentReceivables += item.balance_amount;
        }

        return acc;
      },
      {
        totalReceivables: 0,
        currentReceivables: 0,
        overdueReceivables: 0,
        totalInvoices: 0,
        overdueInvoices: 0,
      }
    );

    setSummary(summary);
  };

  const filteredReceivables = receivables.filter((item) => {
    if (filterCustomer !== 'all' && item.customer_id !== filterCustomer) return false;

    if (filterStatus === 'overdue') {
      const dueDate = new Date(item.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return dueDate < today;
    }
    if (filterStatus === 'current') {
      const dueDate = new Date(item.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return dueDate >= today;
    }

    return true;
  });

  const handleExport = () => {
    const exportData = filteredReceivables.map((item) => ({
      'Invoice Number': item.invoice_number,
      'Invoice Date': formatDateDisplay(item.invoice_date),
      'Due Date': formatDateDisplay(item.due_date),
      'Customer': item.customer_name,
      'Total Amount': item.total_amount,
      'Paid Amount': item.paid_amount,
      'Balance Amount': item.balance_amount,
      'Days Overdue': Math.max(
        0,
        Math.floor((new Date().getTime() - new Date(item.due_date).getTime()) / (1000 * 60 * 60 * 24))
      ),
    }));

    exportToXLSX(exportData, 'Receivables_Report');
  };

  const getDaysOverdue = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = today.getTime() - due.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading receivables...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Receivables</p>
              <p className="text-3xl font-bold mt-2">₹{summary.totalReceivables.toFixed(2)}</p>
              <p className="text-blue-100 text-xs mt-1">{summary.totalInvoices} invoices</p>
            </div>
            <DollarSign className="w-12 h-12 text-blue-200 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Current</p>
              <p className="text-3xl font-bold mt-2">₹{summary.currentReceivables.toFixed(2)}</p>
              <p className="text-green-100 text-xs mt-1">Not yet due</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-200 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Overdue</p>
              <p className="text-3xl font-bold mt-2">₹{summary.overdueReceivables.toFixed(2)}</p>
              <p className="text-red-100 text-xs mt-1">{summary.overdueInvoices} invoices</p>
            </div>
            <AlertCircle className="w-12 h-12 text-red-200 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Collection %</p>
              <p className="text-3xl font-bold mt-2">
                {receivables.length > 0
                  ? (
                      (receivables.reduce((sum, r) => sum + r.paid_amount, 0) /
                        receivables.reduce((sum, r) => sum + r.total_amount, 0)) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
              <p className="text-purple-100 text-xs mt-1">Average collection</p>
            </div>
            <FileText className="w-12 h-12 text-purple-200 opacity-80" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-800">Outstanding Receivables</h3>
          <div className="flex flex-wrap gap-4">
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="current">Current</option>
              <option value="overdue">Overdue</option>
            </select>

            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {filteredReceivables.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No outstanding receivables</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Invoice Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReceivables.map((item) => {
                  const daysOverdue = getDaysOverdue(item.due_date);
                  const isOverdue = daysOverdue > 0;

                  return (
                    <tr key={item.invoice_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{item.invoice_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{item.customer_name}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {formatDateDisplay(item.invoice_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'}>
                            {formatDateDisplay(item.due_date)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900">
                        ₹{item.total_amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-green-600">
                        ₹{item.paid_amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="font-semibold text-orange-600">
                          ₹{item.balance_amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertCircle className="w-3 h-3" />
                            {daysOverdue}d overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Current
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
