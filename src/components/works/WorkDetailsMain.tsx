import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, ShieldAlert, Edit2, Activity as ActivityIcon, MessageSquare, StickyNote, Repeat, DollarSign, Briefcase, Users, Clock, CheckSquare, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { WorkDetailsProps, Task, TimeLog, RecurringInstance, Activity, WorkDocument, TaskForm, TimeForm } from './WorkDetailsTypes';
import { OverviewTab, TasksTab, TimeLogsTab, RecurringTab, ActivityTab, DocumentsTab } from './WorkDetailsTabs';
import { CommunicationsTab } from './CommunicationsTab';
import { NotesTab } from './NotesTab';
import { ConfirmationModal, TaskModal, TimeLogModal, AssignStaffModal, ReassignReasonModal } from './WorkDetailsModals';


export default function WorkDetails({ workId, onBack, onUpdate, onEdit, onNavigateToCustomer, onNavigateToService }: WorkDetailsProps) {
  const { user, permissions, role } = useAuth();
  const isAdmin = role === 'admin';
  const [work, setWork] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);

  const [recurringInstances, setRecurringInstances] = useState<RecurringInstance[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [communications, setCommunications] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReassignReason, setShowReassignReason] = useState(false);
  const [showEditTimeLogModal, setShowEditTimeLogModal] = useState(false);


  const [deleteTarget, setDeleteTarget] = useState<{ type: string, id: string } | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const [selectedStaffForReassign, setSelectedStaffForReassign] = useState('');


  const [editingTask, setEditingTask] = useState<Task | null>(null);
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



  useEffect(() => {
    fetchWorkDetails();
    fetchStaff();
    fetchActivities();
  }, [workId]);

  const fetchWorkDetails = async () => {
    try {
      const [workRes, periodGenRes, tasksRes, timeLogsRes, , recurringRes, documentsRes, communicationsRes, notesRes] = await Promise.all([
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

        supabase.rpc('auto_generate_periods_and_tasks', { p_work_id: workId }).then(
          res => ({ success: true, data: res.data, error: res.error }),
          err => ({ success: false, error: err })
        ),

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
          .select('*')
          .eq('work_id', workId)
          .order('period_start_date', { ascending: false }),

        supabase
          .from('work_documents')
          .select('*')
          .eq('work_id', workId)
          .order('sort_order'),

        supabase
          .from('work_communications')
          .select('*')
          .eq('work_id', workId)
          .order('communication_date', { ascending: false }),

        supabase
          .from('work_notes')
          .select('*')
          .eq('work_id', workId)
          .order('created_at', { ascending: false }),
      ]);

      if (workRes.data) setWork(workRes.data);
      if (periodGenRes.error) {
        console.error('Error generating next period:', periodGenRes.error);
      }
      if (tasksRes.data) setTasks(tasksRes.data);
      if (timeLogsRes.data) setTimeLogs(timeLogsRes.data);
      if (documentsRes.data) setDocuments(documentsRes.data);
      if (communicationsRes.data) setCommunications(communicationsRes.data);
      if (notesRes.data) setNotes(notesRes.data);



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
        user: (activity.staff_members as any)?.name || 'System',
        metadata: activity.metadata
      }));

      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
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

      const updatedTasks = tasks.map(t =>
        t.id === taskId ? { ...t, status } : t
      );

      const allCompleted = updatedTasks.length > 0 &&
        updatedTasks.every(t => t.status === 'completed');

      if (allCompleted) {
        const { error: updateError } = await supabase
          .from('works')
          .update({ status: 'completed', completion_date: new Date().toISOString() })
          .eq('id', workId);

        if (updateError) throw updateError;

        if (!work.is_recurring && work.customer_id && work.service_id) {
          try {
            await supabase.rpc('auto_generate_invoice_for_completed_work', { p_work_id: workId });
          } catch (invoiceError) {
            console.error('Error auto-generating invoice:', invoiceError);
          }
        }
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
        staff_id: timeForm.staff_member_id,
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
          staff_id: timeForm.staff_member_id,
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
      staff_member_id: (log as any).staff_id || '',
      start_time: new Date(log.start_time).toISOString().slice(0, 16),
      end_time: log.end_time ? new Date(log.end_time).toISOString().slice(0, 16) : '',
      description: log.description || '',
    });
    setShowEditTimeLogModal(true);
  };

  const handleAcceptWork = async () => {
    try {
      const { error } = await supabase.from('works').update({
        acceptance_status: 'accepted',
        acceptance_date: new Date().toISOString(),
        status: 'in_progress'
      }).eq('id', workId);
      if (error) throw error;
      fetchWorkDetails();
      toast.success('Work accepted. Status set to In Progress.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept work');
    }
  };

  const handleRejectWork = async () => {
    if (!window.confirm("Are you sure you want to reject this work assignment?")) return;
    try {
      const { error } = await supabase.from('works').update({
        acceptance_status: 'rejected',
        acceptance_date: new Date().toISOString()
      }).eq('id', workId);
      if (error) throw error;
      fetchWorkDetails();
      toast.success('Work assignment rejected.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject work');
    }
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

  const handleUploadDocument = (_documentId: string) => {
    toast.info('File upload functionality will be implemented with storage integration');
  };

  const handleEditDocument = (_document: WorkDocument) => {
    toast.info("Document editing coming soon");
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
    { id: 'time', label: 'Time Logs', icon: Clock, count: timeLogs.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
    { id: 'notes', label: 'Notes', icon: StickyNote, count: notes.length },
  ];

  if (work.is_recurring) {
    tabs.push({
      id: 'recurring',
      label: 'Periods & Tasks',
      icon: Repeat,
      count: recurringInstances.length
    });
  } else {
    tabs.splice(1, 0, { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks.length });
  }

  tabs.push({ id: 'activity', label: 'Activity Timeline', icon: ActivityIcon, count: activities.length });

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] bg-white shadow-sm overflow-hidden">
      <div className="p-2 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600 flex-shrink-0 relative">
        {/* Acceptance Banner */}
        {work.assigned_to === user?.id && work.acceptance_status === 'pending' && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-white px-6 py-2 flex items-center justify-between text-sm font-medium shadow-md z-1">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} />
              <span>You have been assigned this work. Please accept or reject.</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleAcceptWork} className="bg-white text-yellow-700 px-3 py-1 rounded-md hover:bg-yellow-50 transition-colors text-xs font-bold uppercase">Accept</button>
              <button onClick={handleRejectWork} className="bg-yellow-700 text-white border border-yellow-600 px-3 py-1 rounded-md hover:bg-yellow-800 transition-colors text-xs font-bold uppercase">Reject</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mb-2 pt-2">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/20 rounded-full transition-colors text-white mr-2"
            title="Back"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">
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
            {!work.is_recurring && work.billing_amount && (
              <div className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg">
                <DollarSign size={18} />
                <div className="text-left">
                  <p className="text-xs text-orange-100">Default Price</p>
                  <p className="text-sm font-bold">₹{work.billing_amount.toLocaleString('en-IN')}</p>
                </div>
              </div>
            )}
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
            >
              <Edit2 size={18} />
              Edit
            </button>

          </div>
        </div>
      </div>

      <div className="flex gap-2 px-6 pt-3 bg-gray-50 border-b-2 border-gray-200 flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-t-xl transition-all whitespace-nowrap ${activeTab === tab.id
                ? 'bg-white text-orange-600 shadow-md border-t-4 border-orange-500 -mb-0.5 z-10'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 border-t-4 border-transparent'
                }`}
            >
              <Icon size={18} className={activeTab === tab.id ? 'text-orange-600' : 'text-gray-500'} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${activeTab === tab.id
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-200 text-gray-600'
                  }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'overview' && (
          <OverviewTab
            work={work}
            tasks={tasks}
            timeLogs={timeLogs}
            onStatusChange={handleUpdateWorkStatus}
            onNavigateToCustomer={onNavigateToCustomer}
            onNavigateToService={onNavigateToService}
            onAssignClick={(isAdmin || permissions?.works?.edit) ? () => setShowAssignModal(true) : undefined}
          />
        )}



        {activeTab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            isRecurring={work.is_recurring}
            onAddTask={(isAdmin || permissions?.works?.edit || work.assigned_to === user?.id) ? () => setShowTaskModal(true) : undefined}
            onEditTask={openEditTaskModal} // Edit modal checks internally or we restrict here? Let's allow view, but save might fail if strict. Better to hide button in TasksTab if passed undefined? 
            // TasksTab interface expects onEditTask. I should wrap openEditTaskModal?
            // Actually, TasksTab renders buttons always if onEditTask is passed.
            // Let's pass it, but maybe I should check permissions inside openEditTaskModal?
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onDeleteTask={(isAdmin || permissions?.works?.edit || work.assigned_to === user?.id) ? (id) => confirmDelete('task', id) : undefined}
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
            onAddDocument={() => toast.info('Document creation coming soon')}
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

        {activeTab === 'communications' && (
          <CommunicationsTab
            workId={workId}
            communications={communications}
            onUpdate={() => {
              fetchWorkDetails();
              onUpdate();
            }}
          />
        )}

        {activeTab === 'notes' && (
          <NotesTab
            workId={workId}
            notes={notes}
            onUpdate={() => {
              fetchWorkDetails();
              onUpdate();
            }}
          />
        )}
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
    </div >
  );
}