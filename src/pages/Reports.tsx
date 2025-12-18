import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  Briefcase,
  DollarSign,
  TrendingUp,
  Calendar,
  Package,
  Target,
  BarChart3,
  Building2,
  Scale,
  Receipt,
  Wallet,
  ArrowUpDown,
  LayoutDashboard
} from 'lucide-react';
import TrialBalanceReport from '../components/reports/TrialBalanceReport';
import BalanceSheetReport from '../components/reports/BalanceSheetReport';
import ProfitLossReport from '../components/reports/ProfitLossReport';
import ReceivablesReport from '../components/reports/ReceivablesReport';
// ReportFilters removed

// New Modular Components
import CustomerPerformanceReport from '../components/reports/CustomerPerformanceReport';
import WorkPerformanceReport from '../components/reports/WorkPerformanceReport';
import StaffPerformanceReport from '../components/reports/StaffPerformanceReport';
import ServicePerformanceReport from '../components/reports/ServicePerformanceReport';
import InvoiceReportComponent from '../components/reports/InvoiceReport';
import LeadConversionReport from '../components/reports/LeadConversionReport';
import RevenueAnalysisReport from '../components/reports/RevenueAnalysisReport';
import CategoryAnalysisReport from '../components/reports/CategoryAnalysisReport';
// exportUtils removed

interface ReportCategory {
  id: string;
  name: string;
  icon: any; // Lucide Icon
  color: string;
  reports: Report[];
}

interface Report {
  id: string;
  name: string;
  description: string;
  icon: any;
  action: () => void;
}

// ... Interfaces keep existing ...
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
  account_id: string;
  account_code: string;
  account_name: string;
  group_name: string;
  debit: number;
  credit: number;
}

interface BalanceSheetEntry {
  category: string;
  accounts: Array<{
    account_id: string;
    account_name: string;
    amount: number;
  }>;
  total: number;
  type: 'asset' | 'liability' | 'equity';
}

interface ProfitLossEntry {
  category: string;
  accounts: Array<{
    account_id: string;
    account_name: string;
    amount: number;
  }>;
  total: number;
  type: 'income' | 'expense';
}

interface ReportsProps {
  onNavigate?: (page: string) => void;
}

