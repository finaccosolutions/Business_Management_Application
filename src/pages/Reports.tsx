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
  Download,
  Activity,
  Package,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  FileSpreadsheet,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';

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

interface CategoryReport {
  category: string;
  total_services: number;
  total_works: number;
  completed_works: number;
  total_revenue: number;
  avg_revenue_per_work: number;
  active_customers: number;
}

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

export default function Reports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('customer');

  const [customerReports, setCustomerReports] = useState<CustomerReport[]>([]);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [staffReports, setStaffReports] = useState<StaffReport[]>([]);
  const [serviceReports, setServiceReports] = useState<ServiceReport[]>([]);
  const [invoiceReports, setInvoiceReports] = useState<InvoiceReport[]>([]);
  const [categoryReports, setCategoryReports] = useState<CategoryReport[]>([]);
  const [leadReports, setLeadReports] = useState<LeadReport[]>([]);
  const [revenueReports, setRevenueReports] = useState<RevenueReport[]>([]);

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
        fetchServiceReports(),
        fetchInvoiceReports(),
        fetchCategoryReports(),
        fetchLeadReports(),
        fetchRevenueReports(),
      ]);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerReports = async () => {
    try {
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);

      if (!customers) return;

      const reports: CustomerReport[] = [];

      for (const customer of customers) {
        const { data: works } = await supabase
          .from('works')
          .select('*, invoices(total_amount, amount_paid, status)')
          .eq('customer_id', customer.id);

        const { data: firstWork } = await supabase
          .from('works')
          .select('created_at')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        const { data: lastWork } = await supabase
          .from('works')
          .select('created_at')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const totalWorks = works?.length || 0;
        const completedWorks = works?.filter(w => w.status === 'completed').length || 0;
        const pendingWorks = works?.filter(w => w.status === 'pending' || w.status === 'in_progress').length || 0;
        const overdueWorks = works?.filter(w => w.status === 'overdue').length || 0;

        let totalBilled = 0;
        let totalPaid = 0;
        let invoiceCount = 0;

        works?.forEach(work => {
          work.invoices?.forEach((invoice: any) => {
            totalBilled += Number(invoice.total_amount) || 0;
            totalPaid += Number(invoice.amount_paid) || 0;
            invoiceCount++;
          });
        });

        reports.push({
          customer_id: customer.id,
          customer_name: customer.name,
          email: customer.email || '',
          phone: customer.phone || '',
          total_works: totalWorks,
          completed_works: completedWorks,
          pending_works: pendingWorks,
          overdue_works: overdueWorks,
          total_billed: totalBilled,
          total_paid: totalPaid,
          total_pending: totalBilled - totalPaid,
          avg_invoice_value: invoiceCount > 0 ? totalBilled / invoiceCount : 0,
          first_work_date: firstWork?.created_at || '',
          last_work_date: lastWork?.created_at || '',
        });
      }

      setCustomerReports(reports.sort((a, b) => b.total_billed - a.total_billed));
    } catch (error) {
      console.error('Error fetching customer reports:', error);
    }
  };

  const fetchWorkReports = async () => {
    try {
      const { data } = await supabase
        .from('works')
        .select(`
          *,
          customers(name),
          services(name),
          staff_members(name),
          invoices(total_amount, status)
        `)
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });

      if (!data) return;

      const reports: WorkReport[] = data.map((work: any) => ({
        work_id: work.id,
        work_title: work.title,
        customer_name: work.customers?.name || 'Unknown',
        service_name: work.services?.name || 'Unknown',
        status: work.status,
        priority: work.priority || 'medium',
        start_date: work.start_date || work.created_at,
        due_date: work.due_date || '',
        completion_date: work.completion_date,
        estimated_hours: work.estimated_hours || 0,
        actual_hours: work.actual_hours || 0,
        assigned_staff: work.staff_members?.name || 'Unassigned',
        billing_status: work.billing_status || 'unbilled',
        total_amount: work.invoices?.[0]?.total_amount || 0,
      }));

      setWorkReports(reports);
    } catch (error) {
      console.error('Error fetching work reports:', error);
    }
  };

  const fetchStaffReports = async () => {
    try {
      const { data: staff } = await supabase
        .from('staff_members')
        .select('*');

      if (!staff) return;

      const reports: StaffReport[] = [];
      const today = new Date();

      for (const member of staff) {
        const { data: assignments } = await supabase
          .from('work_assignments')
          .select('*, works(status, due_date, actual_hours, created_at, completion_date)')
          .eq('staff_member_id', member.id)
          .gte('assigned_at', dateRange.start)
          .lte('assigned_at', dateRange.end);

        const totalWorks = assignments?.length || 0;
        const completedWorks = assignments?.filter(a => a.works?.status === 'completed').length || 0;
        const pendingWorks = assignments?.filter(a =>
          a.works?.status === 'pending' || a.works?.status === 'in_progress'
        ).length || 0;
        const overdueWorks = assignments?.filter(a => {
          if (a.works?.due_date && a.works?.status !== 'completed') {
            return new Date(a.works.due_date) < today;
          }
          return false;
        }).length || 0;

        const totalHours = assignments?.reduce((sum, a) => sum + (a.works?.actual_hours || 0), 0) || 0;

        const completedAssignments = assignments?.filter(a =>
          a.works?.status === 'completed' && a.works?.created_at && a.works?.completion_date
        ) || [];

        let avgCompletionTime = 0;
        if (completedAssignments.length > 0) {
          const totalDays = completedAssignments.reduce((sum, a) => {
            const start = new Date(a.works.created_at);
            const end = new Date(a.works.completion_date);
            return sum + Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          }, 0);
          avgCompletionTime = totalDays / completedAssignments.length;
        }

        const efficiencyRating = totalWorks > 0 ? (completedWorks / totalWorks) * 100 : 0;

        reports.push({
          staff_id: member.id,
          staff_name: member.name,
          email: member.email || '',
          role: member.role || 'Staff',
          total_works: totalWorks,
          completed_works: completedWorks,
          pending_works: pendingWorks,
          overdue_works: overdueWorks,
          total_hours: totalHours,
          avg_completion_time: avgCompletionTime,
          efficiency_rating: efficiencyRating,
        });
      }

      setStaffReports(reports.sort((a, b) => b.efficiency_rating - a.efficiency_rating));
    } catch (error) {
      console.error('Error fetching staff reports:', error);
    }
  };

  const fetchServiceReports = async () => {
    try {
      const { data: services } = await supabase
        .from('services')
        .select('*');

      if (!services) return;

      const reports: ServiceReport[] = [];

      for (const service of services) {
        const { data: works } = await supabase
          .from('works')
          .select('*, invoices(total_amount, status)')
          .eq('service_id', service.id)
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);

        const totalOrders = works?.length || 0;
        const completedOrders = works?.filter(w => w.status === 'completed').length || 0;
        const pendingOrders = works?.filter(w => w.status !== 'completed').length || 0;

        let totalRevenue = 0;
        works?.forEach(work => {
          work.invoices?.forEach((invoice: any) => {
            if (invoice.status === 'paid') {
              totalRevenue += Number(invoice.total_amount) || 0;
            }
          });
        });

        const avgRevenuePerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const completedWorks = works?.filter(w =>
          w.status === 'completed' && w.created_at && w.completion_date
        ) || [];

        let avgCompletionTime = 0;
        if (completedWorks.length > 0) {
          const totalDays = completedWorks.reduce((sum, w) => {
            const start = new Date(w.created_at);
            const end = new Date(w.completion_date);
            return sum + Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          }, 0);
          avgCompletionTime = totalDays / completedWorks.length;
        }

        reports.push({
          service_id: service.id,
          service_name: service.name,
          category: service.category || 'Uncategorized',
          total_orders: totalOrders,
          completed_orders: completedOrders,
          pending_orders: pendingOrders,
          total_revenue: totalRevenue,
          avg_revenue_per_order: avgRevenuePerOrder,
          avg_completion_time: avgCompletionTime,
          customer_satisfaction: completedOrders > 0 ? (completedOrders / totalOrders) * 5 : 0,
        });
      }

      setServiceReports(reports.sort((a, b) => b.total_revenue - a.total_revenue));
    } catch (error) {
      console.error('Error fetching service reports:', error);
    }
  };

  const fetchInvoiceReports = async () => {
    try {
      const { data } = await supabase
        .from('invoices')
        .select('*, customers(name)')
        .gte('invoice_date', dateRange.start)
        .lte('invoice_date', dateRange.end)
        .order('invoice_date', { ascending: false });

      if (!data) return;

      const today = new Date();

      const reports: InvoiceReport[] = data.map((invoice: any) => {
        const amountPaid = Number(invoice.amount_paid) || 0;
        const totalAmount = Number(invoice.total_amount) || 0;
        const balance = totalAmount - amountPaid;

        let daysToPayment = null;
        if (invoice.payment_date && invoice.invoice_date) {
          const invoiceDate = new Date(invoice.invoice_date);
          const paymentDate = new Date(invoice.payment_date);
          daysToPayment = Math.floor((paymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        let overdueDays = 0;
        if (invoice.status !== 'paid' && invoice.due_date) {
          const dueDate = new Date(invoice.due_date);
          if (dueDate < today) {
            overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }

        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number || 'N/A',
          customer_name: invoice.customers?.name || 'Unknown',
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date || '',
          total_amount: totalAmount,
          amount_paid: amountPaid,
          balance: balance,
          status: invoice.status,
          payment_date: invoice.payment_date,
          days_to_payment: daysToPayment,
          overdue_days: overdueDays,
        };
      });

      setInvoiceReports(reports);
    } catch (error) {
      console.error('Error fetching invoice reports:', error);
    }
  };

  const fetchCategoryReports = async () => {
    try {
      const { data: services } = await supabase
        .from('services')
        .select('category');

      if (!services) return;

      const categories = [...new Set(services.map(s => s.category || 'Uncategorized'))];
      const reports: CategoryReport[] = [];

      for (const category of categories) {
        const { data: categoryServices } = await supabase
          .from('services')
          .select('id')
          .eq('category', category === 'Uncategorized' ? null : category);

        const serviceIds = categoryServices?.map(s => s.id) || [];

        if (serviceIds.length === 0) continue;

        const { data: works } = await supabase
          .from('works')
          .select('*, invoices(total_amount, status), customer_id')
          .in('service_id', serviceIds)
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);

        const totalWorks = works?.length || 0;
        const completedWorks = works?.filter(w => w.status === 'completed').length || 0;

        let totalRevenue = 0;
        works?.forEach(work => {
          work.invoices?.forEach((invoice: any) => {
            if (invoice.status === 'paid') {
              totalRevenue += Number(invoice.total_amount) || 0;
            }
          });
        });

        const uniqueCustomers = new Set(works?.map(w => w.customer_id) || []);

        reports.push({
          category: category,
          total_services: serviceIds.length,
          total_works: totalWorks,
          completed_works: completedWorks,
          total_revenue: totalRevenue,
          avg_revenue_per_work: totalWorks > 0 ? totalRevenue / totalWorks : 0,
          active_customers: uniqueCustomers.size,
        });
      }

      setCategoryReports(reports.sort((a, b) => b.total_revenue - a.total_revenue));
    } catch (error) {
      console.error('Error fetching category reports:', error);
    }
  };

  const fetchLeadReports = async () => {
    try {
      const { data } = await supabase
        .from('leads')
        .select('*, staff_members(name)')
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });

      if (!data) return;

      const reports: LeadReport[] = data.map((lead: any) => {
        let daysToConvert = null;
        if (lead.converted_date && lead.created_at) {
          const createdDate = new Date(lead.created_at);
          const convertedDate = new Date(lead.converted_date);
          daysToConvert = Math.floor((convertedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          lead_id: lead.id,
          lead_name: lead.name,
          source: lead.source || 'Unknown',
          status: lead.status,
          created_date: lead.created_at,
          converted_date: lead.converted_date,
          days_to_convert: daysToConvert,
          estimated_value: Number(lead.estimated_value) || 0,
          assigned_staff: lead.staff_members?.name || 'Unassigned',
        };
      });

      setLeadReports(reports);
    } catch (error) {
      console.error('Error fetching lead reports:', error);
    }
  };

  const fetchRevenueReports = async () => {
    try {
      const reports: RevenueReport[] = [];
      const months = [];

      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        months.push({
          start: new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0],
          end: new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0],
          label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        });
      }

      for (const month of months) {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total_amount, amount_paid, status')
          .gte('invoice_date', month.start)
          .lte('invoice_date', month.end);

        const { data: customers } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', month.start)
          .lte('created_at', month.end);

        const paidInvoices = invoices?.filter(i => i.status === 'paid').length || 0;
        const unpaidInvoices = invoices?.filter(i => i.status === 'unpaid').length || 0;
        const partiallyPaidInvoices = invoices?.filter(i => i.status === 'partially_paid').length || 0;

        const totalRevenue = invoices
          ?.filter(i => i.status === 'paid')
          .reduce((sum, i) => sum + Number(i.total_amount), 0) || 0;

        const avgInvoiceValue = paidInvoices > 0 ? totalRevenue / paidInvoices : 0;

        reports.push({
          period: month.label,
          total_revenue: totalRevenue,
          paid_invoices: paidInvoices,
          unpaid_invoices: unpaidInvoices,
          partially_paid_invoices: partiallyPaidInvoices,
          avg_invoice_value: avgInvoiceValue,
          total_customers: customers?.count || 0,
          new_customers: customers?.count || 0,
          revenue_growth: 0,
        });
      }

      for (let i = 1; i < reports.length; i++) {
        const prevRevenue = reports[i - 1].total_revenue;
        const currRevenue = reports[i].total_revenue;
        reports[i].revenue_growth = prevRevenue > 0
          ? ((currRevenue - prevRevenue) / prevRevenue) * 100
          : 0;
      }

      setRevenueReports(reports);
    } catch (error) {
      console.error('Error fetching revenue reports:', error);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
      Object.values(row).map(val => {
        const stringVal = String(val);
        return stringVal.includes(',') ? `"${stringVal}"` : stringVal;
      }).join(',')
    ).join('\n');
    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const tabs = [
    { id: 'customer', label: 'Customer Reports', icon: Users, count: customerReports.length },
    { id: 'work', label: 'Work Reports', icon: Briefcase, count: workReports.length },
    { id: 'staff', label: 'Staff Reports', icon: Users, count: staffReports.length },
    { id: 'service', label: 'Service Reports', icon: Package, count: serviceReports.length },
    { id: 'invoice', label: 'Invoice Reports', icon: FileText, count: invoiceReports.length },
    { id: 'category', label: 'Category Reports', icon: BarChart3, count: categoryReports.length },
    { id: 'lead', label: 'Lead Reports', icon: Target, count: leadReports.length },
    { id: 'revenue', label: 'Revenue Analysis', icon: DollarSign, count: revenueReports.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 rounded-xl shadow-xl p-6 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-8 h-8" />
              Business Reports & Analytics
            </h1>
            <p className="text-slate-300 mt-2">Comprehensive reports and insights for data-driven decisions</p>
          </div>
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2 bg-gray-50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-all rounded-lg ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm">{tab.label}</span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                activeTab === tab.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'customer' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Customer Performance Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Detailed analysis of customer engagement and revenue</p>
                </div>
                <button
                  onClick={() => exportToCSV(customerReports, 'customer_report')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Works</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Completed</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Overdue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Billed</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {customerReports.map((report) => (
                        <tr key={report.customer_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{report.customer_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            <div>{report.email}</div>
                            <div className="text-xs text-gray-500">{report.phone}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600">{report.total_works}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              {report.completed_works}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                              {report.pending_works}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              {report.overdue_works}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                            ₹{report.total_billed.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-green-600 font-semibold">
                            ₹{report.total_paid.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">
                            ₹{report.total_pending.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            ₹{Math.round(report.avg_invoice_value).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                      {customerReports.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
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
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Work Performance Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Comprehensive work tracking and analysis</p>
                </div>
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
                    className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{report.work_title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{report.customer_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{report.service_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2 py-1 text-xs rounded-full font-medium ${
                            report.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : report.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : report.status === 'overdue'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {report.status}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full font-medium ${
                            report.priority === 'high'
                              ? 'bg-orange-100 text-orange-700'
                              : report.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {report.priority}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-200">
                      <div>
                        <p className="text-xs text-gray-500">Est. Hours</p>
                        <p className="text-lg font-semibold text-gray-900">{report.estimated_hours}h</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Actual Hours</p>
                        <p className="text-lg font-semibold text-gray-900">{report.actual_hours}h</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Amount</p>
                        <p className="text-lg font-semibold text-green-600">
                          ₹{Math.round(report.total_amount).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>Assigned: {report.assigned_staff}</span>
                      <span className={`font-medium ${
                        report.billing_status === 'billed' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {report.billing_status}
                      </span>
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
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Staff Performance Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Individual staff member performance metrics</p>
                </div>
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
                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{report.staff_name}</h3>
                        <p className="text-xs text-gray-500">{report.role}</p>
                      </div>
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
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Avg Completion</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {report.avg_completion_time.toFixed(1)} days
                        </span>
                      </div>
                      <div className="pt-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-600">Efficiency</span>
                          <span className="text-xs font-bold text-green-600">
                            {report.efficiency_rating.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all"
                            style={{ width: `${report.efficiency_rating}%` }}
                          ></div>
                        </div>
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

          {activeTab === 'service' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Service Performance Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Service-wise revenue and performance analysis</p>
                </div>
                <button
                  onClick={() => exportToCSV(serviceReports, 'service_report')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {serviceReports.map((report) => (
                  <div
                    key={report.service_id}
                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{report.service_name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{report.category}</p>
                      </div>
                      <div className="p-2 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-gray-600">Total Orders</p>
                        <p className="text-2xl font-bold text-blue-600">{report.total_orders}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-gray-600">Completed</p>
                        <p className="text-2xl font-bold text-green-600">{report.completed_orders}</p>
                      </div>
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <p className="text-xs text-gray-600">Pending</p>
                        <p className="text-2xl font-bold text-yellow-600">{report.pending_orders}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <p className="text-xs text-gray-600">Avg Time</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {report.avg_completion_time.toFixed(0)}d
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Revenue</span>
                        <span className="text-lg font-bold text-green-600">
                          ₹{report.total_revenue.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Avg Revenue/Order</span>
                        <span className="font-semibold text-gray-900">
                          ₹{Math.round(report.avg_revenue_per_order).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Satisfaction Score</span>
                        <span className="font-semibold text-yellow-600">
                          {report.customer_satisfaction.toFixed(1)}/5.0
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {serviceReports.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No service data available for the selected period
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'invoice' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Invoice Analysis Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Detailed invoice tracking and payment analysis</p>
                </div>
                <button
                  onClick={() => exportToCSV(invoiceReports, 'invoice_report')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days to Pay</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoiceReports.map((report) => (
                        <tr key={report.invoice_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{report.invoice_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{report.customer_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(report.invoice_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                            ₹{report.total_amount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-green-600 font-semibold">
                            ₹{report.amount_paid.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">
                            ₹{report.balance.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 text-xs rounded-full font-medium ${
                                report.status === 'paid'
                                  ? 'bg-green-100 text-green-700'
                                  : report.status === 'partially_paid'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {report.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {report.days_to_payment !== null ? `${report.days_to_payment} days` : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {report.overdue_days > 0 ? (
                              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                {report.overdue_days} days
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {invoiceReports.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                            No invoice data available for the selected period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'category' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Category Performance Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Service category analysis and comparison</p>
                </div>
                <button
                  onClick={() => exportToCSV(categoryReports, 'category_report')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryReports.map((report, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-br from-white to-gray-50 rounded-lg border-2 border-gray-200 p-6 hover:shadow-xl transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900">{report.category}</h3>
                      <div className="p-2 bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg">
                        <BarChart3 className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Services</span>
                        <span className="font-bold text-gray-900">{report.total_services}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Total Works</span>
                        <span className="font-bold text-gray-900">{report.total_works}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Completed</span>
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          {report.completed_works}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Active Customers</span>
                        <span className="font-bold text-blue-600">{report.active_customers}</span>
                      </div>
                      <div className="pt-3 mt-3 border-t-2 border-gray-300">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-700">Total Revenue</span>
                          <span className="text-xl font-bold text-green-600">
                            ₹{(report.total_revenue / 1000).toFixed(0)}K
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Avg/Work</span>
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{Math.round(report.avg_revenue_per_work).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {categoryReports.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No category data available for the selected period
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'lead' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Lead Conversion Report</h2>
                  <p className="text-sm text-gray-600 mt-1">Lead tracking and conversion analysis</p>
                </div>
                <button
                  onClick={() => exportToCSV(leadReports, 'lead_report')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Converted</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days to Convert</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est. Value</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {leadReports.map((report) => (
                        <tr key={report.lead_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{report.lead_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{report.source}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 text-xs rounded-full font-medium ${
                                report.status === 'converted'
                                  ? 'bg-green-100 text-green-700'
                                  : report.status === 'contacted'
                                  ? 'bg-blue-100 text-blue-700'
                                  : report.status === 'lost'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {report.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(report.created_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {report.converted_date
                              ? new Date(report.converted_date).toLocaleDateString()
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900 font-medium">
                            {report.days_to_convert !== null ? `${report.days_to_convert} days` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                            ₹{report.estimated_value.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{report.assigned_staff}</td>
                        </tr>
                      ))}
                      {leadReports.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                            No lead data available for the selected period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'revenue' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Revenue Trend Analysis</h2>
                  <p className="text-sm text-gray-600 mt-1">Monthly revenue trends and growth analysis</p>
                </div>
                <button
                  onClick={() => exportToCSV(revenueReports, 'revenue_report')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {revenueReports.map((report, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-xl transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900">{report.period}</h3>
                      <div className="flex items-center gap-1">
                        {report.revenue_growth >= 0 ? (
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        )}
                        <span
                          className={`text-sm font-bold ${
                            report.revenue_growth >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {report.revenue_growth >= 0 ? '+' : ''}
                          {report.revenue_growth.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="mb-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                      <p className="text-xs text-gray-600 mb-1">Total Revenue</p>
                      <p className="text-3xl font-bold text-green-600">
                        ₹{(report.total_revenue / 1000).toFixed(0)}K
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Paid Invoices</span>
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          {report.paid_invoices}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Unpaid Invoices</span>
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                          {report.unpaid_invoices}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Partially Paid</span>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                          {report.partially_paid_invoices}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Avg Invoice Value</span>
                        <span className="font-semibold text-gray-900">
                          ₹{Math.round(report.avg_invoice_value).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-200">
                        <span className="text-sm text-gray-600">New Customers</span>
                        <span className="font-bold text-blue-600">{report.new_customers}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {revenueReports.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No revenue data available
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
