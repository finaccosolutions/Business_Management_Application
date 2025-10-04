import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  X,
  Users,
  Clock,
  CheckSquare,
  Plus,
  Play,
  Pause,
  FileText,
  DollarSign,
  Calendar,
  AlertCircle,
  Edit2,
  Briefcase,
  TrendingUp,
  CheckCircle,
} from 'lucide-react';

interface WorkDetailsProps {
  workId: string;
  onClose: () => void;
  onUpdate: () => void;
  onEdit: () => void; // Add this
}

interface Task {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  actual_hours: number;
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
  staff_members: { name: string };
}

export default function WorkDetails({ workId, onClose, onUpdate }: WorkDetailsProps) {
  const [work, setWork] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    estimated_hours: '',
    due_date: '',
    priority: 'medium',
  });
  const [timeForm, setTimeForm] = useState({
    staff_member_id: '',
    start_time: new Date().toISOString().slice(0, 16),
    end_time: '',
    description: '',
  });

  useEffect(() => {
    fetchWorkDetails();
    fetchStaff();
  }, [workId]);

  const fetchWorkDetails = async () => {
    try {
      const [workRes, tasksRes, timeLogsRes, assignmentsRes] = await Promise.all([
        supabase
          .from('works')
          .select('*, customers(name), services(name), staff_members(name)')
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
      ]);

      if (workRes.data) setWork(workRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (timeLogsRes.data) setTimeLogs(timeLogsRes.data);
      if (assignmentsRes.data) setAssignments(assignmentsRes.data);
    } catch (error) {
      console.error('Error fetching work details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name')
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
        status: 'pending',
      });

      if (error) throw error;
      setShowTaskModal(false);
      setTaskForm({
        title: '',
        description: '',
        assigned_to: '',
        estimated_hours: '',
        due_date: '',
        priority: 'medium',
      });
      fetchWorkDetails();
      onUpdate();
    } catch (error) {
      console.error('Error creating task:', error);
    }
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
      setShowTimeModal(false);
      setTimeForm({
        staff_member_id: '',
        start_time: new Date().toISOString().slice(0, 16),
        end_time: '',
        description: '',
      });
      fetchWorkDetails();
      onUpdate();
    } catch (error) {
      console.error('Error logging time:', error);
    }
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
        .update({ assigned_to: staffId })
        .eq('id', workId);

      setShowAssignModal(false);
      fetchWorkDetails();
      onUpdate();
    } catch (error) {
      console.error('Error assigning staff:', error);
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('work_tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;
      fetchWorkDetails();
      onUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
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
    { id: 'time', label: 'Time Logs', icon: Clock, count: timeLogs.length },
    { id: 'assignments', label: 'Assignments', icon: Users, count: assignments.length },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      {/* Position: Left edge at sidebar (left-64), Top edge below topbar (top-16) */}
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
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

        {/* Status Badge */}
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
                Due: {new Date(work.due_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
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
              Reassign
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

        {/* Tabs */}
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
                <Icon size={18} className="text-orange-600" />
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

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Work Information */}
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
                    {work.due_date && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Due Date</label>
                        <p className="text-gray-900 mt-1">{new Date(work.due_date).toLocaleDateString()}</p>
                      </div>
                    )}
                    {work.billing_status && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Billing Status</label>
                        <p className="text-gray-900 mt-1 capitalize">{work.billing_status.replace('_', ' ')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock size={20} className="text-gray-600" />
                  Timeline
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-orange-600 rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Work Created</p>
                      <p className="text-xs text-gray-500">{new Date(work.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {work.updated_at !== work.created_at && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Last Updated</p>
                        <p className="text-xs text-gray-500">{new Date(work.updated_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {work.status === 'completed' && work.completed_at && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Completed</p>
                        <p className="text-xs text-gray-500">{new Date(work.completed_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 text-lg">Tasks</h3>
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
                        <h4 className="font-medium text-gray-900">{task.title}</h4>
                        {task.staff_members && (
                          <p className="text-sm text-gray-600 mt-1">Assigned to: {task.staff_members.name}</p>
                        )}
                        {task.actual_hours > 0 && (
                          <p className="text-sm text-gray-600 mt-1">Time: {task.actual_hours}h</p>
                        )}
                      </div>
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
                      <div>
                        <p className="font-medium text-gray-900">{log.staff_members.name}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(log.start_time).toLocaleString()}
                          {log.end_time && ` - ${new Date(log.end_time).toLocaleString()}`}
                        </p>
                        {log.description && <p className="text-sm text-gray-600 mt-1">{log.description}</p>}
                      </div>
                      {log.duration_hours && (
                        <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                          {log.duration_hours.toFixed(2)}h
                        </span>
                      )}
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
                  <Users className="w-4 h-4" />
                  <span>Reassign</span>
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
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white">Add New Task</h3>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Task title"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
                  <select
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Est. Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={taskForm.estimated_hours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Add Task
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Staff Member *</label>
                <select
                  required
                  value={timeForm.staff_member_id}
                  onChange={(e) => setTimeForm({ ...timeForm, staff_member_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={timeForm.start_time}
                    onChange={(e) => setTimeForm({ ...timeForm, start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input
                    type="datetime-local"
                    value={timeForm.end_time}
                    onChange={(e) => setTimeForm({ ...timeForm, end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={timeForm.description}
                  onChange={(e) => setTimeForm({ ...timeForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={2}
                  placeholder="What did you work on?"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTimeModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Log Time
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Staff Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h3 className="text-xl font-bold text-white">Assign to Staff Member</h3>
            </div>
            <div className="p-6 space-y-2">
              {staff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAssignStaff(s.id)}
                  className="w-full px-4 py-3 text-left border border-gray-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors font-medium"
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
