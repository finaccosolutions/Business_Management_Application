import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell,
  Calendar,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Clock,
  TrendingDown,
  Users,
  Briefcase,
  PhoneCall,
  FileText,
  XCircle,
  ChevronRight,
  AlertCircle,
  Target,
  Trash2,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface Reminder {
  id: string;
  title: string;
  message: string;
  reminder_date: string;
  is_read: boolean;
  created_at: string;
}

interface AlertItem {
  id: string;
  type: 'lead_followup' | 'work' | 'invoice' | 'staff_performance' | 'manual_reminder' | 'customer_followup' | 'service_renewal' | 'pending_work_start' | 'upcoming_due_date' | 'overdue_work' | 'unpaid_invoice' | 'inactive_customer' | 'lead_without_followup' | 'incomplete_customer_info' | 'staff_task_overload' | 'other';
  title: string;
  description: string;
  date?: string;
  time?: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  actionUrl?: string;
  metadata?: any;
}

export default function Reminders() {
  const { user } = useAuth();
  const toast = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  useEffect(() => {
    if (user) {
      fetchAllAlerts();
    }
  }, [user]);

  const fetchAllAlerts = async () => {
    setLoading(true);
    try {
      const alertsList: AlertItem[] = [];
      const now = new Date();

      // 1. Fetch Manual Reminders
      const { data: remindersData } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', user?.id)
        .order('reminder_date', { ascending: true });

      (remindersData || []).forEach((reminder) => {
        const reminderDate = new Date(reminder.reminder_date);
        const isOverdue = reminderDate < now;
        const isToday = reminderDate.toDateString() === now.toDateString();

        let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium';
        if (isOverdue) urgency = 'critical';
        else if (isToday) urgency = 'high';

        alertsList.push({
          id: reminder.id,
          type: 'manual_reminder',
          title: reminder.title,
          description: reminder.message,
          date: reminder.reminder_date,
          urgency: reminder.is_read ? 'low' : urgency,
          category: 'Manual Reminders',
          metadata: { is_read: reminder.is_read, reminder_id: reminder.id },
        });
      });

      // 2. Fetch Lead Follow-ups
      const { data: followupsData } = await supabase
        .from('lead_followups')
        .select(`
          *,
          leads (name, email, phone)
        `)
        .eq('user_id', user?.id)
        .eq('status', 'pending')
        .order('followup_date', { ascending: true });

      (followupsData || []).forEach((followup: any) => {
        const followupDate = new Date(followup.followup_date);
        const daysUntil = Math.ceil((followupDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
        if (daysUntil < 0) urgency = 'critical';
        else if (daysUntil === 0) urgency = 'high';
        else if (daysUntil === 1) urgency = 'high';
        else if (daysUntil <= 3) urgency = 'medium';

        alertsList.push({
          id: followup.id,
          type: 'lead_followup',
          title: `Follow-up: ${followup.leads?.name || 'Unknown Lead'}`,
          description: `${followup.followup_type} follow-up${followup.remarks ? ': ' + followup.remarks : ''}`,
          date: followup.followup_date,
          time: followup.followup_time,
          urgency,
          category: 'Lead Follow-ups',
          metadata: { lead: followup.leads, followup_type: followup.followup_type },
        });
      });

      // 3. Fetch Pending/Overdue Works
      const { data: worksData } = await supabase
        .from('works')
        .select(`
          *,
          customers (name, email, phone),
          services (name)
        `)
        .eq('user_id', user?.id)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true });

      (worksData || []).forEach((work: any) => {
        if (work.due_date) {
          const dueDate = new Date(work.due_date);
          const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
          if (daysUntil < 0) urgency = 'critical';
          else if (daysUntil === 0) urgency = 'critical';
          else if (daysUntil === 1) urgency = 'high';
          else if (daysUntil <= 3) urgency = 'medium';

          const statusLabel = work.status === 'in_progress' ? 'In Progress' : 'Pending';

          alertsList.push({
            id: work.id,
            type: 'work',
            title: `${statusLabel}: ${work.services?.name || 'Service'} - ${work.customers?.name || 'Customer'}`,
            description: `Due ${daysUntil < 0 ? Math.abs(daysUntil) + ' days overdue' : daysUntil === 0 ? 'today' : 'in ' + daysUntil + ' days'}`,
            date: work.due_date,
            urgency,
            category: 'Works & Tasks',
            metadata: { customer: work.customers, service: work.services, status: work.status },
          });
        }
      });

      // 4. Fetch Overdue Invoices
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select(`
          *,
          customers (name, email, phone)
        `)
        .eq('user_id', user?.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true });

      (invoicesData || []).forEach((invoice: any) => {
        if (invoice.due_date) {
          const dueDate = new Date(invoice.due_date);
          const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysOverdue >= 0) {
            let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
            if (daysOverdue > 30) urgency = 'critical';
            else if (daysOverdue > 14) urgency = 'high';
            else if (daysOverdue > 7) urgency = 'medium';
            else urgency = 'low';

            const amount = invoice.total_amount || 0;

            alertsList.push({
              id: invoice.id,
              type: 'invoice',
              title: `Overdue Invoice: ${invoice.customers?.name || 'Customer'}`,
              description: `Amount: $${amount.toFixed(2)} - ${daysOverdue} days overdue`,
              date: invoice.due_date,
              urgency,
              category: 'Payments & Invoices',
              metadata: { customer: invoice.customers, amount, invoice_number: invoice.invoice_number },
            });
          }
        }
      });

      // 5. Upcoming invoices due soon
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const { data: upcomingInvoicesData } = await supabase
        .from('invoices')
        .select(`
          *,
          customers (name, email, phone)
        `)
        .eq('user_id', user?.id)
        .eq('status', 'pending')
        .gte('due_date', now.toISOString().split('T')[0])
        .lte('due_date', threeDaysFromNow.toISOString().split('T')[0])
        .order('due_date', { ascending: true });

      (upcomingInvoicesData || []).forEach((invoice: any) => {
        const dueDate = new Date(invoice.due_date);
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium';
        if (daysUntil === 0) urgency = 'high';
        else if (daysUntil === 1) urgency = 'high';

        alertsList.push({
          id: invoice.id,
          type: 'unpaid_invoice',
          title: `Invoice Due Soon: ${invoice.customers?.name || 'Customer'}`,
          description: `Amount: $${(invoice.total_amount || 0).toFixed(2)} - Due ${daysUntil === 0 ? 'today' : 'in ' + daysUntil + ' days'}`,
          date: invoice.due_date,
          urgency,
          category: 'Upcoming Payments',
          metadata: { customer: invoice.customers, amount: invoice.total_amount, invoice_number: invoice.invoice_number },
        });
      });

      // 6. Check for leads without follow-ups
      const { data: leadsWithoutFollowupData } = await supabase
        .from('leads')
        .select(`
          *,
          lead_followups (id)
        `)
        .eq('user_id', user?.id)
        .in('status', ['new', 'contacted', 'qualified'])
        .is('converted_to_customer_id', null)
        .order('created_at', { ascending: false });

      (leadsWithoutFollowupData || []).forEach((lead: any) => {
        const hasFollowups = lead.lead_followups && lead.lead_followups.length > 0;
        const leadAge = Math.ceil((now.getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));

        if (!hasFollowups && leadAge >= 3) {
          let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium';
          if (leadAge >= 7) urgency = 'high';
          if (leadAge >= 14) urgency = 'critical';

          alertsList.push({
            id: lead.id,
            type: 'lead_without_followup',
            title: `Lead Needs Attention: ${lead.name}`,
            description: `No follow-ups scheduled - Lead created ${leadAge} days ago`,
            date: lead.created_at,
            urgency,
            category: 'Lead Management',
            metadata: { lead },
          });
        }
      });

      // 7. Works starting soon (pending status with start date approaching)
      const { data: upcomingWorksData } = await supabase
        .from('works')
        .select(`
          *,
          customers (name, email, phone),
          services (name)
        `)
        .eq('user_id', user?.id)
        .eq('status', 'pending')
        .not('start_date', 'is', null)
        .gte('start_date', now.toISOString().split('T')[0])
        .lte('start_date', threeDaysFromNow.toISOString().split('T')[0])
        .order('start_date', { ascending: true });

      (upcomingWorksData || []).forEach((work: any) => {
        const startDate = new Date(work.start_date);
        const daysUntil = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium';
        if (daysUntil === 0) urgency = 'high';
        else if (daysUntil === 1) urgency = 'high';

        alertsList.push({
          id: work.id,
          type: 'pending_work_start',
          title: `Work Starting Soon: ${work.services?.name || 'Service'} - ${work.customers?.name || 'Customer'}`,
          description: `Scheduled to start ${daysUntil === 0 ? 'today' : 'in ' + daysUntil + ' days'}`,
          date: work.start_date,
          urgency,
          category: 'Work Scheduling',
          metadata: { customer: work.customers, service: work.services },
        });
      });

      // 8. Inactive customers (no recent services)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: customersData } = await supabase
        .from('customers')
        .select(`
          *,
          works (id, created_at, status)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: true });

      (customersData || []).forEach((customer: any) => {
        const works = customer.works || [];
        const recentWorks = works.filter((w: any) => new Date(w.created_at) >= sixtyDaysAgo);
        const customerAge = Math.ceil((now.getTime() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24));

        if (recentWorks.length === 0 && customerAge >= 90) {
          alertsList.push({
            id: customer.id,
            type: 'inactive_customer',
            title: `Inactive Customer: ${customer.name}`,
            description: `No services in the last 60 days - Consider a follow-up`,
            urgency: 'low',
            category: 'Customer Engagement',
            metadata: { customer },
          });
        }
      });

      // 9. Staff performance issues
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: staffData } = await supabase
        .from('staff')
        .select(`
          *,
          works!works_assigned_to_fkey (id, status, due_date, completed_date)
        `)
        .eq('user_id', user?.id)
        .eq('status', 'active');

      (staffData || []).forEach((staff: any) => {
        const works = staff.works || [];
        const recentWorks = works.filter((w: any) => new Date(w.due_date) >= thirtyDaysAgo);
        const overdueWorks = recentWorks.filter((w: any) => {
          if (w.status === 'completed') return false;
          return new Date(w.due_date) < now;
        });
        const pendingWorks = works.filter((w: any) => w.status === 'pending' || w.status === 'in_progress');

        if (overdueWorks.length >= 3) {
          alertsList.push({
            id: staff.id + '-performance',
            type: 'staff_performance',
            title: `Staff Performance Alert: ${staff.name}`,
            description: `${overdueWorks.length} overdue tasks in the last 30 days`,
            urgency: 'high',
            category: 'Staff Performance',
            metadata: { staff, overdue_count: overdueWorks.length },
          });
        }

        if (pendingWorks.length >= 10) {
          alertsList.push({
            id: staff.id + '-overload',
            type: 'staff_task_overload',
            title: `Staff Task Overload: ${staff.name}`,
            description: `${pendingWorks.length} pending/active tasks - Consider redistributing`,
            urgency: 'medium',
            category: 'Staff Workload',
            metadata: { staff, pending_count: pendingWorks.length },
          });
        }
      });

      // 10. Customers with incomplete information
      const { data: incompleteCustomersData } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user?.id);

      (incompleteCustomersData || []).forEach((customer: any) => {
        const missingFields = [];
        if (!customer.email) missingFields.push('email');
        if (!customer.phone) missingFields.push('phone');
        if (!customer.address) missingFields.push('address');

        if (missingFields.length >= 2) {
          alertsList.push({
            id: customer.id,
            type: 'incomplete_customer_info',
            title: `Incomplete Customer Info: ${customer.name}`,
            description: `Missing: ${missingFields.join(', ')}`,
            urgency: 'low',
            category: 'Data Quality',
            metadata: { customer, missing_fields: missingFields },
          });
        }
      });

      // Sort by urgency and date
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      alertsList.sort((a, b) => {
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        if (a.date && b.date) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        return 0;
      });

      setAlerts(alertsList);
      setReminders(remindersData || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  const markReminderAsRead = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from('reminders')
        .update({ is_read: true })
        .eq('id', reminderId);

      if (error) throw error;
      toast.success('Reminder marked as read');
      fetchAllAlerts();
    } catch (error) {
      console.error('Error marking reminder as read:', error);
      toast.error('Failed to mark reminder as read');
    }
  };

  const deleteReminder = async (reminderId: string) => {
    if (!confirm('Delete this reminder?')) return;
    try {
      const { error } = await supabase.from('reminders').delete().eq('id', reminderId);
      if (error) throw error;
      toast.success('Reminder deleted');
      fetchAllAlerts();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      toast.error('Failed to delete reminder');
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <AlertTriangle className="text-red-600" size={20} />;
      case 'high':
        return <AlertCircle className="text-orange-600" size={20} />;
      case 'medium':
        return <Bell className="text-yellow-600" size={20} />;
      default:
        return <Clock className="text-blue-600" size={20} />;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'border-red-500 bg-red-50/50';
      case 'high':
        return 'border-orange-500 bg-orange-50/50';
      case 'medium':
        return 'border-yellow-500 bg-yellow-50/50';
      default:
        return 'border-blue-500 bg-blue-50/50';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'lead_followup':
        return <PhoneCall size={18} />;
      case 'lead_without_followup':
        return <Target size={18} />;
      case 'work':
      case 'overdue_work':
        return <Briefcase size={18} />;
      case 'pending_work_start':
        return <Clock size={18} />;
      case 'invoice':
      case 'unpaid_invoice':
        return <DollarSign size={18} />;
      case 'staff_performance':
        return <TrendingDown size={18} />;
      case 'staff_task_overload':
        return <Users size={18} />;
      case 'manual_reminder':
        return <Bell size={18} />;
      case 'inactive_customer':
        return <Users size={18} />;
      case 'incomplete_customer_info':
        return <AlertCircle size={18} />;
      case 'service_renewal':
        return <Calendar size={18} />;
      default:
        return <FileText size={18} />;
    }
  };

  const filteredAlerts = activeCategory === 'all'
    ? alerts
    : alerts.filter(alert => alert.urgency === activeCategory);

  const criticalCount = alerts.filter(a => a.urgency === 'critical').length;
  const highCount = alerts.filter(a => a.urgency === 'high').length;
  const mediumCount = alerts.filter(a => a.urgency === 'medium').length;
  const lowCount = alerts.filter(a => a.urgency === 'low').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Bell size={32} className="text-blue-600" />
          Critical Alerts & Reminders
        </h1>
        <p className="text-gray-600 mt-2">
          Stay on top of everything important - never miss a deadline, follow-up, or critical business alert
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Critical</p>
              <p className="text-3xl font-bold mt-1">{criticalCount}</p>
            </div>
            <AlertTriangle size={40} className="opacity-80" />
          </div>
          <p className="text-xs text-red-100 mt-2">Requires immediate attention</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">High Priority</p>
              <p className="text-3xl font-bold mt-1">{highCount}</p>
            </div>
            <AlertCircle size={40} className="opacity-80" />
          </div>
          <p className="text-xs text-orange-100 mt-2">Action needed soon</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm font-medium">Medium Priority</p>
              <p className="text-3xl font-bold mt-1">{mediumCount}</p>
            </div>
            <Bell size={40} className="opacity-80" />
          </div>
          <p className="text-xs text-yellow-100 mt-2">Plan ahead</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Low Priority</p>
              <p className="text-3xl font-bold mt-1">{lowCount}</p>
            </div>
            <Clock size={40} className="opacity-80" />
          </div>
          <p className="text-xs text-blue-100 mt-2">Future items</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeCategory === 'all'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          All ({alerts.length})
        </button>
        <button
          onClick={() => setActiveCategory('critical')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeCategory === 'critical'
              ? 'bg-red-600 text-white shadow-md'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Critical ({criticalCount})
        </button>
        <button
          onClick={() => setActiveCategory('high')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeCategory === 'high'
              ? 'bg-orange-600 text-white shadow-md'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          High ({highCount})
        </button>
        <button
          onClick={() => setActiveCategory('medium')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeCategory === 'medium'
              ? 'bg-yellow-600 text-white shadow-md'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Medium ({mediumCount})
        </button>
        <button
          onClick={() => setActiveCategory('low')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeCategory === 'low'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Low ({lowCount})
        </button>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <CheckCircle size={64} className="mx-auto text-green-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">All Clear!</h3>
            <p className="text-gray-600">
              {activeCategory === 'all'
                ? "No alerts at the moment. You're doing great!"
                : `No ${activeCategory} priority alerts.`}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={`${alert.type}-${alert.id}`}
              className={`bg-white rounded-xl shadow-sm border-l-4 p-6 transition-all hover:shadow-md ${getUrgencyColor(alert.urgency)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${alert.urgency === 'critical' ? 'bg-red-100' : alert.urgency === 'high' ? 'bg-orange-100' : alert.urgency === 'medium' ? 'bg-yellow-100' : 'bg-blue-100'} flex-shrink-0`}>
                      {getCategoryIcon(alert.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 text-lg mb-1">{alert.title}</h3>
                          <p className="text-gray-700">{alert.description}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getUrgencyBadge(alert.urgency)}`}>
                            {alert.urgency.toUpperCase()}
                          </span>
                          {getUrgencyIcon(alert.urgency)}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Target size={14} />
                          <span className="font-medium">{alert.category}</span>
                        </div>
                        {alert.date && (
                          <div className="flex items-center gap-2">
                            <Calendar size={14} />
                            <span>
                              {new Date(alert.date).toLocaleDateString()}
                              {alert.time && ` at ${alert.time}`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mt-4">
                        {alert.type === 'manual_reminder' && !alert.metadata?.is_read && (
                          <>
                            <button
                              onClick={() => markReminderAsRead(alert.metadata.reminder_id)}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                            >
                              <CheckCircle size={16} />
                              Mark as Read
                            </button>
                            <button
                              onClick={() => deleteReminder(alert.metadata.reminder_id)}
                              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </>
                        )}
                        {alert.type === 'lead_followup' && (
                          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                            View Lead
                            <ChevronRight size={16} />
                          </button>
                        )}
                        {alert.type === 'work' && (
                          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                            View Work
                            <ChevronRight size={16} />
                          </button>
                        )}
                        {alert.type === 'invoice' && (
                          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                            View Invoice
                            <ChevronRight size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