export default function Reports({ onNavigate }: ReportsProps = {}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

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
    // Default to Jan 1st of current year for better data visibility
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
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
        const { data: works } = await supabase
          .from('works')
          .select('status, due_date, actual_hours, created_at, completion_date')
          .eq('assigned_to', member.id)
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);

        const totalWorks = works?.length || 0;
        const completedWorks = works?.filter(w => w.status === 'completed').length || 0;
        const pendingWorks = works?.filter(w =>
          w.status === 'pending' || w.status === 'in_progress'
        ).length || 0;
        const overdueWorks = works?.filter(w => {
          if (w.due_date && w.status !== 'completed') {
            return new Date(w.due_date) < today;
          }
          return false;
        }).length || 0;

        const totalHours = works?.reduce((sum, w) => sum + (w.actual_hours || 0), 0) || 0;

        const completedAssignments = works?.filter(w =>
          w.status === 'completed' && w.created_at && w.completion_date
        ) || [];

        let avgCompletionTime = 0;
        if (completedAssignments.length > 0) {
          const totalDays = completedAssignments.reduce((sum, w) => {
            if (!w.completion_date) return sum;
            const start = new Date(w.created_at);
            const end = new Date(w.completion_date);
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

        // Check for new customers in this period
        const { count: customersCount } = await supabase
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
          total_customers: customersCount || 0,
          new_customers: customersCount || 0,
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

      const trialBalanceData: TrialBalanceEntry[] = accounts
        .map((account: any) => {
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
            account_id: account.id,
            account_code: account.account_code,
            account_name: account.account_name,
            group_name: account.account_groups?.name || 'Uncategorized',
            debit: debit,
            credit: credit,
          };
        })
        .filter(entry => entry.debit > 0 || entry.credit > 0);

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
        const openingBalance = Number(account.opening_balance) || 0;
        balances.set(account.id, openingBalance);
      });

      transactions?.forEach((txn: any) => {
        const existing = balances.get(txn.account_id) || 0;
        const debit = Number(txn.debit) || 0;
        const credit = Number(txn.credit) || 0;
        balances.set(txn.account_id, existing + debit - credit);
      });

      // Calculate profit/loss for the period
      const { data: plTransactions } = await supabase
        .from('ledger_transactions')
        .select('account_id, debit, credit')
        .gte('transaction_date', dateRange.start)
        .lte('transaction_date', dateRange.end);

      let totalIncome = 0;
      let totalExpenses = 0;

      accounts.forEach((account: any) => {
        const accountType = account.account_groups?.account_type;
        if (accountType === 'income' || accountType === 'expense') {
          const plTxns = plTransactions?.filter((t: any) => t.account_id === account.id) || [];
          const txnBalance = plTxns.reduce((sum: number, txn: any) =>
            sum + (Number(txn.credit) || 0) - (Number(txn.debit) || 0), 0
          );

          if (accountType === 'income') {
            totalIncome += txnBalance;
          } else {
            totalExpenses += Math.abs(txnBalance);
          }
        }
      });

      const netProfit = totalIncome - totalExpenses;

      const assets: BalanceSheetEntry[] = [];
      const liabilities: BalanceSheetEntry[] = [];
      const equity: BalanceSheetEntry[] = [];

      const grouped = new Map<string, Array<{ account_id: string; account_name: string; amount: number; type: string }>>();

      accounts.forEach((account: any) => {
        const accountType = account.account_groups?.account_type;

        // Skip income and expense accounts - they go to P&L, not Balance Sheet
        if (accountType === 'income' || accountType === 'expense') return;

        const balance = balances.get(account.id) || 0;
        const groupName = account.account_groups?.name || 'Uncategorized';

        if (!grouped.has(groupName)) {
          grouped.set(groupName, []);
        }

        grouped.get(groupName)!.push({
          account_id: account.id,
          account_name: account.account_name,
          amount: balance,
          type: accountType,
        });
      });

      grouped.forEach((accounts, category) => {
        const total = accounts.reduce((sum, acc) => sum + acc.amount, 0);
        const accountType = accounts[0]?.type;

        let type: 'asset' | 'liability' | 'equity' = 'asset';
        if (accountType === 'liability') type = 'liability';
        else if (accountType === 'equity') type = 'equity';
        else if (accountType === 'asset') type = 'asset';
        else if (category.toLowerCase().includes('liability')) type = 'liability';
        else if (category.toLowerCase().includes('equity') || category.toLowerCase().includes('capital')) type = 'equity';

        const entry = {
          category,
          accounts: accounts.map(({ account_id, account_name, amount }) => ({ account_id, account_name, amount })),
          total,
          type
        };

        if (type === 'asset') {
          assets.push(entry);
        } else if (type === 'liability') {
          liabilities.push(entry);
        } else {
          equity.push(entry);
        }
      });

      // Add net profit/loss as a liability (or reduce liability if loss)
      if (Math.abs(netProfit) > 0.01) {
        const profitEntry: BalanceSheetEntry = {
          category: netProfit >= 0 ? 'Current Year Profit' : 'Current Year Loss',
          accounts: [{
            account_id: 'net_profit',
            account_name: netProfit >= 0 ? 'Net Profit for the Period' : 'Net Loss for the Period',
            amount: Math.abs(netProfit)
          }],
          total: Math.abs(netProfit),
          type: 'liability'
        };

        if (netProfit >= 0) {
          liabilities.push(profitEntry);
        } else {
          // Loss reduces liabilities
          liabilities.push(profitEntry);
        }
      }

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
        const debit = Number(txn.debit) || 0;
        const credit = Number(txn.credit) || 0;
        balances.set(txn.account_id, existing + credit - debit);
      });

      const income: ProfitLossEntry[] = [];
      const expenses: ProfitLossEntry[] = [];

      const grouped = new Map<string, Array<{ account_id: string; account_name: string; amount: number; type: string }>>();

      accounts.forEach((account: any) => {
        const balance = balances.get(account.id) || 0;
        const groupName = account.account_groups?.name || 'Uncategorized';
        const accountType = account.account_groups?.account_type;

        if (accountType !== 'income' && accountType !== 'expense') return;
        if (balance === 0) return;

        if (!grouped.has(groupName)) {
          grouped.set(groupName, []);
        }

        grouped.get(groupName)!.push({
          account_id: account.id,
          account_name: account.account_name,
          amount: Math.abs(balance),
          type: accountType,
        });
      });

      grouped.forEach((accounts, category) => {
        const total = accounts.reduce((sum, acc) => sum + acc.amount, 0);
        const accountType = accounts[0]?.type;

        const type: 'income' | 'expense' = accountType === 'income' ? 'income' : 'expense';

        const entry = {
          category,
          accounts: accounts.map(({ account_id, account_name, amount }) => ({ account_id, account_name, amount })),
          total,
          type
        };

        if (type === 'income') {
          income.push(entry);
        } else {
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

  const handleAccountClick = (accountId: string, startDate: string, endDate?: string) => {
    if (onNavigate) {
      // Store params in sessionStorage for the Ledger page to read
      const params = {
        account: accountId,
        start: startDate,
        end: endDate || '',
        returnPath: '/reports',
      };
      sessionStorage.setItem('ledgerParams', JSON.stringify(params));
      onNavigate('ledger');
    }
  };


  const reportCategories: ReportCategory[] = [
    {
      id: 'accounting',
      name: 'Accounting Reports',
      icon: Scale,
      color: 'blue',
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
      color: 'emerald',
      reports: [
        {
          id: 'receivables',
          name: 'Accounts Receivable',
          description: 'Outstanding invoices, payment tracking, and aging analysis',
          icon: Wallet,
          action: () => {
            setActiveReport('receivables');
          },
        },
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
      color: 'indigo',
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
      color: 'orange',
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
      color: 'purple',
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

  // Color mapping helper
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue': return { bg: 'bg-blue-50', border: 'border-blue-100', iconBg: 'bg-blue-100', iconText: 'text-blue-600', hoverBorder: 'hover:border-blue-400', groupHoverBg: 'group-hover:bg-blue-600' };
      case 'emerald': return { bg: 'bg-emerald-50', border: 'border-emerald-100', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', hoverBorder: 'hover:border-emerald-400', groupHoverBg: 'group-hover:bg-emerald-600' };
      case 'indigo': return { bg: 'bg-indigo-50', border: 'border-indigo-100', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', hoverBorder: 'hover:border-indigo-400', groupHoverBg: 'group-hover:bg-indigo-600' };
      case 'orange': return { bg: 'bg-orange-50', border: 'border-orange-100', iconBg: 'bg-orange-100', iconText: 'text-orange-600', hoverBorder: 'hover:border-orange-400', groupHoverBg: 'group-hover:bg-orange-600' };
      case 'purple': return { bg: 'bg-purple-50', border: 'border-purple-100', iconBg: 'bg-purple-100', iconText: 'text-purple-600', hoverBorder: 'hover:border-purple-400', groupHoverBg: 'group-hover:bg-purple-600' };
      default: return { bg: 'bg-gray-50', border: 'border-gray-100', iconBg: 'bg-gray-100', iconText: 'text-gray-600', hoverBorder: 'hover:border-gray-400', groupHoverBg: 'group-hover:bg-gray-600' };
    }
  };

  if (activeReport) {
    return (
      <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveReport(null)}
            className="flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            <span className="mr-2">←</span> Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-4 z-10 backdrop-blur-sm bg-white/90 support-[backdrop-filter]:bg-white/50">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">From:</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">To:</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={() => {
                switch (activeReport) {
                  case 'trial_balance': fetchTrialBalance(); break;
                  case 'balance_sheet': fetchBalanceSheet(); break;
                  case 'profit_loss': fetchProfitLoss(); break;
                  case 'work': fetchWorkReports(); break;
                  case 'customer': fetchCustomerReports(); break;
                  case 'staff': fetchStaffReports(); break;
                  case 'service': fetchServiceReports(); break;
                  case 'invoice': fetchInvoiceReports(); break;
                  case 'category': fetchCategoryReports(); break;
                  case 'lead': fetchLeadReports(); break;
                  case 'revenue': fetchRevenueReports(); break;
                }
              }}
              disabled={loading}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-sm hover:shadow-md"
            >
              {loading ? 'Generating...' : 'Refresh Report'}
            </button>
          </div>
        </div>

        <div className="animate-fade-in-up">
          {activeReport === 'receivables' && <ReceivablesReport />}

          {activeReport === 'trial_balance' && (
            <TrialBalanceReport
              data={trialBalance}
              startDate={dateRange.start}
              endDate={dateRange.end}
              onAccountClick={handleAccountClick}
            />
          )}

          {activeReport === 'balance_sheet' && (
            <BalanceSheetReport
              data={balanceSheet}
              asOnDate={dateRange.end}
              startDate={dateRange.start}
              onAccountClick={(accountId, asOnDate) => handleAccountClick(accountId, dateRange.start, asOnDate)}
            />
          )}

          {activeReport === 'profit_loss' && (
            <ProfitLossReport
              data={profitLoss}
              startDate={dateRange.start}
              endDate={dateRange.end}
              onAccountClick={handleAccountClick}
            />
          )}

          {activeReport === 'customer' && <CustomerPerformanceReport data={customerReports} />}
          {activeReport === 'work' && <WorkPerformanceReport data={workReports} />}
          {activeReport === 'staff' && <StaffPerformanceReport data={staffReports} />}
          {activeReport === 'service' && <ServicePerformanceReport data={serviceReports} />}
          {activeReport === 'invoice' && <InvoiceReportComponent data={invoiceReports} />}
          {activeReport === 'category' && <CategoryAnalysisReport data={categoryReports} />}
          {activeReport === 'lead' && <LeadConversionReport data={leadReports} />}
          {activeReport === 'revenue' && <RevenueAnalysisReport data={revenueReports} />}
        </div>
      </div>
    );
  }

  // Dashboard View
  return (
    <div className="space-y-8 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8 min-h-screen bg-gray-50/50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-12 opacity-10 transform translate-x-12 -translate-y-12 group-hover:scale-110 transition-transform duration-700">
          <BarChart3 className="w-64 h-64" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <LayoutDashboard className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Reports Dashboard
            </h1>
          </div>
          <p className="text-slate-300 max-w-2xl text-lg">
            Access comprehensive insights and analytics to drive your business decisions. Select a category below to generate detailed reports.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {reportCategories.map((category) => {
          const colors = getColorClasses(category.color);
          const Icon = category.icon;

          return (
            <div key={category.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
              <div className={`px-6 py-4 border-b ${colors.border} flex items-center gap-4 ${colors.bg}`}>
                <div className={`p-2.5 rounded-xl ${colors.iconBg} shadow-sm`}>
                  <Icon className={`w-6 h-6 ${colors.iconText}`} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">{category.name}</h2>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {category.reports.map((report) => {
                    const ReportIcon = report.icon;
                    return (
                      <button
                        key={report.id}
                        onClick={report.action}
                        className={`group text-left p-5 rounded-xl border border-gray-200 ${colors.hoverBorder} hover:shadow-lg transition-all duration-300 bg-white relative overflow-hidden`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-gray-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative z-10 flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${colors.iconBg} ${colors.groupHoverBg} transition-colors duration-300 mt-1`}>
                            <ReportIcon className={`w-6 h-6 ${colors.iconText} group-hover:text-white transition-colors duration-300`} />
                          </div>
                          <div>
                            <h3 className={`font-semibold text-gray-900 group-hover:${colors.iconText} transition-colors duration-300 mb-1.5 text-lg`}>
                              {report.name}
                            </h3>
                            <p className="text-sm text-gray-500 leading-relaxed font-medium">
                              {report.description}
                            </p>
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
