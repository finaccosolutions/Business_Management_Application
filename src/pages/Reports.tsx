import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText,
  Users,
  Briefcase,
  DollarSign,
  TrendingUp,
  Calendar,
  Download,
  Package,
  Target,
  BarChart3,
  FileSpreadsheet,
  TrendingDown,
  Building2,
  Scale,
  PieChart as PieChartIcon,
  Receipt,
  Wallet,
  ArrowUpDown,
} from 'lucide-react';

interface ReportCategory {
  id: string;
  name: string;
  icon: any;
  reports: Report[];
}

interface Report {
  id: string;
  name: string;
  description: string;
  icon: any;
  action: () => void;
}

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

interface TrialBalanceEntry {
  account_code: string;
  account_name: string;
  group_name: string;
  debit: number;
  credit: number;
}

interface BalanceSheetEntry {
  category: string;
  accounts: Array<{
    account_name: string;
    amount: number;
  }>;
  total: number;
}

interface ProfitLossEntry {
  category: string;
  accounts: Array<{
    account_name: string;
    amount: number;
  }>;
  total: number;
}

export default function Reports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const [customerReports, setCustomerReports] = useState<CustomerReport[]>([]);
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [staffReports, setStaffReports] = useState<StaffReport[]>([]);
  const [serviceReports, setServiceReports] = useState<ServiceReport[]>([]);
  const [invoiceReports, setInvoiceReports] = useState<InvoiceReport[]>([]);
  const [categoryReports, setCategoryReports] = useState<CategoryReport[]>([]);
  const [leadReports, setLeadReports] = useState<LeadReport[]>([]);
  const [revenueReports, setRevenueReports] = useState<RevenueReport[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceEntry[]>([]);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetEntry[]>([]);
  const [profitLoss, setProfitLoss] = useState<ProfitLossEntry[]>([]);

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (user) {
      setLoading(false);
    }
  }, [user]);

  const fetchCustomerReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoiceReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchLeadReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenueReports = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const fetchTrialBalance = async () => {
    setLoading(true);
    try {
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('*, account_groups(name)')
        .eq('is_active', true)
        .order('account_code');

      if (!accounts) return;

      const { data: transactions } = await supabase
        .from('ledger_transactions')
        .select('account_id, debit, credit')
        .gte('transaction_date', dateRange.start)
        .lte('transaction_date', dateRange.end);

      const balances = new Map<string, { debit: number; credit: number }>();

      transactions?.forEach((txn: any) => {
        const existing = balances.get(txn.account_id) || { debit: 0, credit: 0 };
        existing.debit += Number(txn.debit) || 0;
        existing.credit += Number(txn.credit) || 0;
        balances.set(txn.account_id, existing);
      });

      const trialBalanceData: TrialBalanceEntry[] = accounts.map((account: any) => {
        const balance = balances.get(account.id) || { debit: 0, credit: 0 };
        const openingBalance = Number(account.opening_balance) || 0;

        let debit = balance.debit;
        let credit = balance.credit;

        if (openingBalance > 0) {
          debit += openingBalance;
        } else if (openingBalance < 0) {
          credit += Math.abs(openingBalance);
        }

        return {
          account_code: account.account_code,
          account_name: account.account_name,
          group_name: account.account_groups?.name || 'Uncategorized',
          debit: debit,
          credit: credit,
        };
      });

      setTrialBalance(trialBalanceData);
    } catch (error) {
      console.error('Error fetching trial balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalanceSheet = async () => {
    setLoading(true);
    try {
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('*, account_groups(name, account_type)')
        .eq('is_active', true);

      if (!accounts) return;

      const { data: transactions } = await supabase
        .from('ledger_transactions')
        .select('account_id, debit, credit')
        .lte('transaction_date', dateRange.end);

      const balances = new Map<string, number>();

      accounts.forEach((account: any) => {
        balances.set(account.id, Number(account.opening_balance) || 0);
      });

      transactions?.forEach((txn: any) => {
        const existing = balances.get(txn.account_id) || 0;
        balances.set(txn.account_id, existing + (Number(txn.debit) || 0) - (Number(txn.credit) || 0));
      });

      const assets: BalanceSheetEntry[] = [];
      const liabilities: BalanceSheetEntry[] = [];
      const equity: BalanceSheetEntry[] = [];

      const grouped = new Map<string, Array<{ account_name: string; amount: number }>>();

      accounts.forEach((account: any) => {
        const balance = balances.get(account.id) || 0;
        const groupName = account.account_groups?.name || 'Uncategorized';
        const accountType = account.account_groups?.account_type;

        if (!grouped.has(groupName)) {
          grouped.set(groupName, []);
        }

        grouped.get(groupName)!.push({
          account_name: account.account_name,
          amount: balance,
        });
      });

      grouped.forEach((accounts, category) => {
        const total = accounts.reduce((sum, acc) => sum + acc.amount, 0);
        const entry = { category, accounts, total };

        const accountType = accounts[0]?.account_name;
        if (category.toLowerCase().includes('asset')) {
          assets.push(entry);
        } else if (category.toLowerCase().includes('liability')) {
          liabilities.push(entry);
        } else if (category.toLowerCase().includes('equity') || category.toLowerCase().includes('capital')) {
          equity.push(entry);
        }
      });

      setBalanceSheet([...assets, ...liabilities, ...equity]);
    } catch (error) {
      console.error('Error fetching balance sheet:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfitLoss = async () => {
    setLoading(true);
    try {
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('*, account_groups(name, account_type)')
        .eq('is_active', true);

      if (!accounts) return;

      const { data: transactions } = await supabase
        .from('ledger_transactions')
        .select('account_id, debit, credit')
        .gte('transaction_date', dateRange.start)
        .lte('transaction_date', dateRange.end);

      const balances = new Map<string, number>();

      transactions?.forEach((txn: any) => {
        const existing = balances.get(txn.account_id) || 0;
        balances.set(txn.account_id, existing + (Number(txn.credit) || 0) - (Number(txn.debit) || 0));
      });

      const income: ProfitLossEntry[] = [];
      const expenses: ProfitLossEntry[] = [];

      const grouped = new Map<string, Array<{ account_name: string; amount: number }>>();

      accounts.forEach((account: any) => {
        const balance = balances.get(account.id) || 0;
        const groupName = account.account_groups?.name || 'Uncategorized';
        const accountType = account.account_groups?.account_type;

        if (accountType !== 'income' && accountType !== 'expense') return;

        if (!grouped.has(groupName)) {
          grouped.set(groupName, []);
        }

        grouped.get(groupName)!.push({
          account_name: account.account_name,
          amount: Math.abs(balance),
        });
      });

      grouped.forEach((accounts, category) => {
        const total = accounts.reduce((sum, acc) => sum + acc.amount, 0);
        const entry = { category, accounts, total };

        if (category.toLowerCase().includes('income') || category.toLowerCase().includes('revenue')) {
          income.push(entry);
        } else if (category.toLowerCase().includes('expense') || category.toLowerCase().includes('cost')) {
          expenses.push(entry);
        }
      });

      setProfitLoss([...income, ...expenses]);
    } catch (error) {
      console.error('Error fetching profit & loss:', error);
    } finally {
      setLoading(false);
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

  const reportCategories: ReportCategory[] = [
    {
      id: 'accounting',
      name: 'Accounting Reports',
      icon: Scale,
      reports: [
        {
          id: 'trial_balance',
          name: 'Trial Balance',
          description: 'Summary of all account balances with debit and credit totals',
          icon: ArrowUpDown,
          action: () => {
            setActiveReport('trial_balance');
            fetchTrialBalance();
          },
        },
        {
          id: 'balance_sheet',
          name: 'Balance Sheet',
          description: 'Statement of assets, liabilities, and equity at a point in time',
          icon: Building2,
          action: () => {
            setActiveReport('balance_sheet');
            fetchBalanceSheet();
          },
        },
        {
          id: 'profit_loss',
          name: 'Profit & Loss Statement',
          description: 'Income and expenses for the selected period',
          icon: TrendingUp,
          action: () => {
            setActiveReport('profit_loss');
            fetchProfitLoss();
          },
        },
      ],
    },
    {
      id: 'financial',
      name: 'Financial Reports',
      icon: DollarSign,
      reports: [
        {
          id: 'revenue',
          name: 'Revenue Analysis',
          description: 'Monthly revenue trends and growth analysis',
          icon: TrendingUp,
          action: () => {
            setActiveReport('revenue');
            fetchRevenueReports();
          },
        },
        {
          id: 'invoice',
          name: 'Invoice Report',
          description: 'Detailed invoice tracking and payment analysis',
          icon: Receipt,
          action: () => {
            setActiveReport('invoice');
            fetchInvoiceReports();
          },
        },
      ],
    },
    {
      id: 'operations',
      name: 'Operations Reports',
      icon: Briefcase,
      reports: [
        {
          id: 'work',
          name: 'Work Performance',
          description: 'Comprehensive work tracking and analysis',
          icon: Briefcase,
          action: () => {
            setActiveReport('work');
            fetchWorkReports();
          },
        },
        {
          id: 'service',
          name: 'Service Performance',
          description: 'Service-wise revenue and performance analysis',
          icon: Package,
          action: () => {
            setActiveReport('service');
            fetchServiceReports();
          },
        },
        {
          id: 'category',
          name: 'Category Analysis',
          description: 'Service category analysis and comparison',
          icon: BarChart3,
          action: () => {
            setActiveReport('category');
            fetchCategoryReports();
          },
        },
      ],
    },
    {
      id: 'customer',
      name: 'Customer Reports',
      icon: Users,
      reports: [
        {
          id: 'customer',
          name: 'Customer Performance',
          description: 'Detailed analysis of customer engagement and revenue',
          icon: Users,
          action: () => {
            setActiveReport('customer');
            fetchCustomerReports();
          },
        },
        {
          id: 'lead',
          name: 'Lead Conversion',
          description: 'Lead tracking and conversion analysis',
          icon: Target,
          action: () => {
            setActiveReport('lead');
            fetchLeadReports();
          },
        },
      ],
    },
    {
      id: 'staff',
      name: 'Staff Reports',
      icon: Users,
      reports: [
        {
          id: 'staff',
          name: 'Staff Performance',
          description: 'Individual staff member performance metrics',
          icon: Users,
          action: () => {
            setActiveReport('staff');
            fetchStaffReports();
          },
        },
      ],
    },
  ];

  if (loading && activeReport) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (activeReport) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveReport(null)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Reports
          </button>
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

        {activeReport === 'trial_balance' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Trial Balance</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Period: {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => exportToCSV(trialBalance, 'trial_balance')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {trialBalance.map((entry, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">{entry.account_code}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{entry.account_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{entry.group_name}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                          {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                          {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                      </tr>
                    ))}
                    {trialBalance.length > 0 && (
                      <tr className="bg-gray-100 font-bold">
                        <td colSpan={3} className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          ₹{trialBalance.reduce((sum, e) => sum + e.debit, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          ₹{trialBalance.reduce((sum, e) => sum + e.credit, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {trialBalance.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                          No transactions found for the selected period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeReport === 'balance_sheet' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Balance Sheet</h2>
                <p className="text-sm text-gray-600 mt-1">As on {new Date(dateRange.end).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => exportToCSV(balanceSheet.flatMap(bs => bs.accounts.map(a => ({ category: bs.category, ...a }))), 'balance_sheet')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Assets</h3>
                {balanceSheet
                  .filter(entry => entry.category.toLowerCase().includes('asset'))
                  .map((entry, index) => (
                    <div key={index} className="mb-4">
                      <h4 className="font-semibold text-gray-800 mb-2">{entry.category}</h4>
                      {entry.accounts.map((account, idx) => (
                        <div key={idx} className="flex justify-between py-1 text-sm">
                          <span className="text-gray-600">{account.account_name}</span>
                          <span className="font-medium text-gray-900">
                            ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between py-2 border-t border-gray-200 mt-2">
                        <span className="font-semibold text-gray-800">Total {entry.category}</span>
                        <span className="font-bold text-gray-900">
                          ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Liabilities & Equity</h3>
                {balanceSheet
                  .filter(entry => !entry.category.toLowerCase().includes('asset'))
                  .map((entry, index) => (
                    <div key={index} className="mb-4">
                      <h4 className="font-semibold text-gray-800 mb-2">{entry.category}</h4>
                      {entry.accounts.map((account, idx) => (
                        <div key={idx} className="flex justify-between py-1 text-sm">
                          <span className="text-gray-600">{account.account_name}</span>
                          <span className="font-medium text-gray-900">
                            ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between py-2 border-t border-gray-200 mt-2">
                        <span className="font-semibold text-gray-800">Total {entry.category}</span>
                        <span className="font-bold text-gray-900">
                          ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {balanceSheet.length === 0 && (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">No balance sheet data available</p>
              </div>
            )}
          </div>
        )}

        {activeReport === 'profit_loss' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Period: {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => exportToCSV(profitLoss.flatMap(pl => pl.accounts.map(a => ({ category: pl.category, ...a }))), 'profit_loss')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-green-600 mb-4">Income</h3>
                  {profitLoss
                    .filter(entry => entry.category.toLowerCase().includes('income') || entry.category.toLowerCase().includes('revenue'))
                    .map((entry, index) => (
                      <div key={index} className="mb-4">
                        <h4 className="font-semibold text-gray-800 mb-2">{entry.category}</h4>
                        {entry.accounts.map((account, idx) => (
                          <div key={idx} className="flex justify-between py-1 text-sm">
                            <span className="text-gray-600 ml-4">{account.account_name}</span>
                            <span className="font-medium text-gray-900">
                              ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between py-2 border-t border-gray-200 mt-2">
                          <span className="font-semibold text-gray-800">Total {entry.category}</span>
                          <span className="font-bold text-green-600">
                            ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  <div className="flex justify-between py-3 border-t-2 border-gray-300">
                    <span className="font-bold text-gray-900">Total Income</span>
                    <span className="font-bold text-green-600 text-lg">
                      ₹{profitLoss
                        .filter(e => e.category.toLowerCase().includes('income') || e.category.toLowerCase().includes('revenue'))
                        .reduce((sum, e) => sum + e.total, 0)
                        .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-red-600 mb-4">Expenses</h3>
                  {profitLoss
                    .filter(entry => entry.category.toLowerCase().includes('expense') || entry.category.toLowerCase().includes('cost'))
                    .map((entry, index) => (
                      <div key={index} className="mb-4">
                        <h4 className="font-semibold text-gray-800 mb-2">{entry.category}</h4>
                        {entry.accounts.map((account, idx) => (
                          <div key={idx} className="flex justify-between py-1 text-sm">
                            <span className="text-gray-600 ml-4">{account.account_name}</span>
                            <span className="font-medium text-gray-900">
                              ₹{account.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between py-2 border-t border-gray-200 mt-2">
                          <span className="font-semibold text-gray-800">Total {entry.category}</span>
                          <span className="font-bold text-red-600">
                            ₹{entry.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  <div className="flex justify-between py-3 border-t-2 border-gray-300">
                    <span className="font-bold text-gray-900">Total Expenses</span>
                    <span className="font-bold text-red-600 text-lg">
                      ₹{profitLoss
                        .filter(e => e.category.toLowerCase().includes('expense') || e.category.toLowerCase().includes('cost'))
                        .reduce((sum, e) => sum + e.total, 0)
                        .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-300">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900 text-lg">Net Profit / Loss</span>
                    <span className={`font-bold text-2xl ${
                      (profitLoss
                        .filter(e => e.category.toLowerCase().includes('income') || e.category.toLowerCase().includes('revenue'))
                        .reduce((sum, e) => sum + e.total, 0) -
                      profitLoss
                        .filter(e => e.category.toLowerCase().includes('expense') || e.category.toLowerCase().includes('cost'))
                        .reduce((sum, e) => sum + e.total, 0)) >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      ₹{(profitLoss
                        .filter(e => e.category.toLowerCase().includes('income') || e.category.toLowerCase().includes('revenue'))
                        .reduce((sum, e) => sum + e.total, 0) -
                      profitLoss
                        .filter(e => e.category.toLowerCase().includes('expense') || e.category.toLowerCase().includes('cost'))
                        .reduce((sum, e) => sum + e.total, 0))
                        .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {profitLoss.length === 0 && (
                <div className="text-center py-12">
                  <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No profit & loss data available for the selected period</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeReport === 'customer' && customerReports.length > 0 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Customer Performance Report</h2>
                <p className="text-sm text-gray-600 mt-1">Detailed analysis of customer engagement and revenue</p>
              </div>
              <button
                onClick={() => exportToCSV(customerReports, 'customer_report')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Billed</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
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
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                          ₹{report.total_billed.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600 font-semibold">
                          ₹{report.total_paid.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">
                          ₹{report.total_pending.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Add similar sections for other report types... */}
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
            <p className="text-slate-300 mt-2">Comprehensive reports for data-driven business decisions</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {reportCategories.map((category) => {
          const Icon = category.icon;
          return (
            <div key={category.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{category.name}</h2>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.reports.map((report) => {
                    const ReportIcon = report.icon;
                    return (
                      <button
                        key={report.id}
                        onClick={report.action}
                        className="group text-left p-5 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-600 transition-colors">
                            <ReportIcon className="w-6 h-6 text-blue-600 group-hover:text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-1">
                              {report.name}
                            </h3>
                            <p className="text-sm text-gray-600">{report.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
