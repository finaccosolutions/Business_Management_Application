import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar, Clock, Edit2, Trash2, Plus, X, ListTodo
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { formatDateDisplay } from '../../lib/dateUtils';
import { PeriodTaskManager } from './PeriodTaskManager';


interface RecurringInstance {
  id: string;
  period_name: string;
  period_start_date: string;
  period_end_date: string;
  status: string;
  completed_at: string | null;
  billing_amount: number | null;
  is_billed: boolean;
  invoice_id: string | null;
  notes: string | null;
  all_tasks_completed: boolean;
  staff_members: { name: string } | null;
}

interface Props {
  workId: string;
  work: any;
  onUpdate: () => void;
}

export function RecurringPeriodManager({ workId, work, onUpdate }: Props) {
  const [periods, setPeriods] = useState<RecurringInstance[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<RecurringInstance | null>(null);
  const [autoGenerateCalled, setAutoGenerateCalled] = useState(false);
  const toast = useToast();

  const [periodForm, setForm] = useState({
    period_name: '',
    period_start_date: '',
    period_end_date: '',
    billing_amount: '',
    notes: ''
  });

  useEffect(() => {
    if (!autoGenerateCalled) {
      autoGenerateAndFetch();
      setAutoGenerateCalled(true);
    } else {
      fetchPeriods();
    }
  }, [workId]);



  const autoGenerateAndFetch = async () => {
    try {
      const { error } = await supabase.rpc('auto_generate_periods_and_tasks', { p_work_id: workId });
      if (error) throw error;
      await fetchPeriods();
    } catch (error) {
      console.error('Error during auto-generate:', error);
      setLoading(false);
    }
  };

  const fetchPeriods = async () => {
    try {
      const { data, error } = await supabase
        .from('work_recurring_instances')
        .select(`
          *,
          recurring_period_tasks(
            id,
            title,
            due_date,
            status,
            display_order
          )
        `)
        .eq('work_id', workId)
        .order('period_start_date', { ascending: false });

      if (error) throw error;
      setPeriods(data || []);
    } catch (error) {
      console.error('Error fetching periods:', error);
      toast.error('Failed to load periods');
    } finally {
      setLoading(false);
    }
  };


  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('work_recurring_instances').insert({
        work_id: workId,
        period_name: periodForm.period_name,
        period_start_date: periodForm.period_start_date,
        period_end_date: periodForm.period_end_date,
        billing_amount: periodForm.billing_amount ? parseFloat(periodForm.billing_amount) : null,
        notes: periodForm.notes || null,
        status: 'pending',
      });

      if (error) throw error;

      setShowPeriodForm(false);
      resetForm();
      fetchPeriods();
      onUpdate();
      toast.success('Period created successfully!');
    } catch (error) {
      console.error('Error creating period:', error);
      toast.error('Failed to create period');
    }
  };

  const handleUpdatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPeriod) return;

    try {
      const { error } = await supabase
        .from('work_recurring_instances')
        .update({
          period_name: periodForm.period_name,
          period_start_date: periodForm.period_start_date,
          period_end_date: periodForm.period_end_date,
          billing_amount: periodForm.billing_amount ? parseFloat(periodForm.billing_amount) : null,
          notes: periodForm.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingPeriod.id);

      if (error) throw error;

      setShowPeriodForm(false);
      setEditingPeriod(null);
      resetForm();
      fetchPeriods();
      onUpdate();
      toast.success('Period updated successfully!');
    } catch (error) {
      console.error('Error updating period:', error);
      toast.error('Failed to update period');
    }
  };


  const handleDeletePeriod = async (periodId: string) => {
    if (!confirm('Are you sure you want to delete this period? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('work_recurring_instances')
        .delete()
        .eq('id', periodId);

      if (error) throw error;

      if (selectedPeriod === periodId) {
        setSelectedPeriod(null);
      }

      fetchPeriods();
      onUpdate();
      toast.success('Period deleted successfully!');
    } catch (error) {
      console.error('Error deleting period:', error);
      toast.error('Failed to delete period');
    }
  };

  const openEditPeriodModal = (period: RecurringInstance) => {
    setEditingPeriod(period);
    setForm({
      period_name: period.period_name,
      period_start_date: period.period_start_date,
      period_end_date: period.period_end_date,
      billing_amount: period.billing_amount?.toString() || '',
      notes: period.notes || ''
    });
    setShowPeriodForm(true);
  };

  const resetForm = () => {
    setForm({
      period_name: '',
      period_start_date: '',
      period_end_date: '',
      billing_amount: '',
      notes: ''
    });
    setEditingPeriod(null);
  };



  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  const selectedPeriodData = selectedPeriod ? periods.find(p => p.id === selectedPeriod) : null;

  return (
    <div className="space-y-6">
      {/* Periods & Tasks Management Section */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50 space-y-2">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
              <Calendar size={16} className="text-orange-600" />
              Periods & Tasks Management
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              Pattern: <span className="font-medium capitalize">{work.recurrence_pattern}</span>
              {work.billing_amount && (
                <span className="ml-4">
                  Default Billing: <span className="font-medium">₹{work.billing_amount.toLocaleString('en-IN')}</span>
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowPeriodForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            <Plus size={18} />
            <span>Add Period</span>
          </button>
        </div>

        {/* Periods and Tasks Grid - Full Width */}
        <div className="flex flex-col lg:flex-row gap-0 h-[600px]">
          {/* Left Panel: Periods List (40% width) */}
          <div className="overflow-hidden flex flex-col lg:w-2/5 border-r border-gray-200">
            <div className="p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <h4 className="font-semibold text-gray-900 text-sm">All Periods</h4>
              <p className="text-xs text-gray-600 mt-1">{periods.length} period(s)</p>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2 p-3">
              {periods.map(period => {
                const allTasks = ((period as any).recurring_period_tasks || []).sort(
                  (a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)
                );
                const incompleteTasks = allTasks.filter((t: any) => t.status !== 'completed');
                const completedTasks = allTasks.filter((t: any) => t.status === 'completed');
                const firstIncompleteTask = incompleteTasks[0];

                let statusLabel = '';
                if (period.status === 'completed') statusLabel = 'Completed';
                else if (period.status === 'in_progress') statusLabel = 'In Progress';
                else statusLabel = 'Pending';

                const nextTaskDueDate = firstIncompleteTask?.due_date || null;
                const referenceDate = nextTaskDueDate || period.period_end_date;
                const isOverdue = period.status !== 'completed' && new Date(referenceDate) < new Date();

                return (
                  <div
                    key={period.id}
                    onClick={() => setSelectedPeriod(selectedPeriod === period.id ? null : period.id)}
                    className={`border rounded-lg p-2 cursor-pointer transition-all group ${selectedPeriod === period.id
                      ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-200'
                      : isOverdue
                        ? 'border-red-200 bg-red-50 hover:bg-red-100'
                        : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-gray-50'
                      }`}
                  >
                    {/* Header: Title + Status + Action */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <h5 className="font-semibold text-gray-900 truncate text-xs shrink-0 max-w-[120px]" title={period.period_name}>
                          {period.period_name}
                        </h5>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${period.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : period.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEditPeriodModal(period)} className="text-gray-400 hover:text-blue-600">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => handleDeletePeriod(period.id)} className="text-gray-400 hover:text-red-600">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Dates & Billing */}
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
                      <div className="flex items-center gap-1">
                        <Calendar size={10} />
                        <span>{formatDateDisplay(period.period_start_date)} - {formatDateDisplay(period.period_end_date)}</span>
                      </div>
                      {period.billing_amount && (
                        <span className="text-emerald-600 font-medium">₹{(period.billing_amount / 1000).toFixed(0)}k</span>
                      )}
                    </div>

                    {/* Progress */}
                    {allTasks.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-500 flex items-center gap-1">
                            <ListTodo size={10} /> {completedTasks}/{allTasks.length}
                          </span>
                          <span className={`${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {Math.round((completedTasks.length / allTasks.length) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all ${isOverdue ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${(completedTasks.length / allTasks.length) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {periods.length === 0 && (
                <div className="text-center py-8">
                  <Calendar size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-600 text-xs font-medium">No periods yet</p>
                  <p className="text-gray-500 text-xs mt-1">Add a period to get started</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Tasks (60% width) */}
          <div className="overflow-hidden flex flex-col lg:w-3/5 bg-white">
            <div className="p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              {selectedPeriodData ? (
                <>
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">
                    {selectedPeriodData.period_name} - Tasks
                  </h4>
                  <p className="text-xs text-gray-600">
                    {formatDateDisplay(selectedPeriodData.period_start_date)} - {formatDateDisplay(selectedPeriodData.period_end_date)}
                  </p>
                </>
              ) : (
                <p className="text-gray-500 text-sm">Select a period to view tasks</p>
              )}
            </div>

            {/* Tasks Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {selectedPeriodData ? (
                <PeriodTaskManager
                  periodId={selectedPeriodData.id}
                  periodName={selectedPeriodData.period_name}
                  periodStatus={selectedPeriodData.status}
                  workId={workId}
                  periodStartDate={selectedPeriodData.period_start_date}
                  periodEndDate={selectedPeriodData.period_end_date}
                  onTasksUpdate={() => {
                    fetchPeriods();
                    onUpdate();
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <ListTodo size={40} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500 text-sm">Select a period to view its tasks</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Period Form Modal */}
      {showPeriodForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">
                  {editingPeriod ? 'Edit Period' : 'Add New Period'}
                </h3>
                <button
                  onClick={() => {
                    setShowPeriodForm(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={editingPeriod ? handleUpdatePeriod : handleCreatePeriod} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Period Name *
                </label>
                <input
                  type="text"
                  required
                  value={periodForm.period_name}
                  onChange={(e) => setForm({ ...periodForm, period_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="e.g., January 2025"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={periodForm.period_start_date}
                    onChange={(e) => setForm({ ...periodForm, period_start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Start date of the reporting period</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={periodForm.period_end_date}
                    onChange={(e) => setForm({ ...periodForm, period_end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">End date of the reporting period</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-900 mb-1">Period vs Task Dates:</p>
                <ul className="text-blue-800 space-y-1 text-xs">
                  <li>• <strong>Period dates</strong> = the reporting period (e.g., Sep 1-30 for monthly GST)</li>
                  <li>• <strong>Task due dates</strong> = when work must be submitted (e.g., Oct 10, Oct 20)</li>
                  <li>• Tasks are configured in the service template with due date offsets</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={periodForm.billing_amount}
                  onChange={(e) => setForm({ ...periodForm, billing_amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="₹"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={periodForm.notes}
                  onChange={(e) => setForm({ ...periodForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                  placeholder="Optional notes for this period..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPeriodForm(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700"
                >
                  {editingPeriod ? 'Update Period' : 'Create Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
