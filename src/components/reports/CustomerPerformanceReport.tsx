import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface CustomerReport {
    customer_id: string;
    customer_name: string;
    email: string;
    phone: string;
    total_works: number;
    completed_works: number;
    pending_works: number;
    overdue_works: number;
    total_billed: number;
    total_paid: number;
    total_pending: number;
    avg_invoice_value: number;
    first_work_date: string;
    last_work_date: string;
}

interface CustomerPerformanceReportProps {
    data: CustomerReport[];
}

export default function CustomerPerformanceReport({ data }: CustomerPerformanceReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No customer performance data found for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Customer Performance Report</h2>
                    <p className="text-sm text-gray-500 mt-1">Detailed analysis of customer engagement and revenue</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Customer': r.customer_name,
                        'Email': r.email,
                        'Phone': r.phone,
                        'Total Works': r.total_works,
                        'Completed': r.completed_works,
                        'Pending': r.pending_works,
                        'Total Billed': r.total_billed,
                        'Paid': r.total_paid,
                        'Pending Amount': r.total_pending,
                    })), 'customer_report', 'Customer Performance')}
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
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Works</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Completed</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Billed</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Paid</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Pending</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report) => (
                                <tr key={report.customer_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.customer_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="font-medium">{report.email}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{report.phone}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-center text-gray-600 font-medium">{report.total_works}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            {report.completed_works}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        ₹{report.total_billed.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-green-600 font-semibold">
                                        ₹{report.total_paid.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-red-600 font-semibold">
                                        ₹{report.total_pending.toLocaleString('en-IN')}
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
