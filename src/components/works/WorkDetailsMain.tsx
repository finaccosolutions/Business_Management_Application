import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Users, Clock, CheckSquare, FileText, DollarSign, Calendar, Briefcase, CheckCircle, Repeat, Edit2, Activity as ActivityIcon } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { formatDateDisplay } from '../../lib/dateUtils';
import { WorkDetailsProps, Task, TimeLog, Assignment, RecurringInstance, Activity, WorkDocument, TaskForm, TimeForm, RecurringForm, statusColors, priorityColors } from './WorkDetailsTypes';
import { OverviewTab, TasksTab, TimeLogsTab, AssignmentsTab, RecurringTab, ActivityTab, DocumentsTab } from './WorkDetailsTabs';
import { ConfirmationModal, TaskModal, TimeLogModal, RecurringPeriodModal, AssignStaffModal, ReassignReasonModal } from './WorkDetailsModals';

export default function WorkDetails({ workId, onClose, onUpdate, onEdit }: WorkDetailsProps) {
  const [work, setWork] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [recurringInstances, setRecurringInstances] = useState<RecurringInstance[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
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
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showEditDocumentModal, setShowEditDocumentModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<WorkDocument | null>(null);
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{type: string, id: string} | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const [selectedStaffForReassign, setSelectedStaffForReassign] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringInstance | null>(null);
  const [editingTimeLog, setEditingTimeLog] = useState<TimeLog | null>(null);

  const toast = useToast();

  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '',
    description: '',
    assigned_to: '',
    estimated_hours: '',
    due_date: '',
    priority: 'medium',
    remarks: '',
  });

  const [timeForm, setTimeForm] = useState<TimeForm>({
    staff_member_id: '',
    start_time: new Date().toISOString().slice(0, 16),
    end_time: '',
    description: '',
  });

  const [recurringForm, setRecurringForm] = useState<RecurringForm>({
    period_name: '',
    period_start_date: '',
    period_end_date: '',
    due_date: '',
    billing_amount: '',
    notes: '',
  });

  useEffect(() => {
    fetchWorkDetails();
    fetchStaff();
    fetchActivities();
  }, [workId]);

  useEffect(() => {
    if (work && work.is_recurring && recurringInstances.length > 0) {
      checkAndCreateNextPeriod();
    }
  }, [work, recurringInstances]);

  const fetchWorkDetails = async () => {
    try {
      const [workRes, tasksRes, timeLogsRes, assignmentsRes, recurringRes, documentsRes] = await Promise.all([
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

        supabase
          .from('work_tasks')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('sort_order'),

        supabase
          .from('time_logs')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('start_time', { ascending: false }),

        supabase
          .from('work_assignments')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('assigned_at', { ascending: false }),

        supabase
          .from('work_recurring_instances')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('due_date', { ascending: false }),

        supabase
          .from('work_documents')
          .select('*')
          .eq('work_id', workId)
          .order('sort_order'),
      ]);

      if (workRes.data) setWork(workRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (timeLogsRes.data) setTimeLogs(timeLogsRes.data);
      if (documentsRes.data) setDocuments(documentsRes.data);

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

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('work_activities')
        .select(`
          id,
          activity_type,
          title,
          description,
          metadata,
          created_at,
          staff_members:created_by_staff_id(name)
        `)
        .eq('work_id', workId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedActivities: Activity[] = (data || []).map(activity => ({
        id: activity.id,
        type: activity.activity_type as Activity['type'],
        title: activity.title,
        description: activity.description,
        timestamp: activity.created_at,
        user: activity.staff_members?.name || 'System',
        metadata: activity.metadata
      }));

      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const checkAndCreateNextPeriod = async () => {
    if (!work || !work.is_recurring) return;

    try {
      const sortedPeriods = [...recurringInstances].sort((a, b) =>
        new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
      );

      if (sortedPeriods.length === 0) return;

      const latestPeriod = sortedPeriods[0];
      const latestDueDate = new Date(latestPeriod.due_date);
      const today = new Date();

      if (latestDueDate < today || latestPeriod.status === 'completed') {
        const nextDueDate = calculateNextDueDate(latestDueDate, work.recurrence_pattern, work.recurrence_day);

        const existingNextPeriod = recurringInstances.find(p => {
          const pDate = new Date(p.due_date);
          return pDate.getTime() === nextDueDate.getTime();
        });

        if (!existingNextPeriod) {
          await createNextRecurringPeriod(nextDueDate);
        }
      }
    } catch (error) {
      console.error('Error checking/creating next period:', error);
    }
  };

  const calculateNextDueDate = (currentDueDate: Date, pattern: string, recurrenceDay: number): Date => {
    const nextDate = new Date(currentDueDate);

    if (pattern === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (pattern === 'quarterly') {
      nextDate.setMonth(nextDate.getMonth() + 3);
    } else if (pattern === 'half_yearly') {
      nextDate.setMonth(nextDate.getMonth() + 6);
    } else if (pattern === 'yearly') {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }

    if (recurrenceDay) {
      nextDate.setDate(recurrenceDay);
    }

    return nextDate;
  };

  const createNextRecurringPeriod = async (dueDate: Date) => {
    try {
      let periodStart: Date;
      let periodEnd: Date;
      let periodName: string;

      const pattern = work.recurrence_pattern;

      if (pattern === 'monthly') {
        periodStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
        periodEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0);
        periodName = `${periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      } else if (pattern === 'quarterly') {
        const quarter = Math.floor(dueDate.getMonth() / 3);
        periodStart = new Date(dueDate.getFullYear(), quarter * 3, 1);
        periodEnd = new Date(dueDate.getFullYear(), quarter * 3 + 3, 0);
        periodName = `Q${quarter + 1} ${dueDate.getFullYear()}`;
      } else if (pattern === 'half_yearly') {
        const half = Math.floor(dueDate.getMonth() / 6);
        periodStart = new Date(dueDate.getFullYear(), half * 6, 1);
        periodEnd = new Date(dueDate.getFullYear(), half * 6 + 6, 0);
        periodName = `H${half + 1} ${dueDate.getFullYear()}`;
      } else {
        periodStart = new Date(dueDate.getFullYear(), 0, 1);
        periodEnd = new Date(dueDate.getFullYear(), 11, 31);
        periodName = `Year ${dueDate.getFullYear()}`;
      }

      const { error } = await supabase.from('work_recurring_instances').insert({
        work_id: workId,
        period_name: periodName,
        period_start_date: periodStart.toISOString().split('T')[0],
        period_end_date: periodEnd.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        billing_amount: work.billing_amount,
        status: 'pending',
      });

      if (error) throw error;

      console.log(`Auto-created next recurring period: ${periodName}`);
      fetchWorkDetails();
      toast.success(`Next period created: ${periodName}`);
    } catch (error) {
      console.error('Error creating next recurring period:', error);
    }
  };

  const handleUpdateWorkStatus = async (status: string) => {
    try {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'completed') {
        updateData.completion_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('works')
        .update(updateData)
        .eq('id', workId);

      if (error) throw error;
      await fetchWorkDetails();
      onUpdate();
      toast.success('Work status updated!');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  // Task operations
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

  const handleUpdateTask = async (e: React.FormEvent) => {
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

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
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

  // Time log operations
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

  const handleUpdateTimeLog = async (e: React.FormEvent) => {
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
      staff_member_id: log.staff_member_id || '',
      start_time: new Date(log.start_time).toISOString().slice(0, 16),
      end_time: log.end_time ? new Date(log.end_time).toISOString().slice(0, 16) : '',
      description: log.description || '',
    });
    setShowEditTimeLogModal(true);
  };

  // Assignment operations
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

  // Recurring instance operations
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
        notes: recurringForm.notes || null,
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
        notes: '',
      });
      fetchWorkDetails();
      onUpdate();
      toast.success('Recurring period created successfully!');
    } catch (error) {
      console.error('Error creating recurring instance:', error);
      toast.error('Failed to create recurring period');
    }
  };

  const handleUpdateRecurringInstance = async (e: React.FormEvent) => {
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
          notes: recurringForm.notes || null,
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
        notes: '',
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
      notes: instance.notes || '',
    });
    setShowEditRecurringModal(true);
  };

  const handleUpdateRecurringInstanceStatus = async (instanceId: string, status: string) => {
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

      if (status === 'completed' && work.auto_bill) {
        const instance = recurringInstances.find(i => i.id === instanceId);
        if (instance && instance.billing_amount) {
          await createInvoiceForPeriod(instanceId, instance);
        }
      }

      fetchWorkDetails();
      onUpdate();
      toast.success('Period status updated!');
    } catch (error) {
      console.error('Error updating recurring instance:', error);
      toast.error('Failed to update period status');
    }
  };

  const createInvoiceForPeriod = async (instanceId: string, instance: RecurringInstance) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: invoiceCount } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const count = invoiceCount || 0;
      const invoiceNumber = `INV-${String(count + 1).padStart(4, '0')}`;

      const taxRate = 18;
      const subtotal = instance.billing_amount || 0;
      const taxAmount = (subtotal * taxRate) / 100;
      const totalAmount = subtotal + taxAmount;

      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);

      const invoiceData = {
        user_id: user.id,
        customer_id: work.customer_id,
        work_id: workId,
        invoice_number: invoiceNumber,
        invoice_date: today.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'draft',
        notes: `Auto-generated invoice for ${instance.period_name}`,
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const invoiceItem = {
        invoice_id: invoice.id,
        description: `${work.services?.name || 'Service'} - ${instance.period_name}`,
        quantity: 1,
        unit_price: subtotal,
        amount: totalAmount,
      };

      const { error: itemError } = await supabase
        .from('invoice_items')
        .insert(invoiceItem);

      if (itemError) throw itemError;

      await supabase
        .from('work_recurring_instances')
        .update({ is_billed: true, invoice_id: invoice.id })
        .eq('id', instanceId);

      toast.success(`Invoice ${invoiceNumber} created successfully!`);
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Failed to create invoice');
    }
  };

  // Document Management
  const handleToggleDocumentCollected = async (documentId: string, isCollected: boolean) => {
    try {
      const { error } = await supabase
        .from('work_documents')
        .update({
          is_collected: isCollected,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (error) throw error;

      fetchWorkDetails();
      toast.success(`Document marked as ${isCollected ? 'collected' : 'not collected'}!`);
    } catch (error) {
      console.error('Error updating document:', error);
      toast.error('Failed to update document');
    }
  };

  const handleUploadDocument = (documentId: string) => {
    setUploadingDocumentId(documentId);
    toast.info('File upload functionality will be implemented with storage integration');
  };

  const handleEditDocument = (document: WorkDocument) => {
    setEditingDocument(document);
    setShowEditDocumentModal(true);
  };

  const handleDeleteDocument = async (documentId: string) => {
    confirmDelete('document', documentId);
  };

  // Delete operations
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
      } else if (type === 'document') {
        ({ error } = await supabase.from('work_documents').delete().eq('id', id));
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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Briefcase },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks.length },
    { id: 'time', label: 'Time Logs', icon: Clock, count: timeLogs.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
  ];

  if (work.is_recurring) {
    tabs.push({
      id: 'recurring',
      label: 'Recurring Periods',
      icon: Repeat,
      count: recurringInstances.length
    });
  }

  tabs.push({ id: 'activity', label: 'Activity Timeline', icon: ActivityIcon, count: activities.length });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600 flex-shrink-0">
          <div>
            <h2 className="text-3xl font-bold text-white">
              {work.title}
            </h2>
            <p className="text-orange-100 text-base mt-2 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Users size={16} />
                {work.customers?.name}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Briefcase size={16} />
                {work.services?.name}
              </span>
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

        <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50 flex-shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 font-medium rounded-t-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-orange-700 shadow-sm border-t-2 border-orange-600'
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <Icon size={18} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab work={work} onStatusChange={handleUpdateWorkStatus} />
          )}

          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              onAddTask={() => setShowTaskModal(true)}
              onEditTask={openEditTaskModal}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onDeleteTask={(id) => confirmDelete('task', id)}
            />
          )}

          {activeTab === 'time' && (
            <TimeLogsTab
              timeLogs={timeLogs}
              onAddTimeLog={() => setShowTimeModal(true)}
              onEditTimeLog={openEditTimeLogModal}
              onDeleteTimeLog={(id) => confirmDelete('timelog', id)}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab
              documents={documents}
              onAddDocument={() => setShowDocumentModal(true)}
              onEditDocument={handleEditDocument}
              onDeleteDocument={handleDeleteDocument}
              onToggleCollected={handleToggleDocumentCollected}
              onUploadFile={handleUploadDocument}
            />
          )}

          {activeTab === 'recurring' && work.is_recurring && (
            <RecurringTab
              workId={workId}
              work={work}
              onUpdate={() => {
                fetchWorkDetails();
                onUpdate();
              }}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityTab activities={activities} />
          )}
        </div>
      </div>

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

      <TaskModal
        isOpen={showTaskModal || showEditTaskModal}
        onClose={() => {
          setShowTaskModal(false);
          setShowEditTaskModal(false);
          setEditingTask(null);
          resetTaskForm();
        }}
        onSubmit={editingTask ? handleUpdateTask : handleCreateTask}
        form={taskForm}
        setForm={setTaskForm}
        staff={staff}
        isEditing={!!editingTask}
      />

      <TimeLogModal
        isOpen={showTimeModal || showEditTimeLogModal}
        onClose={() => {
          setShowTimeModal(false);
          setShowEditTimeLogModal(false);
          setEditingTimeLog(null);
        }}
        onSubmit={editingTimeLog ? handleUpdateTimeLog : handleLogTime}
        form={timeForm}
        setForm={setTimeForm}
        staff={staff}
        isEditing={!!editingTimeLog}
      />

      <RecurringPeriodModal
        isOpen={showRecurringModal || showEditRecurringModal}
        onClose={() => {
          setShowRecurringModal(false);
          setShowEditRecurringModal(false);
          setEditingRecurring(null);
        }}
        onSubmit={editingRecurring ? handleUpdateRecurringInstance : handleCreateRecurringInstance}
        form={recurringForm}
        setForm={setRecurringForm}
        isEditing={!!editingRecurring}
      />

      <AssignStaffModal
        isOpen={showAssignModal && !showReassignReason}
        onClose={() => setShowAssignModal(false)}
        staff={staff}
        work={work}
        onAssign={handleAssignStaff}
        onRequestReassign={(staffId) => {
          setSelectedStaffForReassign(staffId);
          setShowReassignReason(true);
        }}
      />

      <ReassignReasonModal
        isOpen={showReassignReason}
        onClose={() => {
          setShowReassignReason(false);
          setReassignReason('');
          setSelectedStaffForReassign('');
        }}
        reason={reassignReason}
        setReason={setReassignReason}
        onConfirm={handleReassignWithReason}
      />
    </div>
  );
}
