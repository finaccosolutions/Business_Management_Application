import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  AlertTriangle,
  Clock,
  Calendar,
  Users,
  FileText,
  Filter,
  X,
  Plus,
  CheckCircle,
  Briefcase,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface OverdueItem {
  id: string;
  type: 'work' | 'task';
  title: string;
  customer: string;
  service: string;
  due_date: string;
  days_overdue: number;
  overdue_reason: string | null;
  assigned_to: string | null;
  priority: string;
  status: string;
  work_id?: string;
}

export default function OverdueReport() {
  const { user } = useAuth();
  const toast = useToast();
  const [overdueItems, setOverdueItems] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'work' | 'task'>('all');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OverdueItem | null>(null);
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    if (user) {
      fetchOverdueItems();
      fetchCustomers();
    }
  }, [user]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchOverdueItems = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const items: OverdueItem[] = [];

      // Fetch overdue works (non-recurring and without completed status)
      const { data: works, error: worksError } = await supabase
        .from('works')
        .select(`
          *,
          customers (id, name),
          services (name),
          staff_members (name)
        `)
        .eq('user_id', user!.id)
        .in('status', ['pending', 'in_progress'])
        .not('due_date', 'is', null);

      if (worksError) throw worksError;

      (works || []).forEach((work: any) => {
        const dueDate = new Date(work.due_date);
        if (dueDate < now) {
          const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          items.push({
            id: work.id,
            type: 'work',
            title: work.title,
            customer: work.customers?.name || 'Unknown',
            service: work.services?.name || 'Unknown',
            due_date: work.due_date,
            days_overdue: daysOverdue,
            overdue_reason: work.overdue_reason,
            assigned_to: work.staff_members?.name || null,
            priority: work.priority,
            status: work.status,
          });
        }
      });

      // Fetch overdue tasks from recurring works (period tasks)
      const { data: periodTasks, error: periodTasksError } = await supabase
        .from('recurring_period_tasks')
        .select(`
          *,
          recurring_periods!inner (
            work_id,
            period_name,
            status,
            works!inner (
              title,
              customer_id,
              service_id,
              customers (name),
              services (name)
            )
          ),
          staff_members (name)
        `)
        .in('status', ['pending', 'in_progress'])
        .not('due_date', 'is', null);

      if (periodTasksError) throw periodTasksError;

      (periodTasks || []).forEach((task: any) => {
        const dueDate = new Date(task.due_date);
        if (dueDate < now && task.recurring_periods?.status !== 'completed') {
          const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          items.push({
            id: task.id,
            type: 'task',
            title: `${task.recurring_periods?.works?.title} - ${task.recurring_periods?.period_name} - ${task.title}`,
            customer: task.recurring_periods?.works?.customers?.name || 'Unknown',
            service: task.recurring_periods?.works?.services?.name || 'Unknown',
            due_date: task.due_date,
            days_overdue: daysOverdue,
            overdue_reason: null,
            assigned_to: task.staff_members?.name || null,
            priority: task.priority,
            status: task.status,
            work_id: task.recurring_periods?.work_id,
          });
        }
      });

      // Fetch overdue regular work tasks
      const { data: regularTasks, error: regularTasksError } = await supabase
        .from('work_tasks')
        .select(`
          *,
          works!inner (
            title,
            customer_id,
            service_id,
            is_recurring,
            customers (name),
            services (name)
          ),
          staff_members (name)
        `)
        .in('status', ['pending', 'in_progress'])
        .not('due_date', 'is', null);

      if (regularTasksError) throw regularTasksError;

      (regularTasks || []).forEach((task: any) => {
        // Only include tasks from non-recurring works
        if (!task.works?.is_recurring) {
          const dueDate = new Date(task.due_date);
          if (dueDate < now) {
            const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            items.push({
              id: task.id,
              type: 'task',
              title: `${task.works?.title} - ${task.title}`,
              customer: task.works?.customers?.name || 'Unknown',
              service: task.works?.services?.name || 'Unknown',
              due_date: task.due_date,
              days_overdue: daysOverdue,
              overdue_reason: null,
              assigned_to: task.staff_members?.name || null,
              priority: task.priority,
              status: task.status,
              work_id: task.work_id,
            });
          }
        }
      });

      // Sort by days overdue (most overdue first)
      items.sort((a, b) => b.days_overdue - a.days_overdue);

      setOverdueItems(items);
    } catch (error) {
      console.error('Error fetching overdue items:', error);
      toast.error('Failed to load overdue items');
    } finally {
      setLoading(false);
    }
  };

  const handleAddReason = (item: OverdueItem) => {
    setSelectedItem(item);
    setReasonText(item.overdue_reason || '');
    setShowReasonModal(true);
  };

  const handleSaveReason = async () => {
    if (!selectedItem || selectedItem.type !== 'work') return;

    try {
      const { error } = await supabase
        .from('works')
        .update({
          overdue_reason: reasonText || null,
          overdue_marked_at: reasonText ? new Date().toISOString() : null,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      toast.success('Overdue reason saved');
      setShowReasonModal(false);
      setSelectedItem(null);
      setReasonText('');
      fetchOverdueItems();
    } catch (error) {
      console.error('Error saving reason:', error);
      toast.error('Failed to save reason');
    }
  };

  const filteredItems = overdueItems.filter((item) => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterPriority && item.priority !== filterPriority) return false;
    if (filterCustomer && item.customer !== filterCustomer) return false;
    return true;
  });

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700 border-gray-300',
      medium: 'bg-blue-100 text-blue-700 border-blue-300',
      high: 'bg-orange-100 text-orange-700 border-orange-300',
      urgent: 'bg-red-100 text-red-700 border-red-300',
    };
    return colors[priority] || colors.medium;
  };

  const getUrgencyColor = (daysOverdue: number) => {
    if (daysOverdue > 30) return 'bg-red-500 text-white';
    if (daysOverdue > 14) return 'bg-orange-500 text-white';
    if (daysOverdue > 7) return 'bg-yellow-500 text-gray-900';
    return 'bg-blue-500 text-white';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <AlertTriangle size={32} className="text-red-600" />
          Overdue Works & Tasks Report
        </h1>
        <p className="text-gray-600 mt-2">
          Track and manage all overdue items with reasons and priorities
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Total Overdue</p>
              <p className="text-4xl font-bold mt-1">{overdueItems.length}</p>
            </div>
            <AlertTriangle size={48} className="opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Overdue Works</p>
              <p className="text-4xl font-bold mt-1">
                {overdueItems.filter((i) => i.type === 'work').length}
              </p>
            </div>
            <Briefcase size={48} className="opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm font-medium">Overdue Tasks</p>
              <p className="text-4xl font-bold mt-1">
                {overdueItems.filter((i) => i.type === 'task').length}
              </p>
            </div>
            <CheckCircle size={48} className="opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300 text-sm font-medium">With Reasons</p>
              <p className="text-4xl font-bold mt-1">
                {overdueItems.filter((i) => i.overdue_reason).length}
              </p>
            </div>
            <FileText size={48} className="opacity-80" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} className="text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Types</option>
            <option value="work">Works Only</option>
            <option value="task">Tasks Only</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.name}>
                {customer.name}
              </option>
            ))}
          </select>

          {(filterType !== 'all' || filterPriority || filterCustomer) && (
            <button
              onClick={() => {
                setFilterType('all');
                setFilterPriority('');
                setFilterCustomer('');
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Overdue Items List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle size={64} className="mx-auto text-green-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Overdue Items!</h3>
            <p className="text-gray-600">
              {filterType !== 'all' || filterPriority || filterCustomer
                ? 'No items match your filters.'
                : 'Great job! Everything is on track.'}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="bg-white rounded-xl shadow-sm border-l-4 border-red-500 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getUrgencyColor(item.days_overdue)}`}>
                      {item.days_overdue} days overdue
                    </span>
                    <span className={`px-2 py-1 rounded border text-xs font-medium ${getPriorityColor(item.priority)}`}>
                      {item.priority.toUpperCase()}
                    </span>
                    <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                      {item.type === 'work' ? 'Work' : 'Task'}
                    </span>
                    {item.status && (
                      <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium capitalize">
                        {item.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-gray-900 text-lg mb-2">{item.title}</h3>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {item.customer}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase size={14} />
                      {item.service}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      Due: {new Date(item.due_date).toLocaleDateString()}
                    </span>
                    {item.assigned_to && (
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        Assigned: {item.assigned_to}
                      </span>
                    )}
                  </div>

                  {item.overdue_reason ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                      <p className="text-sm font-medium text-yellow-900 mb-1">Overdue Reason:</p>
                      <p className="text-sm text-gray-700">{item.overdue_reason}</p>
                    </div>
                  ) : item.type === 'work' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 flex items-center justify-between">
                      <p className="text-sm text-red-700 font-medium">No reason provided</p>
                      <button
                        onClick={() => handleAddReason(item)}
                        className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                      >
                        <Plus size={14} />
                        Add Reason
                      </button>
                    </div>
                  )}

                  {item.type === 'work' && item.overdue_reason && (
                    <button
                      onClick={() => handleAddReason(item)}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Update reason
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Reason Modal */}
      {showReasonModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-red-600 to-orange-600">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <AlertTriangle size={28} />
                Overdue Reason
              </h2>
              <button
                onClick={() => {
                  setShowReasonModal(false);
                  setSelectedItem(null);
                  setReasonText('');
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Work:</p>
                <p className="text-gray-900 font-semibold">{selectedItem.title}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Days Overdue:</p>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${getUrgencyColor(selectedItem.days_overdue)}`}>
                  {selectedItem.days_overdue} days
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Being Overdue *
                </label>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Explain why this work is overdue (e.g., waiting for client documents, technical issues, resource constraints...)"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  setShowReasonModal(false);
                  setSelectedItem(null);
                  setReasonText('');
                }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveReason}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-all font-medium shadow-lg"
              >
                Save Reason
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
