import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText,
  Users,
  Briefcase,
  Clock,
  DollarSign,
  TrendingUp,
  Calendar,
  Download
} from 'lucide-react';

interface CustomerReport {
  customer_id: string;
  customer_name: string;
  total_works: number;
  completed_works: number;
  pending_works: number;
  total_billed: number;
  total_paid: number;
  total_pending: number;
}

interface WorkReport {
  work_id: string;
  work_title: string;
  customer_name: string;
  status: string;
  estimated_hours: number;
  actual_hours: number;
  billing_status: string;
}

interface StaffReport {
  staff_id: string;
  staff_name: string;
  total_works: number;
  completed_works: number;
  pending_works: number;
  overdue_works: number;
  total_hours: number;
}

export default function Reports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('customer');
  const [customerReports, setCustomerReports] = useState<CustomerReport[]>([]);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [staffReports, setStaffReports] = useState<StaffReport[]>([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (user) {
      fetchReports();
    }
  }, [user, dateRange]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCustomerReports(),
        fetchWorkReports(),
        fetchStaffReports(),
      ]);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerReports = async () => {
    try {
      const { data: works, error: worksError } = await supabase
        .from('works')
        .select('*, customers(name), invoices(total_amount, amount_paid, status)')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);

      if (worksError) throw worksError;

      const customerMap = new Map<string, CustomerReport>();

      works?.forEach((work: any) => {
        const customerId = work.customer_id;
        const customerName = work.customers?.name || 'Unknown';

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer_id: customerId,
            customer_name: customerName,
            total_works: 0,
            completed_works: 0,
            pending_works: 0,
            total_billed: 0,
            total_paid: 0,
            total_pending: 0,
          });
        }

        const report = customerMap.get(customerId)!;
        report.total_works++;

        if (work.status === 'completed') report.completed_works++;
        else if (work.status === 'pending' || work.status === 'in_progress') report.pending_works++;

        work.invoices?.forEach((invoice: any) => {
          report.total_billed += invoice.total_amount || 0;
          report.total_paid += invoice.amount_paid || 0;
        });

        report.total_pending = report.total_billed - report.total_paid;
      });

      setCustomerReports(Array.from(customerMap.values()));
    } catch (error) {
      console.error('Error fetching customer reports:', error);
    }
  };

  const fetchWorkReports = async () => {
    try {
      const { data, error } = await supabase
        .from('works')
        .select('*, customers(name)')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const reports = data?.map((work: any) => ({
        work_id: work.id,
        work_title: work.title,
        customer_name: work.customers?.name || 'Unknown',
        status: work.status,
        estimated_hours: work.estimated_hours || 0,
        actual_hours: work.actual_hours || 0,
        billing_status: work.billing_status || 'unbilled',
      })) || [];

      setWorkReports(reports);
    } catch (error) {
      console.error('Error fetching work reports:', error);
    }
  };

  const fetchStaffReports = async () => {
    try {
      const { data: assignments, error } = await supabase
        .from('work_assignments')
        .select('*, staff_members(name), works(status, due_date, actual_hours)')
        .gte('assigned_at', dateRange.start)
        .lte('assigned_at', dateRange.end);

      if (error) throw error;

      const staffMap = new Map<string, StaffReport>();
      const today = new Date();

      assignments?.forEach((assignment: any) => {
        const staffId = assignment.staff_member_id;
        const staffName = assignment.staff_members?.name || 'Unknown';

        if (!staffMap.has(staffId)) {
          staffMap.set(staffId, {
            staff_id: staffId,
            staff_name: staffName,
            total_works: 0,
            completed_works: 0,
            pending_works: 0,
            overdue_works: 0,
            total_hours: 0,
          });
        }

        const report = staffMap.get(staffId)!;
        report.total_works++;
        report.total_hours += assignment.works?.actual_hours || 0;

        if (assignment.works?.status === 'completed') {
          report.completed_works++;
        } else {
          report.pending_works++;

          if (assignment.works?.due_date) {
            const dueDate = new Date(assignment.works.due_date);
            if (dueDate < today) {
              report.overdue_works++;
            }
          }
        }
      });

      setStaffReports(Array.from(staffMap.values()));
    } catch (error) {
      console.error('Error fetching staff reports:', error);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">Comprehensive business insights and performance metrics</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <label className="text-sm font-medium text-gray-700">From:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">To:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {[
          { id: 'customer', label: 'Customer Reports', icon: Users },
          { id: 'work', label: 'Work Reports', icon: Briefcase },
          { id: 'staff', label: 'Staff Reports', icon: Users },
          { id: 'time', label: 'Time Analysis', icon: Clock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'customer' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Customer-wise Report</h2>
            <button
              onClick={() => exportToCSV(customerReports, 'customer_report')}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Works
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completed
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pending
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Billed
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount Paid
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pending Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customerReports.map((report) => (
                    <tr key={report.customer_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {report.customer_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                        {report.total_works}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">
                          {report.completed_works}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                          {report.pending_works}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                        ₹{report.total_billed.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-semibold">
                        ₹{report.total_paid.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 font-semibold">
                        ₹{report.total_pending.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                  {customerReports.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        No customer data available for the selected period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'work' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Work-wise Report</h2>
            <button
              onClick={() => exportToCSV(workReports, 'work_report')}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {workReports.map((report) => (
              <div
                key={report.work_id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{report.work_title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{report.customer_name}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      report.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : report.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {report.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Est. Hours</p>
                    <p className="text-lg font-semibold text-gray-900">{report.estimated_hours}h</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Actual Hours</p>
                    <p className="text-lg font-semibold text-gray-900">{report.actual_hours}h</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Billing</p>
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
                        report.billing_status === 'billed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {report.billing_status}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {workReports.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                No work data available for the selected period
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Staff-wise Report</h2>
            <button
              onClick={() => exportToCSV(staffReports, 'staff_report')}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {staffReports.map((report) => (
              <div
                key={report.staff_id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Users className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{report.staff_name}</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Works</span>
                    <span className="font-semibold text-gray-900">{report.total_works}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Completed</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                      {report.completed_works}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Pending</span>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                      {report.pending_works}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Overdue</span>
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                      {report.overdue_works}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="text-sm text-gray-600">Total Hours</span>
                    <span className="font-bold text-lg text-blue-600">{report.total_hours.toFixed(1)}h</span>
                  </div>
                </div>
              </div>
            ))}

            {staffReports.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                No staff data available for the selected period
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'time' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Time-based Analysis</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 opacity-80" />
                <TrendingUp className="w-5 h-5 opacity-80" />
              </div>
              <p className="text-sm opacity-90">Total Hours Logged</p>
              <p className="text-3xl font-bold mt-2">
                {staffReports.reduce((sum, r) => sum + r.total_hours, 0).toFixed(1)}h
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Briefcase className="w-8 h-8 opacity-80" />
                <TrendingUp className="w-5 h-5 opacity-80" />
              </div>
              <p className="text-sm opacity-90">Avg Hours/Work</p>
              <p className="text-3xl font-bold mt-2">
                {workReports.length > 0
                  ? (workReports.reduce((sum, r) => sum + r.actual_hours, 0) / workReports.length).toFixed(1)
                  : 0}h
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-8 h-8 opacity-80" />
                <TrendingUp className="w-5 h-5 opacity-80" />
              </div>
              <p className="text-sm opacity-90">Avg Hours/Staff</p>
              <p className="text-3xl font-bold mt-2">
                {staffReports.length > 0
                  ? (staffReports.reduce((sum, r) => sum + r.total_hours, 0) / staffReports.length).toFixed(1)
                  : 0}h
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 opacity-80" />
                <TrendingUp className="w-5 h-5 opacity-80" />
              </div>
              <p className="text-sm opacity-90">Total Revenue</p>
              <p className="text-3xl font-bold mt-2">
                ₹{customerReports.reduce((sum, r) => sum + r.total_paid, 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
