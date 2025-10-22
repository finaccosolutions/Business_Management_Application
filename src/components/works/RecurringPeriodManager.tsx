import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar, Clock, CheckCircle, Edit2, Trash2, Plus, AlertTriangle,
  DollarSign, FileText, CheckSquare, PlayCircle, Upload, Download, X, ListTodo, RefreshCw
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { formatDateDisplay } from '../../lib/dateUtils';
import { PeriodTaskManager } from './PeriodTaskManager';

interface PeriodDocument {
  id: string;
  work_recurring_instance_id: string;
  work_document_id: string;
  is_collected: boolean;
  collected_at: string | null;
  file_url: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  notes: string | null;
  work_documents: {
    name: string;
    description: string | null;
    category: string;
    is_required: boolean;
  };
}

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
  const [periodDocuments, setPeriodDocuments] = useState<PeriodDocument[]>([]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'documents'>('tasks');
  const [loading, setLoading] = useState(true);
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<RecurringInstance | null>(null);
  const [generatingPeriods, setGeneratingPeriods] = useState(false);
  const toast = useToast();

  const [periodForm, setForm] = useState({
    period_name: '',
    period_start_date: '',
    period_end_date: '',
    billing_amount: '',
    notes: ''
  });

  useEffect(() => {
    fetchPeriods();
  }, [workId]);

  useEffect(() => {
    if (selectedPeriod) {
      fetchPeriodDocuments(selectedPeriod);
    }
  }, [selectedPeriod]);

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

  const fetchPeriodDocuments = async (periodId: string) => {
    try {
      const { data, error } = await supabase
        .from('work_recurring_period_documents')
        .select(`
          *,
          work_documents(name, description, category, is_required)
        `)
        .eq('work_recurring_instance_id', periodId)
        .order('work_documents(is_required)', { ascending: false });

      if (error) throw error;
      setPeriodDocuments(data || []);
    } catch (error) {
      console.error('Error fetching period documents:', error);
      toast.error('Failed to load period documents');
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

  const handleUpdatePeriodStatus = async (periodId: string, status: string) => {
    try {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = work.assigned_to;
      }

      const { error } = await supabase
        .from('work_recurring_instances')
        .update(updateData)
        .eq('id', periodId);

      if (error) throw error;

      fetchPeriods();
      onUpdate();
      toast.success('Period status updated!');
    } catch (error) {
      console.error('Error updating period status:', error);
      toast.error('Failed to update period status');
    }
  };

  const handleToggleDocumentCollected = async (docId: string, isCollected: boolean) => {
    try {
      const updateData: any = {
        is_collected: isCollected,
        updated_at: new Date().toISOString()
      };

      if (isCollected) {
        updateData.collected_at = new Date().toISOString();
      } else {
        updateData.collected_at = null;
      }

      const { error } = await supabase
        .from('work_recurring_period_documents')
        .update(updateData)
        .eq('id', docId);

      if (error) throw error;

      if (selectedPeriod) {
        fetchPeriodDocuments(selectedPeriod);
      }
      toast.success(isCollected ? 'Document marked as collected!' : 'Document marked as not collected');
    } catch (error) {
      console.error('Error updating document:', error);
      toast.error('Failed to update document');
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

  const handleGenerateNextPeriods = async () => {
    setGeneratingPeriods(true);
    try {
      const { data, error } = await supabase.rpc('generate_next_recurring_periods');

      if (error) throw error;

      if (data && data.length > 0) {
        toast.success(`Generated ${data.length} new period(s)!`);
        fetchPeriods();
        onUpdate();
      } else {
        toast.info('No new periods to generate. Latest periods are still active.');
      }
    } catch (error: any) {
      console.error('Error generating periods:', error);
      toast.error(error.message || 'Failed to generate periods');
    } finally {
      setGeneratingPeriods(false);
    }
  };

  const stats = {
    pending: periods.filter(p => p.status === 'pending').length,
    inProgress: periods.filter(p => p.status === 'in_progress').length,
    completed: periods.filter(p => p.status === 'completed').length,
    overdue: periods.filter(p =>
      p.status !== 'completed' && new Date(p.period_end_date) < new Date()
    ).length,
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-yellow-600" />
            <p className="text-xs font-medium text-yellow-900">Pending</p>
          </div>
          <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <PlayCircle size={16} className="text-blue-600" />
            <p className="text-xs font-medium text-blue-900">In Progress</p>
          </div>
          <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-xs font-medium text-green-900">Completed</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-red-600" />
            <p className="text-xs font-medium text-red-900">Overdue</p>
          </div>
          <p className="text-2xl font-bold text-red-700">{stats.overdue}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">Recurring Periods Management</h3>
          <p className="text-sm text-gray-600 mt-1">
            Pattern: <span className="font-medium capitalize">{work.recurrence_pattern}</span>
            {work.billing_amount && (
              <span className="ml-4">
                Default Billing: <span className="font-medium">₹{work.billing_amount.toLocaleString('en-IN')}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleGenerateNextPeriods}
            disabled={generatingPeriods}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            title="Generate next period for elapsed periods"
          >
            <RefreshCw size={18} className={generatingPeriods ? 'animate-spin' : ''} />
            <span>{generatingPeriods ? 'Generating...' : 'Generate Next'}</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowPeriodForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Plus size={18} />
            <span>Add Period</span>
          </button>
        </div>
      </div>

      {/* Periods List */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Periods */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">All Periods</h4>
          {periods.map(period => {
            // Get all tasks and sort by display order
            const allTasks = ((period as any).recurring_period_tasks || []).sort(
              (a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)
            );
            const incompleteTasks = allTasks.filter((t: any) => t.status !== 'completed');
            const completedTasks = allTasks.filter((t: any) => t.status === 'completed');
            const firstIncompleteTask = incompleteTasks[0];

            // Determine status text
            let statusText = '';
            let statusTaskName = '';
            if (period.status === 'completed') {
              statusText = 'Completed';
            } else if (incompleteTasks.length === 0 && allTasks.length > 0) {
              statusText = 'All Tasks Done';
            } else if (firstIncompleteTask) {
              const taskIndex = allTasks.findIndex((t: any) => t.id === firstIncompleteTask.id) + 1;
              statusText = period.status === 'in_progress' ? 'Processing' : 'Pending';
              statusTaskName = `Task ${taskIndex}: ${firstIncompleteTask.title}`;
            } else {
              statusText = period.status === 'in_progress' ? 'In Progress' : 'Pending';
            }

            const nextTaskDueDate = firstIncompleteTask?.due_date || null;
            const referenceDate = nextTaskDueDate || period.period_end_date;
            const isOverdue = period.status !== 'completed' && new Date(referenceDate) < new Date();
            const daysUntilDue = Math.ceil(
              (new Date(referenceDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={period.id}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selectedPeriod === period.id
                    ? 'border-orange-500 bg-orange-50'
                    : isOverdue
                    ? 'border-red-300 bg-red-50 hover:border-red-400'
                    : 'border-gray-200 bg-white hover:border-orange-300'
                }`}
                onClick={() => setSelectedPeriod(period.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h5 className="font-semibold text-gray-900">{period.period_name}</h5>
                      {period.billing_amount && (
                        <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-semibold flex items-center gap-1">
                          <DollarSign size={12} />
                          ₹{period.billing_amount.toLocaleString('en-IN')}
                        </span>
                      )}
                      {isOverdue && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Overdue
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar size={14} className="text-blue-500" />
                        <span className="font-medium text-gray-700">Period:</span>
                        <span>{formatDateDisplay(period.period_start_date)} to {formatDateDisplay(period.period_end_date)}</span>
                      </div>

                      {/* Status with Task Info */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
                            period.status === 'completed'
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : period.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700 border-blue-200'
                              : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}
                        >
                          {statusText}
                        </span>
                        {statusTaskName && (
                          <span className="text-xs text-gray-600 font-medium">{statusTaskName}</span>
                        )}
                      </div>

                      {/* Task Progress */}
                      {allTasks.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <ListTodo size={13} className="text-blue-500" />
                          <span className="text-gray-600">
                            <span className="font-semibold text-green-600">{completedTasks.length}</span>
                            <span className="text-gray-500"> / </span>
                            <span className="font-semibold text-gray-700">{allTasks.length}</span>
                            <span className="text-gray-500"> tasks completed</span>
                          </span>
                          {incompleteTasks.length > 1 && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                              +{incompleteTasks.length - 1} pending
                            </span>
                          )}
                        </div>
                      )}

                      {/* Due Date Info */}
                      <div className="flex items-center gap-2">
                        <Clock size={14} className={isOverdue ? 'text-red-500' : 'text-gray-500'} />
                        <span className="font-medium text-gray-700">{nextTaskDueDate ? 'Next Due' : 'End'}:</span>
                        <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {formatDateDisplay(referenceDate)}
                        </span>
                        {period.status !== 'completed' && (
                          daysUntilDue >= 0 ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              daysUntilDue === 0 ? 'bg-red-100 text-red-700' :
                              daysUntilDue <= 3 ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {daysUntilDue === 0 ? 'Due Today!' : `${daysUntilDue} ${daysUntilDue === 1 ? 'day' : 'days'}`}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              {Math.abs(daysUntilDue)} {Math.abs(daysUntilDue) === 1 ? 'day' : 'days'} overdue
                            </span>
                          )
                        )}
                      </div>

                      {period.is_billed && (
                        <div className="flex items-center gap-1 text-green-600 font-medium text-xs">
                          <CheckCircle size={14} />
                          Invoice Generated
                        </div>
                      )}
                      {period.completed_at && (
                        <div className="flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle size={14} />
                          Completed on {formatDateDisplay(period.completed_at.split('T')[0])}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditPeriodModal(period);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <select
                      value={period.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleUpdatePeriodStatus(period.id, e.target.value);
                      }}
                      className={`px-3 py-1 rounded-lg text-sm font-medium border-2 cursor-pointer ${
                        period.status === 'completed'
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : period.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePeriod(period.id);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {periods.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
              <Calendar size={56} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-900 font-semibold text-lg mb-2">No Recurring Periods Found</p>
              <div className="max-w-2xl mx-auto space-y-3 text-sm text-gray-600">
                <p>
                  Recurring periods should have been automatically created when this work was set up.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
                  <p className="font-semibold text-amber-900 mb-2">Possible reasons:</p>
                  <ul className="list-disc list-inside space-y-1 text-amber-800 ml-2">
                    <li>The work start date might be in the future</li>
                    <li>There might have been an issue during work creation</li>
                    <li>The recurrence pattern might not be properly configured</li>
                  </ul>
                </div>
                <p className="text-gray-700 font-medium mt-4">
                  Click <strong>"Add Period"</strong> above to manually create your first period.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Each period will automatically include tasks based on your service task templates.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Period Details (Tasks & Documents) */}
        <div className="space-y-3">
          {selectedPeriod ? (
            <>
              <div className="flex items-center gap-2 border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('tasks')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'tasks'
                      ? 'text-orange-600 border-b-2 border-orange-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ListTodo size={18} />
                    Tasks
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'documents'
                      ? 'text-orange-600 border-b-2 border-orange-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={18} />
                    Documents
                  </div>
                </button>
              </div>

              {activeTab === 'tasks' ? (
                <PeriodTaskManager
                  periodId={selectedPeriod}
                  periodName={periods.find(p => p.id === selectedPeriod)?.period_name || ''}
                  periodStatus={periods.find(p => p.id === selectedPeriod)?.status || ''}
                  onTasksUpdate={() => {
                    fetchPeriods();
                    onUpdate();
                  }}
                />
              ) : (
                periodDocuments.length > 0 ? (
                  <div className="space-y-2">
                    {periodDocuments.map(doc => (
                      <div
                        key={doc.id}
                        className={`border-2 rounded-lg p-3 ${
                          doc.work_documents.is_required && !doc.is_collected
                            ? 'border-red-300 bg-red-50'
                            : doc.is_collected
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h6 className="font-medium text-gray-900 text-sm">{doc.work_documents.name}</h6>
                              {doc.work_documents.is_required && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                  Required
                                </span>
                              )}
                              {doc.is_collected && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                                  <CheckSquare size={12} />
                                  Collected
                                </span>
                              )}
                            </div>
                            {doc.work_documents.description && (
                              <p className="text-xs text-gray-600 mt-1">{doc.work_documents.description}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              Category: {doc.work_documents.category}
                            </p>
                          </div>
                          <button
                            onClick={() => handleToggleDocumentCollected(doc.id, !doc.is_collected)}
                            className={`p-2 rounded-lg transition-colors ${
                              doc.is_collected
                                ? 'text-green-600 hover:bg-green-100'
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={doc.is_collected ? 'Mark as not collected' : 'Mark as collected'}
                          >
                            <CheckSquare size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600 text-sm">No documents for this period yet.</p>
                    <p className="text-gray-500 text-xs mt-2">
                      Documents are automatically copied from the work template when the period is created.
                    </p>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <ListTodo size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 text-sm">Select a period from the list to view tasks and documents</p>
            </div>
          )}
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
