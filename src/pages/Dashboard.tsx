import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  UserCog,
  ClipboardList,
  FileText,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Briefcase,
  Activity,
  BarChart3,
  TrendingDown,
  Calendar,
  Filter,
  X,
  Receipt,
  Wallet,
  Target,
  Clock,
  Package,
  UserCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import BarChart from '../components/charts/BarChart';
import PieChart from '../components/charts/PieChart';
import LineChart from '../components/charts/LineChart';

interface Stats {
  totalLeads: number;
  convertedLeads: number;
  totalCustomers: number;
  totalWorks: number;
  pendingWorks: number;
  overdueWorks: number;
  completedWorks: number;
  inProgressWorks: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  partiallyPaidInvoices: number;
  totalRevenue: number;
  pendingRevenue: number;
  totalStaff: number;
  activeStaff: number;
  totalServices: number;
  activeServices: number;
  avgInvoiceValue: number;
  avgRevenuePerCustomer: number;
  monthOverMonthGrowth: number;
  totalTasksCompleted: number;
}

interface OverdueWork {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  customers: { name: string };
  staff_members: { name: string } | null;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface CompanySettings {
  company_name: string;
}

interface TopCustomer {
  id: string;
  name: string;
  revenue: number;
}

interface RevenueByService {
  service_name: string;
  revenue: number;
  count: number;
}

interface StaffPerformance {
  name: string;
  completed: number;
  pending: number;
}

interface CategoryData {
  category: string;
  count: number;
  revenue: number;
}

type DateFilterPreset = 'today' | 'last7days' | 'last30days' | 'last3months' | 'last6months' | 'lastyear' | 'custom' | 'all';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    convertedLeads: 0,
    totalCustomers: 0,
    totalWorks: 0,
    pendingWorks: 0,
    overdueWorks: 0,
    completedWorks: 0,
    inProgressWorks: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    partiallyPaidInvoices: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    totalStaff: 0,
    activeStaff: 0,
    totalServices: 0,
    activeServices: 0,
    avgInvoiceValue: 0,
    avgRevenuePerCustomer: 0,
    monthOverMonthGrowth: 0,
    totalTasksCompleted: 0,
  });
  const [overdueWorks, setOverdueWorks] = useState<OverdueWork[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [revenueByService, setRevenueByService] = useState<RevenueByService[]>([]);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [dateFilterPreset, setDateFilterPreset] = useState<DateFilterPreset>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user, dateFilterPreset, startDate, endDate]);

  const getDateRange = (): { start: string | null; end: string | null } => {
    const today = new Date();
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    let start: Date | null = null;
    const end = endOfToday;

    switch (dateFilterPreset) {
      case 'today':
        start = new Date(today);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last7days':
        start = new Date(today);
        start.setDate(start.getDate() - 7);
        break;
      case 'last30days':
        start = new Date(today);
        start.setDate(start.getDate() - 30);
        break;
      case 'last3months':
        start = new Date(today);
        start.setMonth(start.getMonth() - 3);
        break;
      case 'last6months':
        start = new Date(today);
        start.setMonth(start.getMonth() - 6);
        break;
      case 'lastyear':
        start = new Date(today);
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'custom':
        return {
          start: startDate || null,
          end: endDate || null,
        };
      case 'all':
        return { start: null, end: null };
      default:
        return { start: null, end: null };
    }

    return {
      start: start ? start.toISOString().split('T')[0] : null,
      end: end.toISOString().split('T')[0],
    };
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchOverdueWorks(),
        fetchMonthlyRevenue(),
        fetchCompanySettings(),
        fetchTopCustomers(),
        fetchRevenueByService(),
        fetchStaffPerformance(),
        fetchCategoryData(),
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('user_id', user!.id)
        .maybeSingle();

      setCompanySettings(data);
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const dateRange = getDateRange();

      let leadsQuery = supabase.from('leads').select('id, status', { count: 'exact' });
      let customersQuery = supabase.from('customers').select('id', { count: 'exact', head: true });
      let worksQuery = supabase.from('works').select('id', { count: 'exact', head: true });
      let invoicesQuery = supabase.from('invoices').select('id', { count: 'exact', head: true });

      if (dateRange.start) {
        leadsQuery = leadsQuery.gte('created_at', dateRange.start);
        customersQuery = customersQuery.gte('created_at', dateRange.start);
        worksQuery = worksQuery.gte('created_at', dateRange.start);
        invoicesQuery = invoicesQuery.gte('invoice_date', dateRange.start);
      }
      if (dateRange.end) {
        leadsQuery = leadsQuery.lte('created_at', dateRange.end);
        customersQuery = customersQuery.lte('created_at', dateRange.end);
        worksQuery = worksQuery.lte('created_at', dateRange.end);
        invoicesQuery = invoicesQuery.lte('invoice_date', dateRange.end);
      }

      const [
        leadsResult,
        customersResult,
        worksResult,
        pendingWorksResult,
        overdueWorksResult,
        completedWorksResult,
        inProgressWorksResult,
        invoicesResult,
        paidInvoicesResult,
        unpaidInvoicesResult,
        partiallyPaidInvoicesResult,
        staffResult,
        activeStaffResult,
        servicesResult,
        activeServicesResult,
        tasksCompletedResult,
      ] = await Promise.all([
        leadsQuery,
        customersQuery,
        worksQuery,
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
        invoicesQuery,
        (() => {
          let query = supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'paid');
          if (dateRange.start) query = query.gte('invoice_date', dateRange.start);
          if (dateRange.end) query = query.lte('invoice_date', dateRange.end);
          return query;
        })(),
        (() => {
          let query = supabase.from('invoices').select('id, total_amount', { count: 'exact' }).eq('status', 'unpaid');
          if (dateRange.start) query = query.gte('invoice_date', dateRange.start);
          if (dateRange.end) query = query.lte('invoice_date', dateRange.end);
          return query;
        })(),
        (() => {
          let query = supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'partially_paid');
          if (dateRange.start) query = query.gte('invoice_date', dateRange.start);
          if (dateRange.end) query = query.lte('invoice_date', dateRange.end);
          return query;
        })(),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('services').select('id', { count: 'exact', head: true }),
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('work_tasks').select('id', { count: 'exact', head: true }).eq('is_completed', true),
      ]);

      let paidInvoicesQuery = supabase
        .from('invoices')
        .select('total_amount')
        .eq('status', 'paid');

      if (dateRange.start) paidInvoicesQuery = paidInvoicesQuery.gte('invoice_date', dateRange.start);
      if (dateRange.end) paidInvoicesQuery = paidInvoicesQuery.lte('invoice_date', dateRange.end);

      const paidInvoicesData = await paidInvoicesQuery;

      const totalRevenue =
        paidInvoicesData.data?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;

      const pendingRevenue =
        unpaidInvoicesResult.data?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;

      const avgInvoiceValue = paidInvoicesResult.count && paidInvoicesResult.count > 0
        ? totalRevenue / paidInvoicesResult.count
        : 0;

      const avgRevenuePerCustomer = customersResult.count && customersResult.count > 0
        ? totalRevenue / customersResult.count
        : 0;

      const convertedLeads = leadsResult.data?.filter(lead => lead.status === 'converted').length || 0;

      const lastMonthRevenue = await calculateLastMonthRevenue();
      const currentMonthRevenue = await calculateCurrentMonthRevenue();
      const monthOverMonthGrowth = lastMonthRevenue > 0
        ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

      setStats({
        totalLeads: leadsResult.count || 0,
        convertedLeads,
        totalCustomers: customersResult.count || 0,
        totalWorks: worksResult.count || 0,
        pendingWorks: pendingWorksResult.count || 0,
        overdueWorks: overdueWorksResult.count || 0,
        completedWorks: completedWorksResult.count || 0,
        inProgressWorks: inProgressWorksResult.count || 0,
        totalInvoices: invoicesResult.count || 0,
        paidInvoices: paidInvoicesResult.count || 0,
        unpaidInvoices: unpaidInvoicesResult.count || 0,
        partiallyPaidInvoices: partiallyPaidInvoicesResult.count || 0,
        totalRevenue,
        pendingRevenue,
        totalStaff: staffResult.count || 0,
        activeStaff: activeStaffResult.count || 0,
        totalServices: servicesResult.count || 0,
        activeServices: activeServicesResult.count || 0,
        avgInvoiceValue,
        avgRevenuePerCustomer,
        monthOverMonthGrowth,
        totalTasksCompleted: tasksCompletedResult.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const calculateLastMonthRevenue = async () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const startOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const endOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

    const { data } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('status', 'paid')
      .gte('invoice_date', startOfLastMonth.toISOString().split('T')[0])
      .lte('invoice_date', endOfLastMonth.toISOString().split('T')[0]);

    return data?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
  };

  const calculateCurrentMonthRevenue = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('status', 'paid')
      .gte('invoice_date', startOfMonth.toISOString().split('T')[0]);

    return data?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
  };

  const fetchOverdueWorks = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('works')
        .select('id, title, due_date, priority, customers(name), staff_members(name)')
        .lt('due_date', today)
        .neq('status', 'completed')
        .order('due_date', { ascending: true })
        .limit(10);

      if (error) throw error;
      setOverdueWorks(data || []);
    } catch (error) {
      console.error('Error fetching overdue works:', error);
    }
  };

  const fetchMonthlyRevenue = async () => {
    try {
      const dateRange = getDateRange();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

      let query = supabase
        .from('invoices')
        .select('invoice_date, total_amount')
        .eq('status', 'paid')
        .gte('invoice_date', sixMonthsAgo.toISOString().split('T')[0]);

      if (dateRange.start && dateRange.start > sixMonthsAgo.toISOString().split('T')[0]) {
        query = query.gte('invoice_date', dateRange.start);
      }
      if (dateRange.end) {
        query = query.lte('invoice_date', dateRange.end);
      }

      const { data } = await query;

      if (data) {
        const revenueByMonth: { [key: string]: number } = {};

        data.forEach((invoice) => {
          const date = new Date(invoice.invoice_date);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + invoice.total_amount;
        });

        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          last6Months.push({
            month: monthKey,
            revenue: revenueByMonth[monthKey] || 0,
          });
        }

        setMonthlyRevenue(last6Months);
      }
    } catch (error) {
      console.error('Error fetching monthly revenue:', error);
    }
  };

  const fetchTopCustomers = async () => {
    try {
      const dateRange = getDateRange();

      let query = supabase
        .from('invoices')
        .select('customer_id, total_amount, customers(id, name)')
        .eq('status', 'paid');

      if (dateRange.start) query = query.gte('invoice_date', dateRange.start);
      if (dateRange.end) query = query.lte('invoice_date', dateRange.end);

      const { data } = await query;

      if (data) {
        const customerRevenue: { [key: string]: { name: string; revenue: number } } = {};

        data.forEach((invoice: any) => {
          if (invoice.customers) {
            const customerId = invoice.customers.id;
            if (!customerRevenue[customerId]) {
              customerRevenue[customerId] = {
                name: invoice.customers.name,
                revenue: 0,
              };
            }
            customerRevenue[customerId].revenue += Number(invoice.total_amount);
          }
        });

        const sortedCustomers = Object.entries(customerRevenue)
          .map(([id, data]) => ({
            id,
            name: data.name,
            revenue: data.revenue,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        setTopCustomers(sortedCustomers);
      }
    } catch (error) {
      console.error('Error fetching top customers:', error);
    }
  };

  const fetchRevenueByService = async () => {
    try {
      const dateRange = getDateRange();

      let query = supabase
        .from('works')
        .select('service_id, services(name), invoices(total_amount, status)');

      if (dateRange.start) query = query.gte('created_at', dateRange.start);
      if (dateRange.end) query = query.lte('created_at', dateRange.end);

      const { data } = await query;

      if (data) {
        const serviceRevenue: { [key: string]: { revenue: number; count: number } } = {};

        data.forEach((work: any) => {
          if (work.services && work.invoices) {
            const serviceName = work.services.name;
            if (!serviceRevenue[serviceName]) {
              serviceRevenue[serviceName] = { revenue: 0, count: 0 };
            }
            work.invoices.forEach((invoice: any) => {
              if (invoice.status === 'paid') {
                serviceRevenue[serviceName].revenue += Number(invoice.total_amount);
                serviceRevenue[serviceName].count += 1;
              }
            });
          }
        });

        const sortedServices = Object.entries(serviceRevenue)
          .map(([service_name, data]) => ({
            service_name,
            revenue: data.revenue,
            count: data.count,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        setRevenueByService(sortedServices);
      }
    } catch (error) {
      console.error('Error fetching revenue by service:', error);
    }
  };

  const fetchStaffPerformance = async () => {
    try {
      const { data } = await supabase
        .from('work_assignments')
        .select('staff_member_id, staff_members(name), works(status)');

      if (data) {
        const staffMap: { [key: string]: { name: string; completed: number; pending: number } } = {};

        data.forEach((assignment: any) => {
          if (assignment.staff_members) {
            const staffId = assignment.staff_member_id;
            if (!staffMap[staffId]) {
              staffMap[staffId] = { name: assignment.staff_members.name, completed: 0, pending: 0 };
            }
            if (assignment.works?.status === 'completed') {
              staffMap[staffId].completed += 1;
            } else {
              staffMap[staffId].pending += 1;
            }
          }
        });

        const performance = Object.values(staffMap)
          .sort((a, b) => b.completed - a.completed)
          .slice(0, 5);

        setStaffPerformance(performance);
      }
    } catch (error) {
      console.error('Error fetching staff performance:', error);
    }
  };

  const fetchCategoryData = async () => {
    try {
      const { data } = await supabase
        .from('services')
        .select('category, id, works(id, invoices(total_amount, status))');

      if (data) {
        const categoryMap: { [key: string]: { count: number; revenue: number } } = {};

        data.forEach((service: any) => {
          const category = service.category || 'Uncategorized';
          if (!categoryMap[category]) {
            categoryMap[category] = { count: 0, revenue: 0 };
          }
          categoryMap[category].count += 1;

          if (service.works) {
            service.works.forEach((work: any) => {
              if (work.invoices) {
                work.invoices.forEach((invoice: any) => {
                  if (invoice.status === 'paid') {
                    categoryMap[category].revenue += Number(invoice.total_amount);
                  }
                });
              }
            });
          }
        });

        const categories = Object.entries(categoryMap)
          .map(([category, data]) => ({
            category,
            count: data.count,
            revenue: data.revenue,
          }))
          .sort((a, b) => b.revenue - a.revenue);

        setCategoryData(categories);
      }
    } catch (error) {
      console.error('Error fetching category data:', error);
    }
  };

  const handlePresetChange = (preset: DateFilterPreset) => {
    setDateFilterPreset(preset);
    if (preset === 'custom') {
      setShowCustomDatePicker(true);
    } else {
      setShowCustomDatePicker(false);
    }
  };

  const clearFilters = () => {
    setDateFilterPreset('all');
    setStartDate('');
    setEndDate('');
    setShowCustomDatePicker(false);
  };

  const getDaysLate = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const workStatusData = [
    { label: 'Pending', value: stats.pendingWorks, color: '#f59e0b' },
    { label: 'In Progress', value: stats.inProgressWorks, color: '#3b82f6' },
    { label: 'Overdue', value: stats.overdueWorks, color: '#dc2626' },
    { label: 'Completed', value: stats.completedWorks, color: '#059669' },
  ];

  const invoiceStatusData = [
    { label: 'Paid', value: stats.paidInvoices, color: '#10b981' },
    { label: 'Partially Paid', value: stats.partiallyPaidInvoices, color: '#f59e0b' },
    { label: 'Unpaid', value: stats.unpaidInvoices, color: '#ef4444' },
  ];

  const leadConversionRate = stats.totalLeads > 0
    ? ((stats.convertedLeads / stats.totalLeads) * 100).toFixed(1)
    : '0';

  const workCompletionRate = stats.totalWorks > 0
    ? ((stats.completedWorks / stats.totalWorks) * 100).toFixed(1)
    : '0';

  const invoiceCollectionRate = stats.totalInvoices > 0
    ? ((stats.paidInvoices / stats.totalInvoices) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-600 rounded-xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              {companySettings?.company_name || 'Business Dashboard'}
            </h1>
            <p className="text-blue-100 text-lg">
              Comprehensive business analytics and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.totalCustomers}</div>
              <div className="text-blue-100 text-sm">Total Customers</div>
            </div>
            <div className="h-12 w-px bg-blue-400"></div>
            <div className="text-center">
              <div className="text-3xl font-bold">₹{(stats.totalRevenue / 1000).toFixed(0)}K</div>
              <div className="text-blue-100 text-sm">Total Revenue</div>
            </div>
            <div className="h-12 w-px bg-blue-400"></div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-3xl font-bold">
                {stats.monthOverMonthGrowth >= 0 ? (
                  <ArrowUpRight className="w-6 h-6 text-green-300" />
                ) : (
                  <ArrowDownRight className="w-6 h-6 text-red-300" />
                )}
                {Math.abs(stats.monthOverMonthGrowth).toFixed(1)}%
              </div>
              <div className="text-blue-100 text-sm">Monthly Growth</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <span className="font-semibold text-gray-700">Date Filter:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'last7days', label: 'Last 7 Days' },
              { id: 'last30days', label: 'Last 30 Days' },
              { id: 'last3months', label: 'Last 3 Months' },
              { id: 'last6months', label: 'Last 6 Months' },
              { id: 'lastyear', label: 'Last Year' },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id as DateFilterPreset)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  dateFilterPreset === preset.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => handlePresetChange('custom')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1 ${
                dateFilterPreset === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Custom
            </button>

            {dateFilterPreset !== 'all' && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-sm rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>
        </div>

        {showCustomDatePicker && (
          <div className="mt-4 flex items-center gap-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <Users className="w-10 h-10 opacity-80" />
            <div className="text-right">
              <div className="text-3xl font-bold">{stats.totalLeads}</div>
              <div className="text-emerald-100 text-sm">Total Leads</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-emerald-400">
            <span className="text-sm">Conversion Rate</span>
            <span className="font-bold">{leadConversionRate}%</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <UserCog className="w-10 h-10 opacity-80" />
            <div className="text-right">
              <div className="text-3xl font-bold">{stats.totalCustomers}</div>
              <div className="text-blue-100 text-sm">Active Customers</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-blue-400">
            <span className="text-sm">Avg Revenue</span>
            <span className="font-bold">₹{Math.round(stats.avgRevenuePerCustomer).toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <ClipboardList className="w-10 h-10 opacity-80" />
            <div className="text-right">
              <div className="text-3xl font-bold">{stats.totalWorks}</div>
              <div className="text-amber-100 text-sm">Total Works</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-amber-400">
            <span className="text-sm">Completion Rate</span>
            <span className="font-bold">{workCompletionRate}%</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="w-10 h-10 opacity-80" />
            <div className="text-right">
              <div className="text-3xl font-bold">₹{(stats.totalRevenue / 1000).toFixed(0)}K</div>
              <div className="text-rose-100 text-sm">Total Revenue</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-rose-400">
            <span className="text-sm">Collection Rate</span>
            <span className="font-bold">{invoiceCollectionRate}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow border-l-4 border-l-yellow-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Pending Works</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pendingWorks}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-blue-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">In Progress</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.inProgressWorks}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-red-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Overdue Works</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.overdueWorks}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-green-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Completed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.completedWorks}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-cyan-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalInvoices}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-emerald-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Paid Invoices</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.paidInvoices}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-orange-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <Wallet className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Partially Paid</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.partiallyPaidInvoices}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-red-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Unpaid Invoices</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.unpaidInvoices}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-blue-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <Briefcase className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Total Staff</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalStaff}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-green-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <UserCheck className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Active Staff</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.activeStaff}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-rose-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Total Services</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalServices}</p>
        </div>

        <div className="bg-white rounded-lg shadow border-l-4 border-l-green-500 p-4">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-xs font-medium text-gray-600 uppercase">Active Services</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.activeServices}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow border-l-4 border-l-green-600 p-5">
          <div className="flex items-center justify-between mb-2">
            <Receipt className="w-7 h-7 text-green-700" />
          </div>
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Avg Invoice Value</p>
          <p className="text-2xl font-bold text-green-900 mt-1">
            ₹{Math.round(stats.avgInvoiceValue).toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow border-l-4 border-l-amber-600 p-5">
          <div className="flex items-center justify-between mb-2">
            <Wallet className="w-7 h-7 text-amber-700" />
          </div>
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Pending Revenue</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">
            ₹{stats.pendingRevenue.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow border-l-4 border-l-blue-600 p-5">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-7 h-7 text-blue-700" />
          </div>
          <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Avg Revenue/Customer</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            ₹{Math.round(stats.avgRevenuePerCustomer).toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg shadow border-l-4 border-l-cyan-600 p-5">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-7 h-7 text-cyan-700" />
          </div>
          <p className="text-xs font-medium text-cyan-700 uppercase tracking-wide">Tasks Completed</p>
          <p className="text-2xl font-bold text-cyan-900 mt-1">{stats.totalTasksCompleted}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-cyan-600" />
            Revenue Trend (Last 6 Months)
          </h2>
          <LineChart
            data={monthlyRevenue.map(m => ({ label: m.month, value: m.revenue }))}
            height={260}
            color="#06b6d4"
          />
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-emerald-600" />
            Work Status Distribution
          </h2>
          <PieChart data={workStatusData} size={220} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-orange-600" />
            Invoice Status
          </h2>
          <PieChart data={invoiceStatusData} size={220} />
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-blue-600" />
            Top 5 Customers by Revenue
          </h2>
          {topCustomers.length > 0 ? (
            <div className="space-y-3">
              {topCustomers.map((customer, index) => (
                <div key={customer.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-800">{customer.name}</span>
                  </div>
                  <span className="text-lg font-bold text-green-600">
                    ₹{customer.revenue.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">No customer data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-rose-600" />
            Top 5 Services by Revenue
          </h2>
          {revenueByService.length > 0 ? (
            <div className="space-y-3">
              {revenueByService.map((service, index) => (
                <div key={index} className="p-4 bg-gradient-to-r from-rose-50 to-pink-50 rounded-lg border border-rose-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">{service.service_name}</span>
                    <span className="text-lg font-bold text-rose-600">
                      ₹{service.revenue.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {service.count} orders completed
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">No service revenue data available</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <UserCheck className="w-5 h-5 mr-2 text-emerald-600" />
            Top 5 Staff Performance
          </h2>
          {staffPerformance.length > 0 ? (
            <div className="space-y-3">
              {staffPerformance.map((staff, index) => (
                <div key={index} className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border border-emerald-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">{staff.name}</span>
                    <span className="text-lg font-bold text-emerald-600">
                      {staff.completed} completed
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">{staff.pending} pending</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-emerald-600 h-2 rounded-full"
                        style={{
                          width: `${
                            (staff.completed / (staff.completed + staff.pending)) * 100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">No staff performance data available</p>
          )}
        </div>
      </div>

      {categoryData.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <Package className="w-5 h-5 mr-2 text-violet-600" />
            Service Categories Performance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryData.map((cat, index) => (
              <div
                key={index}
                className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 rounded-lg border border-violet-200"
              >
                <div className="font-semibold text-gray-900 mb-2">{cat.category}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{cat.count} services</span>
                  <span className="font-bold text-violet-600">
                    ₹{cat.revenue.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.overdueWorks > 0 && (
        <div className="bg-white rounded-xl shadow-md border-2 border-red-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
              Overdue Works - Action Required
            </h2>
            <span className="px-4 py-2 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              {stats.overdueWorks} Overdue
            </span>
          </div>

          {overdueWorks.length === 0 ? (
            <p className="text-gray-600 text-sm">Loading overdue works...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {overdueWorks.map((work) => (
                <div
                  key={work.id}
                  className="p-4 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{work.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{work.customers.name}</p>
                      {work.staff_members && (
                        <p className="text-xs text-gray-500 mt-1">
                          Assigned to: {work.staff_members.name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2 py-1 bg-red-600 text-white rounded-full text-xs font-bold">
                        {getDaysLate(work.due_date)} days late
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        work.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        work.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {work.priority}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
