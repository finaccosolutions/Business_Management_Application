import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface ServiceReport {
    service_id: string;
    service_name: string;
    category: string;
    total_orders: number;
    completed_orders: number;
    pending_orders: number;
    total_revenue: number;
    avg_revenue_per_order: number;
    avg_completion_time: number;
    customer_satisfaction: number;
}

interface ServicePerformanceReportProps {
    data: ServiceReport[];
}

export default function ServicePerformanceReport({ data }: ServicePerformanceReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No service performance data found for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Service Performance Report</h2>
                    <p className="text-sm text-gray-500 mt-1">Service-wise revenue and performance analysis</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Service': r.service_name,
                        'Category': r.category,
                        'Total Orders': r.total_orders,
                        'Completed': r.completed_orders,
                        'Total Revenue': r.total_revenue,
                        'Avg Revenue': r.avg_revenue_per_order,
                        'Avg Days': r.avg_completion_time,
                    })), 'service_report', 'Service Performance')}
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
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service Name</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Orders</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Completed</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Revenue</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Revenue</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Days</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report) => (
                                <tr key={report.service_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.service_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.category}</td>
                                    <td className="px-6 py-4 text-sm text-center text-gray-600 font-medium">{report.total_orders}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            {report.completed_orders}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        ₹{report.total_revenue.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                                        ₹{report.avg_revenue_per_order.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                                        {report.avg_completion_time.toFixed(1)} days
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
