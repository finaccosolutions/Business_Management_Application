import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Users, Clock, CheckSquare, Plus, FileText, DollarSign, Calendar, AlertCircle, CreditCard as Edit2, Briefcase, CheckCircle, Repeat, ArrowRightLeft, Trash2, Upload, History, Check, Download } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { formatDateDisplay } from '../lib/dateUtils';

interface WorkDetailsProps {
  workId: string;
  onClose: () => void;
  onUpdate: () => void;
  onEdit: () => void;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  estimated_hours: number | null;
  actual_hours: number;
  due_date: string | null;
  remarks: string | null;
  staff_members: { name: string } | null;
}

interface TimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  description: string | null;
  staff_members: { name: string };
}

interface Assignment {
  id: string;
  assigned_at: string;
  status: string;
  reassigned_from: string | null;
  reassignment_reason: string | null;
  staff_members: { name: string };
  from_staff?: { name: string } | null;
}

interface RecurringInstance {
  id: string;
  period_name: string;
  period_start_date: string;
  period_end_date: string;
  due_date: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  completed_by: string | null;
  staff_members: { name: string } | null;
  billing_amount: number | null;
  is_billed: boolean;
  invoice_id: string | null;
}

interface WorkDocument {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_required: boolean;
  is_collected: boolean;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  collected_at: string | null;
  uploaded_at: string | null;
  sort_order: number;
  created_at: string;
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  showInput?: boolean;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  inputPlaceholder?: string;
  inputLabel?: string;
}

