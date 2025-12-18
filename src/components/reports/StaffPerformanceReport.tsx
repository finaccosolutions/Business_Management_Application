import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface StaffReport {
    staff_id: string;
    staff_name: string;
    email: string;
    role: string;
    total_works: number;
    completed_works: number;
    pending_works: number;
    overdue_works: number;
    total_hours: number;
    avg_completion_time: number;
    efficiency_rating: number;
}

interface StaffPerformanceReportProps {
    data: StaffReport[];
}

export default function StaffPerformanceReport({ data }: StaffPerformanceReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No staff performance data found for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Staff Performance Report</h2>
                    <p className="text-sm text-gray-500 mt-1">Individual staff member performance metrics</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Staff Name': r.staff_name,
                        'Role': r.role,
                        'Total Works': r.total_works,
                        'Completed': r.completed_works,
                        'Pending': r.pending_works,
                        'Total Hours': r.total_hours,
                        'Efficiency': r.efficiency_rating + '%',
                    })), 'staff_report', 'Staff Performance')}
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
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Staff Name</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Works</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Completed</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Pending</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Hours</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Efficiency</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report) => (
                                <tr key={report.staff_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.staff_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.role}</td>
                                    <td className="px-6 py-4 text-sm text-center text-gray-600 font-medium">{report.total_works}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            {report.completed_works}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                            {report.pending_works}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-900 font-medium">{report.total_hours.toFixed(1)}h</td>
                                    <td className="px-6 py-4 text-sm text-right">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${report.efficiency_rating >= 80 ? 'bg-green-100 text-green-800' :
                                            report.efficiency_rating >= 60 ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                            {report.efficiency_rating.toFixed(1)}%
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
