import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface InvoiceReport {
    invoice_id: string;
    invoice_number: string;
    customer_name: string;
    invoice_date: string;
    due_date: string;
    total_amount: number;
    amount_paid: number;
    balance: number;
    status: string;
    payment_date: string | null;
    days_to_payment: number | null;
    overdue_days: number;
}

interface InvoiceReportProps {
    data: InvoiceReport[];
}

export default function InvoiceReportComponent({ data }: InvoiceReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No invoice data found for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Invoice Report</h2>
                    <p className="text-sm text-gray-500 mt-1">Detailed invoice tracking and payment analysis</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Invoice No': r.invoice_number,
                        'Customer': r.customer_name,
                        'Invoice Date': r.invoice_date,
                        'Due Date': r.due_date,
                        'Total Amount': r.total_amount,
                        'Paid': r.amount_paid,
                        'Balance': r.balance,
                        'Status': r.status,
                    })), 'invoice_report', 'Invoice Report')}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    <span>Export Excel</span>
                </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Invoice No.</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Invoice Date</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Due Date</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Amount</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Paid</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report) => (
                                <tr key={report.invoice_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.invoice_number}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.customer_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {new Date(report.invoice_date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {report.due_date ? new Date(report.due_date).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        ₹{report.total_amount.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-green-600 font-semibold">
                                        ₹{report.amount_paid.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-red-600 font-semibold">
                                        ₹{report.balance.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${report.status === 'paid' ? 'bg-green-100 text-green-800' :
                                            report.status === 'unpaid' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {report.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