function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
  showInput = false,
  inputValue = '',
  onInputChange,
  inputPlaceholder = '',
  inputLabel = '',
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      bg: 'bg-red-600',
      hoverBg: 'hover:bg-red-700',
      icon: 'text-red-600',
    },
    warning: {
      bg: 'bg-orange-600',
      hoverBg: 'hover:bg-orange-700',
      icon: 'text-orange-600',
    },
    info: {
      bg: 'bg-blue-600',
      hoverBg: 'hover:bg-blue-700',
      icon: 'text-blue-600',
    },
  };

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-scale-in">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className={`${styles.icon}`} size={24} />
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-gray-700">{message}</p>

          {showInput && (
            <div>
              {inputLabel && (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {inputLabel}
                </label>
              )}
              <textarea
                value={inputValue}
                onChange={(e) => onInputChange?.(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                rows={3}
                placeholder={inputPlaceholder}
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 px-4 py-2 ${styles.bg} text-white font-medium rounded-lg ${styles.hoverBg} transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

export default function WorkDetails({ workId, onClose, onUpdate, onEdit }: WorkDetailsProps) {
  const [work, setWork] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [recurringInstances, setRecurringInstances] = useState<RecurringInstance[]>([]);
  const [workDocuments, setWorkDocuments] = useState<WorkDocument[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReassignReason, setShowReassignReason] = useState(false);
  const [showEditTimeLogModal, setShowEditTimeLogModal] = useState(false);
  
  const [deleteTarget, setDeleteTarget] = useState<{type: string, id: string} | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const [selectedStaffForReassign, setSelectedStaffForReassign] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringInstance | null>(null);
  const [editingTimeLog, setEditingTimeLog] = useState<TimeLog | null>(null);

  const toast = useToast();

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    estimated_hours: '',
    due_date: '',
    priority: 'medium',
    remarks: '',
  });

  const [timeForm, setTimeForm] = useState({
    staff_member_id: '',
    start_time: new Date().toISOString().slice(0, 16),
    end_time: '',
    description: '',
  });

  const [recurringForm, setRecurringForm] = useState({
    period_name: '',
    period_start_date: '',
    period_end_date: '',
    due_date: '',
    billing_amount: '',
  });

  useEffect(() => {
    fetchWorkDetails();
    fetchStaff();
  }, [workId]);

  const fetchWorkDetails = async () => {
    try {
      const [workRes, tasksRes, timeLogsRes, assignmentsRes, recurringRes, documentsRes] = await Promise.all([
        // 1. Works query
        supabase
          .from('works')
          .select(`
            *,
            customers(name),
            services!works_service_id_fkey(name),
            staff_members(name)
          `)
          .eq('id', workId)
          .single(),

        // 2. Tasks query
        supabase
          .from('work_tasks')
          .select(`
            *,
            staff_members(name)
          `)
          .eq('work_id', workId)
          .order('sort_order'),

        // 3. Time logs query
        supabase
          .from('time_logs')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('start_time', { ascending: false }),

        // 4. Assignments query with proper aliasing for two relationships
        supabase
          .from('work_assignments')
          .select(`
            *,
            staff_members(name)
          `)
          .eq('work_id', workId)
          .order('assigned_at', { ascending: false }),

        // 5. Recurring instances query
        supabase
          .from('work_recurring_instances')
          .select(`
            *,
            staff_members(name)
          `)
          .eq('work_id', workId)
          .order('due_date', { ascending: false }),

        // 6. Work documents query
        supabase
          .from('work_documents')
          .select('*')
          .eq('work_id', workId)
          .order('sort_order'),
      ]);

      if (workRes.data) setWork(workRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (timeLogsRes.data) setTimeLogs(timeLogsRes.data);
      if (documentsRes.data) setWorkDocuments(documentsRes.data);

      if (assignmentsRes.data) {
        const enrichedAssignments = await Promise.all(
          assignmentsRes.data.map(async (assignment) => {
            if (assignment.reassigned_from) {
              const { data: fromStaff } = await supabase
                .from('staff_members')
                .select('name')
                .eq('id', assignment.reassigned_from)
                .maybeSingle();
              return { ...assignment, from_staff: fromStaff };
            }
            return assignment;
          })
        );
        setAssignments(enrichedAssignments);
      }

      if (recurringRes.data) setRecurringInstances(recurringRes.data);
    } catch (error) {
      console.error('Error fetching work details:', error);
      toast.error('Failed to load work details');
    } finally {
      setLoading(false);
    }
  };


  const fetchStaff = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, availability_status')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('work_tasks').insert({
        work_id: workId,
        title: taskForm.title,
        description: taskForm.description || null,
        assigned_to: taskForm.assigned_to || null,
        estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
        due_date: taskForm.due_date || null,
        priority: taskForm.priority,
        remarks: taskForm.remarks || null,
        status: 'pending',
      });

      if (error) throw error;
      
      setShowTaskModal(false);
      resetTaskForm();
      fetchWorkDetails();
      onUpdate();
      toast.success('Task created successfully!');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    }
  };

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    try {
      const { error } = await supabase
        .from('work_tasks')
        .update({
          title: taskForm.title,
          description: taskForm.description || null,
          assigned_to: taskForm.assigned_to || null,
          estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
          due_date: taskForm.due_date || null,
          priority: taskForm.priority,
          remarks: taskForm.remarks || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTask.id);

      if (error) throw error;

      setShowEditTaskModal(false);
      setEditingTask(null);
      resetTaskForm();
      fetchWorkDetails();
      onUpdate();
      toast.success('Task updated successfully!');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to || '',
      estimated_hours: task.estimated_hours?.toString() || '',
      due_date: task.due_date || '',
      priority: task.priority || 'medium',
      remarks: task.remarks || '',
    });
    setShowEditTaskModal(true);
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      assigned_to: '',
      estimated_hours: '',
      due_date: '',
      priority: 'medium',
      remarks: '',
    });
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const start = new Date(timeForm.start_time);
      const end = timeForm.end_time ? new Date(timeForm.end_time) : null;
      const duration = end ? (end.getTime() - start.getTime()) / (1000 * 60 * 60) : null;

      const { error } = await supabase.from('time_logs').insert({
        user_id: work.user_id,
        work_id: workId,
        staff_member_id: timeForm.staff_member_id,
        start_time: timeForm.start_time,
        end_time: timeForm.end_time || null,
        duration_hours: duration,
        description: timeForm.description || null,
        is_billable: true,
      });

      if (error) throw error;

      if (duration) {
        const { error: updateError } = await supabase.rpc('increment_work_hours', {
          work_id: workId,
          hours_to_add: duration,
        });
        if (updateError) console.error('Error updating work hours:', updateError);
      }

      setShowTimeModal(false);
      setTimeForm({
        staff_member_id: '',
        start_time: new Date().toISOString().slice(0, 16),
        end_time: '',
        description: '',
      });
      fetchWorkDetails();
      onUpdate();
      toast.success('Time logged successfully!');
    } catch (error) {
      console.error('Error logging time:', error);
      toast.error('Failed to log time');
    }
  };

  const handleEditTimeLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTimeLog) return;

    try {
      const start = new Date(timeForm.start_time);
      const end = timeForm.end_time ? new Date(timeForm.end_time) : null;
      const duration = end ? (end.getTime() - start.getTime()) / (1000 * 60 * 60) : null;

      const { error } = await supabase
        .from('time_logs')
        .update({
          staff_member_id: timeForm.staff_member_id,
          start_time: timeForm.start_time,
          end_time: timeForm.end_time || null,
          duration_hours: duration,
          description: timeForm.description || null,
        })
        .eq('id', editingTimeLog.id);

      if (error) throw error;

      setShowEditTimeLogModal(false);
      setEditingTimeLog(null);
      setTimeForm({
        staff_member_id: '',
        start_time: new Date().toISOString().slice(0, 16),
        end_time: '',
        description: '',
      });
      fetchWorkDetails();
      onUpdate();
      toast.success('Time log updated successfully!');
    } catch (error) {
      console.error('Error updating time log:', error);
      toast.error('Failed to update time log');
    }
  };

  const openEditTimeLogModal = (log: TimeLog) => {
    setEditingTimeLog(log);
    setTimeForm({
      staff_member_id: log.staff_members ? (staff.find(s => s.name === log.staff_members.name)?.id || '') : '',
      start_time: new Date(log.start_time).toISOString().slice(0, 16),
      end_time: log.end_time ? new Date(log.end_time).toISOString().slice(0, 16) : '',
      description: log.description || '',
    });
    setShowEditTimeLogModal(true);
  };

  const handleAssignStaff = async (staffId: string) => {
    try {
      await supabase
        .from('work_assignments')
        .update({ is_current: false })
        .eq('work_id', workId)
        .eq('is_current', true);

      const { error } = await supabase.from('work_assignments').insert({
        work_id: workId,
        staff_member_id: staffId,
        assigned_by: work.user_id,
        status: 'assigned',
        is_current: true,
      });

      if (error) throw error;

      await supabase
        .from('works')
        .update({
          assigned_to: staffId,
          assigned_date: new Date().toISOString(),
        })
        .eq('id', workId);

      setShowAssignModal(false);
      fetchWorkDetails();
      onUpdate();
      toast.success('Work assigned successfully!');
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    }
  };

  const handleReassignWithReason = async () => {
    if (!selectedStaffForReassign) return;

    try {
      const currentStaffId = work.assigned_to;

      await supabase
        .from('work_assignments')
        .update({ is_current: false })
        .eq('work_id', workId)
        .eq('is_current', true);

      const { error } = await supabase.from('work_assignments').insert({
        work_id: workId,
        staff_member_id: selectedStaffForReassign,
        assigned_by: work.user_id,
        reassigned_from: currentStaffId,
        reassignment_reason: reassignReason || null,
        status: 'assigned',
        is_current: true,
      });

      if (error) throw error;

      await supabase
        .from('works')
        .update({
          assigned_to: selectedStaffForReassign,
          assigned_date: new Date().toISOString(),
        })
        .eq('id', workId);

      setShowReassignReason(false);
      setShowAssignModal(false);
      setReassignReason('');
      setSelectedStaffForReassign('');
      fetchWorkDetails();
      onUpdate();
      toast.success('Work reassigned successfully!');
    } catch (error) {
      console.error('Error reassigning staff:', error);
      toast.error('Failed to reassign staff');
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('work_tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;

      const completedTasks = tasks.filter((t) => t.id === taskId || t.status === 'completed').length +
        (status === 'completed' ? 1 : 0);

      if (completedTasks === tasks.length && tasks.length > 0) {
        await supabase
          .from('works')
          .update({ status: 'completed', completion_date: new Date().toISOString() })
          .eq('id', workId);
      }

      fetchWorkDetails();
      onUpdate();
      toast.success('Task status updated!');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task status');
    }
  };

  const handleCreateRecurringInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('work_recurring_instances').insert({
        work_id: workId,
        period_name: recurringForm.period_name,
        period_start_date: recurringForm.period_start_date,
        period_end_date: recurringForm.period_end_date,
        due_date: recurringForm.due_date,
        billing_amount: recurringForm.billing_amount ? parseFloat(recurringForm.billing_amount) : null,
        status: 'pending',
      });

      if (error) throw error;

      setShowRecurringModal(false);
      setRecurringForm({
        period_name: '',
        period_start_date: '',
        period_end_date: '',
        due_date: '',
        billing_amount: '',
      });
      fetchWorkDetails();
      onUpdate();
      toast.success('Recurring period created successfully!');
    } catch (error) {
      console.error('Error creating recurring instance:', error);
      toast.error('Failed to create recurring period');
    }
  };

  const handleEditRecurringInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecurring) return;

    try {
      const { error } = await supabase
        .from('work_recurring_instances')
        .update({
          period_name: recurringForm.period_name,
          period_start_date: recurringForm.period_start_date,
          period_end_date: recurringForm.period_end_date,
          due_date: recurringForm.due_date,
          billing_amount: recurringForm.billing_amount ? parseFloat(recurringForm.billing_amount) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRecurring.id);

      if (error) throw error;

      setShowEditRecurringModal(false);
      setEditingRecurring(null);
      setRecurringForm({
        period_name: '',
        period_start_date: '',
        period_end_date: '',
        due_date: '',
        billing_amount: '',
      });
      fetchWorkDetails();
      onUpdate();
      toast.success('Recurring period updated successfully!');
    } catch (error) {
      console.error('Error updating recurring instance:', error);
      toast.error('Failed to update period');
    }
  };

  const openEditRecurringModal = (instance: RecurringInstance) => {
    setEditingRecurring(instance);
    setRecurringForm({
      period_name: instance.period_name,
      period_start_date: instance.period_start_date,
      period_end_date: instance.period_end_date,
      due_date: instance.due_date,
      billing_amount: instance.billing_amount?.toString() || '',
    });
    setShowEditRecurringModal(true);
  };

  const updateRecurringInstanceStatus = async (instanceId: string, status: string) => {
    try {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = work.assigned_to;
      }

      const { error } = await supabase
        .from('work_recurring_instances')
        .update(updateData)
        .eq('id', instanceId);

      if (error) throw error;
      fetchWorkDetails();
      onUpdate();
      toast.success('Period status updated!');
    } catch (error) {
      console.error('Error updating recurring instance:', error);
      toast.error('Failed to update period status');
    }
  };

  const confirmDelete = (type: string, id: string) => {
    setDeleteTarget({ type, id });
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      const { type, id } = deleteTarget;
      
      let error;
      if (type === 'task') {
        ({ error } = await supabase.from('work_tasks').delete().eq('id', id));
      } else if (type === 'recurring') {
        ({ error } = await supabase.from('work_recurring_instances').delete().eq('id', id));
      } else if (type === 'timelog') {
        ({ error } = await supabase.from('time_logs').delete().eq('id', id));
      }

      if (error) throw error;

      fetchWorkDetails();
      onUpdate();
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`);
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading || !work) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
    completed: 'bg-green-100 text-green-700 border-green-200',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: workDocuments.length },
    { id: 'time', label: 'Time Logs', icon: Clock, count: timeLogs.length },
    { id: 'assignments', label: 'Assignments', icon: Users, count: assignments.length },
  ];

  if (work.is_recurring) {
    tabs.push({
      id: 'recurring',
      label: 'Recurring Periods',
      icon: Repeat,
      count: recurringInstances.length
    });
  }

  tabs.push({
    id: 'activity',
    label: 'Activity Timeline',
    icon: History
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Briefcase size={28} />
              Work Details
            </h2>
            <p className="text-orange-100 text-sm mt-1">
              {work.customers?.name} • {work.services?.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {work.is_recurring && (
              <span className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg text-sm font-medium">
                <Repeat size={18} />
                Recurring Work
              </span>
            )}
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
            >
              <Edit2 size={18} />
              Edit
            </button>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span
              className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                statusColors[work.status] || 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {work.status.replace('_', ' ').charAt(0).toUpperCase() + work.status.replace('_', ' ').slice(1)}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                priorityColors[work.priority] || priorityColors.medium
              }`}
            >
              {work.priority.charAt(0).toUpperCase() + work.priority.slice(1)} Priority
            </span>
            {work.due_date && (
              <span className="text-sm text-gray-700 flex items-center gap-2">
                <Calendar size={14} />
                Due: {formatDateDisplay(work.due_date)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 p-6 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-gray-200 flex-shrink-0">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-orange-600" />
              <p className="text-xs font-medium text-gray-600">Time Tracked</p>
            </div>
            <p className="text-2xl font-bold text-orange-600">{work.actual_duration_hours || 0}h</p>
            {work.estimated_hours && (
              <p className="text-xs text-gray-500 mt-1">of {work.estimated_hours}h estimated</p>
            )}
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-xs font-medium text-gray-600">Tasks</p>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {tasks.filter((t) => t.status === 'completed').length}/{tasks.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">completed</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-blue-600" />
              <p className="text-xs font-medium text-gray-600">Assigned To</p>
            </div>
            <p className="text-lg font-semibold text-blue-600 truncate">
              {work.staff_members?.name || 'Unassigned'}
            </p>
            <button
              onClick={() => setShowAssignModal(true)}
              className="text-xs text-blue-600 hover:text-blue-700 mt-1 hover:underline"
            >
              {work.assigned_to ? 'Reassign' : 'Assign'}
            </button>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-teal-600" />
              <p className="text-xs font-medium text-gray-600">Billing Amount</p>
            </div>
            <p className="text-2xl font-bold text-teal-600">
              {work.billing_amount ? `₹${work.billing_amount.toLocaleString('en-IN')}` : 'N/A'}
            </p>
            <p className="text-xs text-gray-500 mt-1 capitalize">{work.billing_status?.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="flex gap-2 px-6 pt-4 border-b-2 border-gray-300 bg-white flex-shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-t-lg transition-all border-b-2 -mb-0.5 ${
                  activeTab === tab.id
                    ? 'bg-orange-50 text-orange-700 border-orange-600'
                    : 'text-gray-600 hover:bg-gray-50 border-transparent'
                }`}
              >
                <Icon size={18} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase size={20} className="text-orange-600" />
                  Work Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Title</label>
                    <p className="text-gray-900 font-medium mt-1">{work.title}</p>
                  </div>
                  {work.description && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Description</label>
                      <p className="text-gray-700 mt-1 whitespace-pre-wrap">{work.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Customer</label>
                      <p className="text-gray-900 mt-1">{work.customers?.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Service</label>
                      <p className="text-gray-900 mt-1">{work.services?.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Priority</label>
                      <p className="text-gray-900 mt-1 capitalize">{work.priority}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <p className="text-gray-900 mt-1 capitalize">{work.status.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 text-lg">Tasks & Subtasks</h3>
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Task</span>
                </button>
              </div>

              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">{task.title}</h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              priorityColors[task.priority] || priorityColors.medium
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
                          {task.staff_members && (
                            <span className="flex items-center gap-1">
                              <Users size={14} />
                              {task.staff_members.name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {formatDateDisplay(task.due_date)}
                            </span>
                          )}
                          {task.estimated_hours && (
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              Est: {task.estimated_hours}h
                            </span>
                          )}
                          {task.actual_hours > 0 && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <Clock size={14} />
                              Actual: {task.actual_hours}h
                            </span>
                          )}
                        </div>
                        {task.remarks && (
                          <p className="text-xs text-gray-500 mt-2 italic">{task.remarks}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditTaskModal(task)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit task"
                        >
                          <Edit2 size={16} />
                        </button>
                        <select
                          value={task.status}
                          onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                          className={`px-3 py-1 rounded-full text-sm font-medium border-0 cursor-pointer ${
                            task.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : task.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button
                          onClick={() => confirmDelete('task', task.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete task"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {tasks.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <CheckSquare size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No tasks yet. Add your first task to get started.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'time' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 text-lg">Time Logs</h3>
                <button
                  onClick={() => setShowTimeModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Time</span>
                </button>
              </div>

              <div className="space-y-3">
                {timeLogs.map((log) => (
                  <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{log.staff_members.name}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(log.start_time).toLocaleString()}
                          {log.end_time && ` - ${new Date(log.end_time).toLocaleString()}`}
                        </p>
                        {log.description && <p className="text-sm text-gray-600 mt-1">{log.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {log.duration_hours && (
                          <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                            {log.duration_hours.toFixed(2)}h
                          </span>
                        )}
                        <button
                          onClick={() => openEditTimeLogModal(log)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit time log"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => confirmDelete('timelog', log.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete time log"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {timeLogs.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <Clock size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No time logged yet. Start tracking time for this work.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 text-lg">Assignment History</h3>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{work.assigned_to ? 'Reassign' : 'Assign'}</span>
                </button>
              </div>

              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{assignment.staff_members.name}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          Assigned: {new Date(assignment.assigned_at).toLocaleString()}
                        </p>
                        {assignment.reassigned_from && assignment.from_staff && (
                          <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                            <ArrowRightLeft size={14} />
                            <span>Reassigned from: {assignment.from_staff.name}</span>
                          </div>
                        )}
                        {assignment.reassignment_reason && (
                          <p className="text-sm text-gray-500 mt-1 italic">
                            Reason: {assignment.reassignment_reason}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          assignment.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {assignment.status}
                      </span>
                    </div>
                  </div>
                ))}

                {assignments.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <Users size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No assignments yet. Assign this work to a staff member.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 text-lg">Documents Checklist</h3>
                <div className="text-sm text-gray-600">
                  {workDocuments.filter(d => d.is_collected).length} of {workDocuments.length} collected
                </div>
              </div>

              {workDocuments.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No documents required for this work</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Documents will appear here if they are defined in the service
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`bg-white border-2 rounded-xl p-4 transition-colors ${
                        doc.is_collected ? 'border-green-200 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <button
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('work_documents')
                                    .update({ is_collected: !doc.is_collected })
                                    .eq('id', doc.id);
                                  if (error) throw error;
                                  fetchWorkDetails();
                                  onUpdate();
                                  toast.success(doc.is_collected ? 'Marked as not collected' : 'Marked as collected');
                                } catch (error) {
                                  console.error('Error updating document:', error);
                                  toast.error('Failed to update document');
                                }
                              }}
                              className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                doc.is_collected
                                  ? 'bg-green-600 border-green-600'
                                  : 'border-gray-300 hover:border-green-500'
                              }`}
                            >
                              {doc.is_collected && <Check size={14} className="text-white" />}
                            </button>
                            <h4 className={`font-medium ${doc.is_collected ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                              {doc.name}
                            </h4>
                            {doc.is_required && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                Required
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {doc.category}
                            </span>
                          </div>
                          {doc.description && (
                            <p className="text-sm text-gray-600 ml-9">{doc.description}</p>
                          )}
                          {doc.collected_at && (
                            <p className="text-xs text-green-600 ml-9 mt-1">
                              Collected: {new Date(doc.collected_at).toLocaleString('en-IN')}
                            </p>
                          )}
                          {doc.file_url && (
                            <div className="flex items-center gap-2 ml-9 mt-2">
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                              >
                                <Download size={14} />
                                View Uploaded File
                              </a>
                              {doc.uploaded_at && (
                                <span className="text-xs text-gray-500">
                                  Uploaded: {formatDateDisplay(doc.uploaded_at)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`file-${doc.id}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Upload document"
                          >
                            <Upload size={16} />
                            <input
                              id={`file-${doc.id}`}
                              type="file"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                try {
                                  const fileExt = file.name.split('.').pop();
                                  const fileName = `${doc.id}-${Date.now()}.${fileExt}`;
                                  const filePath = `work-documents/${work.user_id}/${fileName}`;

                                  const { error: uploadError } = await supabase.storage
                                    .from('documents')
                                    .upload(filePath, file);

                                  if (uploadError) throw uploadError;

                                  const { data: { publicUrl } } = supabase.storage
                                    .from('documents')
                                    .getPublicUrl(filePath);

                                  const { error: updateError } = await supabase
                                    .from('work_documents')
                                    .update({
                                      file_url: publicUrl,
                                      file_type: file.type,
                                      file_size: file.size,
                                      is_collected: true,
                                    })
                                    .eq('id', doc.id);

                                  if (updateError) throw updateError;

                                  fetchWorkDetails();
                                  onUpdate();
                                  toast.success('Document uploaded successfully');
                                } catch (error) {
                                  console.error('Error uploading document:', error);
                                  toast.error('Failed to upload document');
                                }
                              }}
                            />
                          </label>
                          <button
                            onClick={async () => {
                              if (!confirm('Are you sure you want to delete this document?')) return;
                              try {
                                const { error } = await supabase
                                  .from('work_documents')
                                  .delete()
                                  .eq('id', doc.id);
                                if (error) throw error;
                                fetchWorkDetails();
                                onUpdate();
                                toast.success('Document deleted successfully');
                              } catch (error) {
                                console.error('Error deleting document:', error);
                                toast.error('Failed to delete document');
                              }
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete document"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'recurring' && work.is_recurring && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 text-lg">Recurring Periods</h3>
                <button
                  onClick={() => setShowRecurringModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Period</span>
                </button>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Repeat className="w-5 h-5 text-orange-600" />
                  <p className="font-medium text-orange-900">Recurring Work Pattern</p>
                </div>
                <div className="text-sm text-gray-700">
                  <p>Pattern: <span className="font-medium capitalize">{work.recurrence_pattern}</span></p>
                  {work.recurrence_day && (
                    <p>Due Day: <span className="font-medium">{work.recurrence_day} of each period</span></p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {recurringInstances.map((instance) => (
                  <div key={instance.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{instance.period_name}</h4>
                          {instance.billing_amount && (
                            <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-sm font-semibold">
                              ₹{instance.billing_amount.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 mt-2 text-sm text-gray-600">
                          <p>Period: {formatDateDisplay(instance.period_start_date)} - {formatDateDisplay(instance.period_end_date)}</p>
                          <p className="flex items-center gap-1">
                            <Calendar size={14} />
                            Due: {formatDateDisplay(instance.due_date)}
                          </p>
                          {instance.completed_at && (
                            <p className="flex items-center gap-1 text-green-600">
                              <CheckCircle size={14} />
                              Completed: {formatDateDisplay(instance.completed_at)}
                              {instance.staff_members && ` by ${instance.staff_members.name}`}
                            </p>
                          )}
                          {instance.is_billed && (
                            <p className="flex items-center gap-1 text-emerald-600 font-medium">
                              <DollarSign size={14} />
                              Invoice Generated
                            </p>
                          )}
                          {instance.notes && (
                            <p className="text-gray-500 italic mt-1">{instance.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditRecurringModal(instance)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit period"
                        >
                          <Edit2 size={16} />
                        </button>
                        <select
                          value={instance.status}
                          onChange={(e) => updateRecurringInstanceStatus(instance.id, e.target.value)}
                          className={`px-3 py-1 rounded-full text-sm font-medium border-0 cursor-pointer ${
                            instance.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : instance.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button
                          onClick={() => confirmDelete('recurring', instance.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete period"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {recurringInstances.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <Repeat size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No recurring periods yet. Add periods to track them.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-lg">Activity Timeline</h3>
                <p className="text-sm text-gray-600">Complete history of work activities</p>
              </div>
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                <div className="space-y-6">
                  <div className="relative flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center z-10">
                      <CheckCircle size={20} />
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                      <h4 className="font-semibold text-gray-900">Work Created</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(work.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {work.assigned_to && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center z-10">
                        <Users size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">Work Assigned</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Assigned to {work.staff_members?.name}
                        </p>
                      </div>
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center z-10">
                        <CheckSquare size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">Tasks Progress</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {tasks.filter(t => t.status === 'completed').length} of {tasks.length} tasks completed
                        </p>
                      </div>
                    </div>
                  )}

                  {timeLogs.length > 0 && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center z-10">
                        <Clock size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">Time Tracked</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Total {work.actual_duration_hours || 0} hours logged across {timeLogs.length} entries
                        </p>
                      </div>
                    </div>
                  )}

                  {work.status === 'completed' && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center z-10">
                        <CheckCircle size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">Work Completed</h4>
                        {work.completion_date && (
                          <p className="text-sm text-gray-600 mt-1">
                            Completed on {formatDateDisplay(work.completion_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white">Add New Task</h3>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Task title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
                  <select
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Est. Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={taskForm.estimated_hours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                <textarea
                  value={taskForm.remarks}
                  onChange={(e) => setTaskForm({ ...taskForm, remarks: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  rows={2}
                  placeholder="Any additional notes or instructions"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditTaskModal && editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Edit2 size={24} />
                Edit Task
              </h3>
            </div>
            <form onSubmit={handleEditTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Task title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Task description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
                  <select
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Est. Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={taskForm.estimated_hours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                <textarea
                  value={taskForm.remarks}
                  onChange={(e) => setTaskForm({ ...taskForm, remarks: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="Any additional notes or instructions"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditTaskModal(false);
                    setEditingTask(null);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Update Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Time Log Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white">Log Time</h3>
            </div>
            <form onSubmit={handleLogTime} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Staff Member <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={timeForm.staff_member_id}
                  onChange={(e) => setTimeForm({ ...timeForm, staff_member_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select staff member</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={timeForm.start_time}
                    onChange={(e) => setTimeForm({ ...timeForm, start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input
                    type="datetime-local"
                    value={timeForm.end_time}
                    onChange={(e) => setTimeForm({ ...timeForm, end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={timeForm.description}
                  onChange={(e) => setTimeForm({ ...timeForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  rows={2}
                  placeholder="What did you work on?"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTimeModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Log Time
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Time Log Modal */}
      {showEditTimeLogModal && editingTimeLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Edit2 size={24} />
                Edit Time Log
              </h3>
            </div>
            <form onSubmit={handleEditTimeLog} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Staff Member <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={timeForm.staff_member_id}
                  onChange={(e) => setTimeForm({ ...timeForm, staff_member_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select staff member</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={timeForm.start_time}
                    onChange={(e) => setTimeForm({ ...timeForm, start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input
                    type="datetime-local"
                    value={timeForm.end_time}
                    onChange={(e) => setTimeForm({ ...timeForm, end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={timeForm.description}
                  onChange={(e) => setTimeForm({ ...timeForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="What did you work on?"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditTimeLogModal(false);
                    setEditingTimeLog(null);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Update Time Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Staff Modal */}
      {showAssignModal && !showReassignReason && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Users size={24} />
                {work.assigned_to ? 'Reassign Work' : 'Assign Work'}
              </h3>
              {work.assigned_to && work.staff_members && (
                <p className="text-orange-100 text-sm mt-1">
                  Currently assigned to: {work.staff_members.name}
                </p>
              )}
            </div>
            <div className="p-6 space-y-2 max-h-96 overflow-y-auto">
              {staff.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={48} className="mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-600">No active staff members available</p>
                  <p className="text-sm text-gray-500 mt-1">Add staff members first</p>
                </div>
              ) : (
                staff.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (work.assigned_to && s.id !== work.assigned_to) {
                        setSelectedStaffForReassign(s.id);
                        setShowReassignReason(true);
                      } else if (!work.assigned_to) {
                        handleAssignStaff(s.id);
                      }
                    }}
                    disabled={s.id === work.assigned_to}
                    className={`w-full px-4 py-3 text-left border border-gray-200 rounded-lg transition-all font-medium ${
                      s.id === work.assigned_to
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'hover:border-orange-500 hover:bg-orange-50 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{s.name}</span>
                      {s.id === work.assigned_to && (
                        <span className="text-xs bg-gray-200 px-2 py-1 rounded">Current</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassignment Reason Modal */}
      {showReassignReason && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white">Reassignment Reason</h3>
              <p className="text-orange-100 text-sm mt-1">
                Provide a reason for reassignment (optional)
              </p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Reassignment
              </label>
              <textarea
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                rows={4}
                placeholder="e.g., Staff member on leave, workload balancing, expertise match..."
              />
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowReassignReason(false);
                  setReassignReason('');
                  setSelectedStaffForReassign('');
                }}
                className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReassignWithReason}
                className="flex-1 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors"
              >
                Confirm Reassignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recurring Instance Modal */}
      {showRecurringModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white">Add Recurring Period</h3>
            </div>
            <form onSubmit={handleCreateRecurringInstance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Period Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={recurringForm.period_name}
                  onChange={(e) => setRecurringForm({ ...recurringForm, period_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., January 2024, Q1 2024"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period Start <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recurringForm.period_start_date}
                    onChange={(e) => setRecurringForm({ ...recurringForm, period_start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period End <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recurringForm.period_end_date}
                    onChange={(e) => setRecurringForm({ ...recurringForm, period_end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recurringForm.due_date}
                    onChange={(e) => setRecurringForm({ ...recurringForm, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={recurringForm.billing_amount}
                    onChange={(e) => setRecurringForm({ ...recurringForm, billing_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> If billing amount is not specified, it will use the work's default billing amount when generating invoice.
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRecurringModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Add Period
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Recurring Period Modal */}
      {showEditRecurringModal && editingRecurring && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Edit2 size={24} />
                Edit Recurring Period
              </h3>
            </div>
            <form onSubmit={handleEditRecurringInstance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Period Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={recurringForm.period_name}
                  onChange={(e) => setRecurringForm({ ...recurringForm, period_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., January 2024, Q1 2024"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period Start <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recurringForm.period_start_date}
                    onChange={(e) =>
                      setRecurringForm({ ...recurringForm, period_start_date: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period End <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recurringForm.period_end_date}
                    onChange={(e) =>
                      setRecurringForm({ ...recurringForm, period_end_date: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recurringForm.due_date}
                    onChange={(e) => setRecurringForm({ ...recurringForm, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={recurringForm.billing_amount}
                    onChange={(e) => setRecurringForm({ ...recurringForm, billing_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> If billing amount is not specified, it will use the work's default billing amount when generating invoice.
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditRecurringModal(false);
                    setEditingRecurring(null);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Update Period
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Confirm Deletion"
        message={`Are you sure you want to delete this ${deleteTarget?.type}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
