import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface WorkReport {
    work_id: string;
    work_title: string;
    customer_name: string;
    service_name: string;
    status: string;
    priority: string;
    start_date: string;
    due_date: string;
    completion_date: string | null;
    estimated_hours: number;
    actual_hours: number;
    assigned_staff: string;
    billing_status: string;
    total_amount: number;
}

interface WorkPerformanceReportProps {
    data: WorkReport[];
}

export default function WorkPerformanceReport({ data }: WorkPerformanceReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No work performance data found for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Work Performance Report</h2>
                    <p className="text-sm text-gray-500 mt-1">Comprehensive work tracking and analysis</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Work Title': r.work_title,
                        'Customer': r.customer_name,
                        'Service': r.service_name,
                        'Status': r.status,
                        'Priority': r.priority,
                        'Due Date': r.due_date,
                        'Amount': r.total_amount,
                    })), 'work_report', 'Work Performance')}
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
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Work Title</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Due Date</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report) => (
                                <tr key={report.work_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.work_title}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.customer_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.service_name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${report.status === 'completed' ? 'bg-green-100 text-green-800' :
                                            report.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                            {report.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${report.priority === 'high' ? 'bg-red-100 text-red-800' :
                                            report.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                            {report.priority}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {report.due_date ? new Date(report.due_date).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        ₹{report.total_amount.toLocaleString('en-IN')}
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
