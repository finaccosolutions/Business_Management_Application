import { Download } from 'lucide-react';
import { exportToXLSX } from '../../lib/exportUtils';

interface LeadReport {
    lead_id: string;
    lead_name: string;
    source: string;
    status: string;
    created_date: string;
    converted_date: string | null;
    days_to_convert: number | null;
    estimated_value: number;
    assigned_staff: string;
}

interface LeadConversionReportProps {
    data: LeadReport[];
}

export default function LeadConversionReport({ data }: LeadConversionReportProps) {
    if (data.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No lead data found for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Lead Conversion Report</h2>
                    <p className="text-sm text-gray-500 mt-1">Lead tracking and conversion analysis</p>
                </div>
                <button
                    onClick={() => exportToXLSX(data.map(r => ({
                        'Lead Name': r.lead_name,
                        'Source': r.source,
                        'Status': r.status,
                        'Created Date': r.created_date,
                        'Converted Date': r.converted_date,
                        'Days to Convert': r.days_to_convert,
                        'Estimated Value': r.estimated_value,
                        'Assigned To': r.assigned_staff,
                    })), 'lead_report', 'Lead Conversion')}
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
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Lead Name</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Source</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Converted</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Est. Value</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assigned To</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((report) => (
                                <tr key={report.lead_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.lead_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.source}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${report.status === 'converted' ? 'bg-green-100 text-green-800' :
                                            report.status === 'lost' ? 'bg-red-100 text-red-800' :
                                                'bg-blue-100 text-blue-800'
                                            }`}>
                                            {report.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {new Date(report.created_date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {report.converted_date ? new Date(report.converted_date).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                                        ₹{report.estimated_value.toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{report.assigned_staff}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
