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
  AlertCircle
} from 'lucide-react';

interface WorkDetailsProps {
  workId: string;
  onClose: () => void;
  onUpdate: () => void;
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
        .update({ current_assigned_staff_id: staffId })
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{work.title}</h2>
            <p className="text-gray-600 mt-1">{work.customers?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          {['overview', 'tasks', 'time', 'assignments'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <p className="text-sm font-medium text-blue-900">Time Tracked</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">{work.actual_hours || 0}h</p>
                  {work.estimated_hours && (
                    <p className="text-xs text-blue-700 mt-1">of {work.estimated_hours}h estimated</p>
                  )}
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckSquare className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-medium text-green-900">Tasks</p>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {tasks.filter(t => t.status === 'completed').length}/{tasks.length}
                  </p>
                  <p className="text-xs text-green-700 mt-1">completed</p>
                </div>

                <div className="bg-emerald-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-900">Assigned To</p>
                  </div>
                  <p className="text-lg font-semibold text-emerald-600">
                    {work.staff_members?.name || 'Unassigned'}
                  </p>
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="text-xs text-emerald-700 hover:text-emerald-800 mt-1"
                  >
                    Reassign
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-600">{work.description || 'No description provided'}</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Service</p>
                    <p className="font-medium">{work.services?.name}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Priority</p>
                    <p className="font-medium capitalize">{work.priority}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Status</p>
                    <p className="font-medium capitalize">{work.status.replace('_', ' ')}</p>
                  </div>
                  {work.due_date && (
                    <div>
                      <p className="text-gray-600">Due Date</p>
                      <p className="font-medium">{new Date(work.due_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Tasks</h3>
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Task</span>
                </button>
              </div>

              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{task.title}</h4>
                        {task.staff_members && (
                          <p className="text-sm text-gray-600 mt-1">
                            Assigned to: {task.staff_members.name}
                          </p>
                        )}
                        {task.actual_hours > 0 && (
                          <p className="text-sm text-gray-600 mt-1">
                            Time: {task.actual_hours}h
                          </p>
                        )}
                      </div>
                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
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
                  <div className="text-center py-8 text-gray-500">
                    No tasks yet. Add your first task to get started.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'time' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Time Logs</h3>
                <button
                  onClick={() => setShowTimeModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Time</span>
                </button>
              </div>

              <div className="space-y-2">
                {timeLogs.map((log) => (
                  <div
                    key={log.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{log.staff_members.name}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(log.start_time).toLocaleString()}
                          {log.end_time && ` - ${new Date(log.end_time).toLocaleString()}`}
                        </p>
                        {log.description && (
                          <p className="text-sm text-gray-600 mt-1">{log.description}</p>
                        )}
                      </div>
                      {log.duration_hours && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                          {log.duration_hours.toFixed(2)}h
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {timeLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No time logged yet. Start tracking time for this work.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Assignment History</h3>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Users className="w-4 h-4" />
                  <span>Reassign</span>
                </button>
              </div>

              <div className="space-y-2">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
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
                  <div className="text-center py-8 text-gray-500">
                    No assignments yet. Assign this work to a staff member.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Add New Task</h3>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Task title"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
                  <select
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Log Time</h3>
            </div>
            <form onSubmit={handleLogTime} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Staff Member *</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time *</label>
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

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowTimeModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Log Time
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Assign to Staff Member</h3>
            </div>
            <div className="p-6 space-y-2">
              {staff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAssignStaff(s.id)}
                  className="w-full px-4 py-3 text-left border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
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
