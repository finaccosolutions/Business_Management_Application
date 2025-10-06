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
  totalStaff: number;
  activeStaff: number;
  totalServices: number;
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
    totalStaff: 0,
    activeStaff: 0,
    totalServices: 0,
  });
  const [overdueWorks, setOverdueWorks] = useState<OverdueWork[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchOverdueWorks();
      fetchMonthlyRevenue();
      fetchCompanySettings();
    }
  }, [user]);

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
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('works').select('id', { count: 'exact', head: true }),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('works').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase
          .from('works')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
        supabase
          .from('invoices')
          .select('id, total_amount', { count: 'exact' })
          .neq('status', 'paid'),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('services').select('id', { count: 'exact', head: true }),
      ]);

      const paidInvoicesData = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('status', 'paid');

      const totalRevenue =
        paidInvoicesData.data?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;

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
        totalStaff: staffResult.count || 0,
        activeStaff: activeStaffResult.count || 0,
        totalServices: servicesResult.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
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
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

      const { data } = await supabase
        .from('invoices')
        .select('invoice_date, total_amount')
        .eq('status', 'paid')
        .gte('invoice_date', sixMonthsAgo.toISOString().split('T')[0]);

      if (data) {
        const revenueByMonth: { [key: string]: number } = {};

        data.forEach((invoice) => {
          const date = new Date(invoice.invoice_date);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
          revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + invoice.total_amount;
        });

        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
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

  const getDaysLate = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const statCards = [
    {
      title: 'Total Leads',
      value: stats.totalLeads,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      change: '+12%',
      changePositive: true,
    },
    {
      title: 'Total Customers',
      value: stats.totalCustomers,
      icon: UserCog,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
      change: '+8%',
      changePositive: true,
    },
    {
      title: 'Active Staff',
      value: stats.activeStaff,
      icon: Briefcase,
      color: 'from-teal-500 to-teal-600',
      bgColor: 'bg-teal-50',
      textColor: 'text-teal-600',
      change: '0%',
      changePositive: true,
    },
    {
      title: 'Total Works',
      value: stats.totalWorks,
      icon: ClipboardList,
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
      change: '+15%',
      changePositive: true,
    },
    {
      title: 'Total Services',
      value: stats.totalServices,
      icon: Activity,
      color: 'from-pink-500 to-pink-600',
      bgColor: 'bg-pink-50',
      textColor: 'text-pink-600',
      change: '+5%',
      changePositive: true,
    },
    {
      title: 'Total Invoices',
      value: stats.totalInvoices,
      icon: FileText,
      color: 'from-cyan-500 to-cyan-600',
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-600',
      change: '+20%',
      changePositive: true,
    },
  ];

  const workStats = [
    {
      title: 'Pending Works',
      value: stats.pendingWorks,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Overdue Works',
      value: stats.overdueWorks,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Completed Works',
      value: stats.completedWorks,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
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
    { label: 'Pending', value: stats.pendingWorks, color: '#eab308' },
    { label: 'Overdue', value: stats.overdueWorks, color: '#ef4444' },
    { label: 'Completed', value: stats.completedWorks, color: '#22c55e' },
  ];

  const invoiceStatusData = [
    { label: 'Paid', value: stats.paidInvoices, color: '#22c55e' },
    { label: 'Unpaid', value: stats.unpaidInvoices, color: '#ef4444' },
  ];

  const businessMetrics = [
    { label: 'Leads', value: stats.totalLeads, color: 'bg-blue-500' },
    { label: 'Customers', value: stats.totalCustomers, color: 'bg-green-500' },
    { label: 'Staff', value: stats.activeStaff, color: 'bg-teal-500' },
    { label: 'Services', value: stats.totalServices, color: 'bg-pink-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 rounded-2xl shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              {companySettings?.company_name || 'Dashboard'}
            </h1>
            <p className="text-blue-100 text-lg">
              Welcome back! Here's a complete overview of your business performance.
            </p>
          </div>
          <div className="hidden md:block">
            <div className="text-right">
              <p className="text-blue-100 text-sm">Total Revenue</p>
              <p className="text-4xl font-bold mt-1">
                ₹{stats.totalRevenue.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl shadow-md border border-gray-200 p-6 transform transition-all duration-200 hover:shadow-xl hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`p-3 rounded-xl ${stat.bgColor} transform transition-transform hover:scale-110`}
                >
                  <Icon className={`w-7 h-7 ${stat.textColor}`} />
                </div>
                <div className={`flex items-center gap-1 text-sm font-semibold ${
                  stat.changePositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.changePositive ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {stat.change}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <ClipboardList className="w-6 h-6 mr-2 text-blue-600" />
            Work Status
          </h2>
          <div className="space-y-4">
            {workStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg ${stat.bgColor} transform transition-all duration-200 hover:scale-[1.02]`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    <span className="font-medium text-gray-900">{stat.title}</span>
                  </div>
                  <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="w-6 h-6 mr-2 text-green-600" />
            Financial Overview
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-700 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Revenue
              </p>
              <p className="text-3xl font-bold text-green-900 mt-2">
                ₹{stats.totalRevenue.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-medium text-blue-700">Paid Invoices</p>
                <p className="text-2xl font-bold text-blue-900 mt-2">{stats.paidInvoices}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-red-700">Unpaid</p>
                <p className="text-2xl font-bold text-red-900 mt-2">{stats.unpaidInvoices}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Activity className="w-6 h-6 mr-2 text-pink-600" />
            Quick Stats
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Conversion Rate</span>
              <span className="text-lg font-bold text-gray-900">
                {stats.totalLeads > 0 ? ((stats.totalCustomers / stats.totalLeads) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Avg Revenue/Customer</span>
              <span className="text-lg font-bold text-gray-900">
                ₹{stats.totalCustomers > 0 ? Math.round(stats.totalRevenue / stats.totalCustomers).toLocaleString('en-IN') : 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Works/Customer</span>
              <span className="text-lg font-bold text-gray-900">
                {stats.totalCustomers > 0 ? (stats.totalWorks / stats.totalCustomers).toFixed(1) : 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
            Business Metrics
          </h2>
          <BarChart data={businessMetrics} height={250} />
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <PieChartIcon className="w-6 h-6 mr-2 text-green-600" />
            Work Distribution
          </h2>
          <PieChart data={workStatusData} size={200} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <TrendingUp className="w-6 h-6 mr-2 text-cyan-600" />
            Revenue Trend (Last 6 Months)
          </h2>
          <LineChart
            data={monthlyRevenue.map(m => ({ label: m.month, value: m.revenue }))}
            height={250}
            color="#06b6d4"
          />
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <FileText className="w-6 h-6 mr-2 text-orange-600" />
            Invoice Status
          </h2>
          <PieChart data={invoiceStatusData} size={200} />
        </div>
      </div>

      {stats.overdueWorks > 0 && (
        <div className="bg-white rounded-xl shadow-md border-2 border-red-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <AlertCircle className="w-6 h-6 mr-2 text-red-600" />
              Overdue Works - Action Required
            </h2>
            <span className="px-4 py-2 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              {stats.overdueWorks} Overdue
            </span>
          </div>

          {overdueWorks.length === 0 ? (
            <p className="text-gray-600 text-sm">Loading overdue works...</p>
          ) : (
            <div className="space-y-3">
              {overdueWorks.map((work) => (
                <div
                  key={work.id}
                  className="p-4 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-2">
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
                      <span className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold">
                        {getDaysLate(work.due_date)} days late
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          work.priority === 'urgent'
                            ? 'bg-red-100 text-red-700'
                            : work.priority === 'high'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {work.priority}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center text-xs text-gray-500">
                    <CalendarClock className="w-3 h-3 mr-1" />
                    Due: {new Date(work.due_date).toLocaleDateString()}
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
