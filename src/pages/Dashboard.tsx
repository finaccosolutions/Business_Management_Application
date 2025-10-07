// src/pages/Dashboard.tsx
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
  Clock,
  CalendarClock,
  DollarSign,
  Briefcase,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingDown,
  Calendar,
  Filter,
  X,
  Receipt,
  Wallet,
  CreditCard,
  Target,
} from 'lucide-react';
import BarChart from '../components/charts/BarChart';
import PieChart from '../components/charts/PieChart';
import LineChart from '../components/charts/LineChart';

interface Stats {
  totalLeads: number;
  totalCustomers: number;
  totalWorks: number;
  pendingWorks: number;
  overdueWorks: number;
  completedWorks: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
  pendingRevenue: number;
  totalStaff: number;
  activeStaff: number;
  totalServices: number;
  avgInvoiceValue: number;
  avgRevenuePerCustomer: number;
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
}

type DateFilterPreset = 'today' | 'last7days' | 'last30days' | 'last3months' | 'last6months' | 'lastyear' | 'custom' | 'all';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    totalCustomers: 0,
    totalWorks: 0,
    pendingWorks: 0,
    overdueWorks: 0,
    completedWorks: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    totalStaff: 0,
    activeStaff: 0,
    totalServices: 0,
    avgInvoiceValue: 0,
    avgRevenuePerCustomer: 0,
  });
  const [overdueWorks, setOverdueWorks] = useState<OverdueWork[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [revenueByService, setRevenueByService] = useState<RevenueByService[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Date filter states
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

      let leadsQuery = supabase.from('leads').select('id', { count: 'exact', head: true });
      let customersQuery = supabase.from('customers').select('id', { count: 'exact', head: true });
      let worksQuery = supabase.from('works').select('id', { count: 'exact', head: true });
      let invoicesQuery = supabase.from('invoices').select('id', { count: 'exact', head: true });

      // Apply date filters
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
        invoicesResult,
        paidInvoicesResult,
        unpaidInvoicesResult,
        staffResult,
        activeStaffResult,
        servicesResult,
      ] = await Promise.all([
        leadsQuery,
        customersQuery,
        worksQuery,
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        invoicesQuery,
        (() => {
          let query = supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'paid');
          if (dateRange.start) query = query.gte('invoice_date', dateRange.start);
          if (dateRange.end) query = query.lte('invoice_date', dateRange.end);
          return query;
        })(),
        (() => {
          let query = supabase.from('invoices').select('id, total_amount', { count: 'exact' }).neq('status', 'paid');
          if (dateRange.start) query = query.gte('invoice_date', dateRange.start);
          if (dateRange.end) query = query.lte('invoice_date', dateRange.end);
          return query;
        })(),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('services').select('id', { count: 'exact', head: true }),
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

      setStats({
        totalLeads: leadsResult.count || 0,
        totalCustomers: customersResult.count || 0,
        totalWorks: worksResult.count || 0,
        pendingWorks: pendingWorksResult.count || 0,
        overdueWorks: overdueWorksResult.count || 0,
        completedWorks: completedWorksResult.count || 0,
        totalInvoices: invoicesResult.count || 0,
        paidInvoices: paidInvoicesResult.count || 0,
        unpaidInvoices: unpaidInvoicesResult.count || 0,
        totalRevenue,
        pendingRevenue,
        totalStaff: staffResult.count || 0,
        activeStaff: activeStaffResult.count || 0,
        totalServices: servicesResult.count || 0,
        avgInvoiceValue,
        avgRevenuePerCustomer,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
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
        .select('service_id, services(name), invoices(total_amount, status)')
        .eq('invoices.status', 'paid');

      if (dateRange.start) query = query.gte('created_at', dateRange.start);
      if (dateRange.end) query = query.lte('created_at', dateRange.end);

      const { data } = await query;

      if (data) {
        const serviceRevenue: { [key: string]: number } = {};

        data.forEach((work: any) => {
          if (work.services && work.invoices) {
            const serviceName = work.services.name;
            work.invoices.forEach((invoice: any) => {
              if (invoice.status === 'paid') {
                serviceRevenue[serviceName] = (serviceRevenue[serviceName] || 0) + Number(invoice.total_amount);
              }
            });
          }
        });

        const sortedServices = Object.entries(serviceRevenue)
          .map(([service_name, revenue]) => ({
            service_name,
            revenue,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        setRevenueByService(sortedServices);
      }
    } catch (error) {
      console.error('Error fetching revenue by service:', error);
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

  const statCards = [
    {
      title: 'Leads',
      value: stats.totalLeads,
      icon: Users,
      borderColor: 'border-l-blue-500',
    },
    {
      title: 'Customers',
      value: stats.totalCustomers,
      icon: UserCog,
      borderColor: 'border-l-emerald-500',
    },
    {
      title: 'Staff',
      value: stats.activeStaff,
      icon: Briefcase,
      borderColor: 'border-l-amber-500',
    },
    {
      title: 'Works',
      value: stats.totalWorks,
      icon: ClipboardList,
      borderColor: 'border-l-orange-500',
    },
    {
      title: 'Services',
      value: stats.totalServices,
      icon: Activity,
      borderColor: 'border-l-rose-500',
    },
    {
      title: 'Invoices',
      value: stats.totalInvoices,
      icon: FileText,
      borderColor: 'border-l-cyan-500',
    },
    {
      title: 'Paid',
      value: stats.paidInvoices,
      icon: CheckCircle,
      borderColor: 'border-l-green-500',
    },
    {
      title: 'Unpaid',
      value: stats.unpaidInvoices,
      icon: AlertCircle,
      borderColor: 'border-l-red-500',
    },
  ];

  const revenueCards = [
    {
      title: 'Total Revenue',
      value: `₹${stats.totalRevenue.toLocaleString('en-IN')}`,
      icon: DollarSign,
      borderColor: 'border-l-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Pending Revenue',
      value: `₹${stats.pendingRevenue.toLocaleString('en-IN')}`,
      icon: Wallet,
      borderColor: 'border-l-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Avg Invoice Value',
      value: `₹${Math.round(stats.avgInvoiceValue).toLocaleString('en-IN')}`,
      icon: Receipt,
      borderColor: 'border-l-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Avg Revenue/Customer',
      value: `₹${Math.round(stats.avgRevenuePerCustomer).toLocaleString('en-IN')}`,
      icon: Target,
      borderColor: 'border-l-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const workStatusData = [
    { label: 'Pending', value: stats.pendingWorks, color: '#f59e0b' },
    { label: 'Overdue', value: stats.overdueWorks, color: '#dc2626' },
    { label: 'Completed', value: stats.completedWorks, color: '#059669' },
  ];

  const invoiceStatusData = [
    { label: 'Paid', value: stats.paidInvoices, color: '#10b981' },
    { label: 'Unpaid', value: stats.unpaidInvoices, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-6">
      {/* Compact Header - No Revenue */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 rounded-xl shadow-xl p-6 text-white border border-slate-600">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {companySettings?.company_name || 'Dashboard'}
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              Business performance overview
            </p>
          </div>
        </div>
      </div>

      {/* Date Filter Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <span className="font-semibold text-gray-700">Filter by Date:</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handlePresetChange('all')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => handlePresetChange('today')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'today'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handlePresetChange('last7days')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'last7days'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handlePresetChange('last30days')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'last30days'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => handlePresetChange('last3months')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'last3months'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 3 Months
            </button>
            <button
              onClick={() => handlePresetChange('last6months')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'last6months'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 6 Months
            </button>
            <button
              onClick={() => handlePresetChange('lastyear')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                dateFilterPreset === 'lastyear'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last Year
            </button>
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

      {/* Compact Statistics Grid - 4 per row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`bg-white rounded-lg shadow border-l-4 ${stat.borderColor} p-4 hover:shadow-lg transition-shadow`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{stat.title}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Revenue Overview Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <DollarSign className="w-6 h-6 mr-2 text-green-600" />
          Revenue Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {revenueCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={index}
                className={`${card.bgColor} rounded-lg shadow border-l-4 ${card.borderColor} p-4 hover:shadow-lg transition-shadow`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-6 h-6 text-gray-700" />
                </div>
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">{card.title}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts Section - Revenue Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-cyan-600" />
            Revenue Trend (Last 6 Months)
          </h2>
          <LineChart
            data={monthlyRevenue.map(m => ({ label: m.month, value: m.revenue }))}
            height={240}
            color="#06b6d4"
          />
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <PieChartIcon className="w-5 h-5 mr-2 text-orange-600" />
            Invoice Status
          </h2>
          <PieChart data={invoiceStatusData} size={200} />
        </div>
      </div>

      {/* Top Customers & Revenue by Service */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-blue-600" />
            Top Customers by Revenue
          </h2>
          {topCustomers.length > 0 ? (
            <div className="space-y-3">
              {topCustomers.map((customer, index) => (
                <div key={customer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                    <span className="font-medium text-gray-800">{customer.name}</span>
                  </div>
                  <span className="text-lg font-bold text-green-600">
                    ₹{customer.revenue.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No customer data available for selected period</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-purple-600" />
            Revenue by Service
          </h2>
          {revenueByService.length > 0 ? (
            <div className="space-y-3">
              {revenueByService.map((service, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="font-medium text-gray-800">{service.service_name}</span>
                  <span className="text-lg font-bold text-purple-600">
                    ₹{service.revenue.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No service revenue data available for selected period</p>
          )}
        </div>
      </div>

      {/* Work Distribution */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <BarChart3 className="w-5 h-5 mr-2 text-emerald-600" />
          Work Distribution
        </h2>
        <PieChart data={workStatusData} size={200} />
      </div>

      {/* Overdue Works Alert */}
      {stats.overdueWorks > 0 && (
        <div className="bg-white rounded-xl shadow-md border-2 border-red-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
              Overdue Works - Action Required
            </h2>
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              {stats.overdueWorks} Overdue
            </span>
          </div>

          {overdueWorks.length === 0 ? (
            <p className="text-gray-600 text-sm">Loading overdue works...</p>
          ) : (
            <div className="space-y-2">
              {overdueWorks.map((work) => (
                <div
                  key={work.id}
                  className="p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm">{work.title}</h4>
                      <p className="text-xs text-gray-600 mt-1">{work.customers.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2 py-0.5 bg-red-600 text-white rounded-full text-xs font-bold">
                        {getDaysLate(work.due_date)} days late
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
