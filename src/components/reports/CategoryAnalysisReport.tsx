import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface CategoryReport {
    category: string;
    total_services: number;
    total_works: number;
    completed_works: number;
    total_revenue: number;
    avg_revenue_per_work: number;
    active_customers: number;
}

interface CategoryAnalysisReportProps {
    data: CategoryReport[];
}

export default function CategoryAnalysisReport({ data }: CategoryAnalysisReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No category analysis data found for the selected period.</p>
            </div>
        );
    }

    // Calculate max values for bar visualization
    const maxRevenue = Math.max(...data.map(d => d.total_revenue), 1);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Category Analysis</h2>
                    <p className="text-sm text-gray-500 mt-1">Service category performance and revenue breakdown</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Category': r.category,
                        'Total Services': r.total_services,
                        'Total Works': r.total_works,
                        'Completed Works': r.completed_works,
                        'Total Revenue': r.total_revenue,
                        'Avg Revenue': r.avg_revenue_per_work,
                        'Active Customers': r.active_customers,
                    })), 'category_report', 'Category Analysis')}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    <span>Export Excel</span>
                </button>
            </div>

            {/* Category Performance Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.slice(0, 3).map((cat, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <h4 className="text-lg font-semibold text-gray-800 break-words">{cat.category}</h4>
                        <div className="mt-3 flex items-baseline justify-between">
                            <span className="text-2xl font-bold text-gray-900">₹{cat.total_revenue.toLocaleString('en-IN')}</span>
                            <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                {cat.completed_works} works done
                            </span>
                        </div>
                        <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${(cat.total_revenue / maxRevenue) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Works (Total/Done)</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Revenue</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg/Work</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Customers</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.category}</td>
                                    <td className="px-6 py-4 text-sm text-center text-gray-600">
                                        <span className="font-medium text-gray-800">{report.total_works}</span>
                                        <span className="mx-1 text-gray-400">/</span>
                                        <span className="text-green-600">{report.completed_works}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        ₹{report.total_revenue.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                                        ₹{Math.round(report.avg_revenue_per_work).toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-center text-gray-600">
                                        {report.active_customers}
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
