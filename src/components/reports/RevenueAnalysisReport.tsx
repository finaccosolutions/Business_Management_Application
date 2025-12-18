import { Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface RevenueReport {
    period: string;
    total_revenue: number;
    paid_invoices: number;
    unpaid_invoices: number;
    partially_paid_invoices: number;
    avg_invoice_value: number;
    total_customers: number;
    new_customers: number;
    revenue_growth: number;
}

interface RevenueAnalysisReportProps {
    data: RevenueReport[];
}

export default function RevenueAnalysisReport({ data }: RevenueAnalysisReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No revenue data found for the selected period.</p>
            </div>
        );
    }

    // Calculate generic max value for simple bar scaling
    const maxRevenue = Math.max(...data.map(d => d.total_revenue), 1);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Revenue Analysis</h2>
                    <p className="text-sm text-gray-500 mt-1">Monthly revenue trends and growth analysis</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Period': r.period,
                        'Total Revenue': r.total_revenue,
                        'Paid Invoices': r.paid_invoices,
                        'Unpaid Invoices': r.unpaid_invoices,
                        'Avg Invoice Value': r.avg_invoice_value,
                        'Growth': r.revenue_growth.toFixed(2) + '%',
                    })), 'revenue_report', 'Revenue Analysis')}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    <span>Export Excel</span>
                </button>
            </div>

            {/* Visual Chart Area (Simplified HTML/CSS Bar Chart) */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-base font-semibold text-gray-800 mb-6">Revenue Trend</h3>
                <div className="flex items-end space-x-4 h-64 w-full overflow-x-auto pb-2">
                    {data.map((item, index) => {
                        const heightPercentage = Math.max((item.total_revenue / maxRevenue) * 100, 2); // Min 2% height
                        return (
                            <div key={index} className="flex flex-col items-center flex-1 min-w-[60px] group">
                                <div className="relative w-full flex justify-center items-end h-full">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap z-10">
                                        ₹{item.total_revenue.toLocaleString('en-IN')}
                                    </div>
                                    <div
                                        className="w-full max-w-[40px] bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-all duration-300"
                                        style={{ height: `${heightPercentage}%` }}
                                    ></div>
                                </div>
                                <div className="mt-2 text-xs text-gray-500 font-medium truncate w-full text-center rotate-0">{item.period}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Period</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Revenue</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Invoices (Paid/Unpaid)</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Value</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Growth</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report, index) => (
                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.period}</td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                                        ₹{report.total_revenue.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-center text-gray-600">
                                        <span className="text-green-600 font-medium">{report.paid_invoices}</span>
                                        <span className="text-gray-400 mx-1">/</span>
                                        <span className="text-red-500 font-medium">{report.unpaid_invoices}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                                        ₹{Math.round(report.avg_invoice_value).toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-center">
                                        <div className={`flex items-center justify-center space-x-1 ${report.revenue_growth > 0 ? 'text-green-600' :
                                                report.revenue_growth < 0 ? 'text-red-600' : 'text-gray-400'
                                            }`}>
                                            {report.revenue_growth > 0 ? <TrendingUp size={16} /> :
                                                report.revenue_growth < 0 ? <TrendingDown size={16} /> :
                                                    <Minus size={16} />}
                                            <span className="font-medium">{Math.abs(report.revenue_growth).toFixed(1)}%</span>
                                        </div>
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
