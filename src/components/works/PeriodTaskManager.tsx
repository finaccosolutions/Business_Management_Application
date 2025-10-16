import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CheckCircle, Clock, Edit2, User, Calendar, AlertCircle, ChevronDown, ChevronRight, Plus, Trash2
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { formatDateDisplay } from '../../lib/dateUtils';

interface PeriodTask {
  id: string;
  work_recurring_instance_id: string;
  service_task_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  estimated_hours: number | null;
  actual_hours: number;
  completed_at: string | null;
  completed_by: string | null;
  remarks: string | null;
  sort_order: number;
  staff: { name: string } | null;
}

interface Props {
  periodId: string;
  periodName: string;
  periodStatus: string;
  onTasksUpdate: () => void;
}

export function PeriodTaskManager({ periodId, periodName, periodStatus, onTasksUpdate }: Props) {
  const [tasks, setTasks] = useState<PeriodTask[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editForm, setEditForm] = useState({
    due_date: '',
    assigned_to: '',
    remarks: ''
  });
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    assigned_to: '',
    estimated_hours: ''
  });
  const toast = useToast();

  useEffect(() => {
    fetchTasks();
    fetchStaff();
  }, [periodId]);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_period_tasks')
        .select(`
          *,
          staff:staff_members!assigned_to(name)
        `)
        .eq('work_recurring_instance_id', periodId)
        .order('sort_order');

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching period tasks:', error);
      toast.error('Failed to load tasks');
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
      setStaffList(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('recurring_period_tasks')
        .insert({
          work_recurring_instance_id: periodId,
          title: newTaskForm.title,
          description: newTaskForm.description || null,
          due_date: newTaskForm.due_date,
          priority: newTaskForm.priority,
          assigned_to: newTaskForm.assigned_to || null,
          estimated_hours: newTaskForm.estimated_hours ? parseFloat(newTaskForm.estimated_hours) : null,
          status: 'pending',
          sort_order: tasks.length
        });

      if (error) throw error;

      setShowAddTask(false);
      setNewTaskForm({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        assigned_to: '',
        estimated_hours: ''
      });
      fetchTasks();
      onTasksUpdate();
      toast.success('Task added successfully!');
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error('Failed to add task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('recurring_period_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      fetchTasks();
      onTasksUpdate();
      toast.success('Task deleted successfully!');
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('recurring_period_tasks')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) throw error;

      fetchTasks();
      onTasksUpdate();
      toast.success('Task status updated!');
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Failed to update task status');
    }
  };

  const handleUpdateTask = async (taskId: string) => {
    try {
      const updates: any = {
        updated_at: new Date().toISOString()
      };

      if (editForm.due_date) updates.due_date = editForm.due_date;
      if (editForm.assigned_to) updates.assigned_to = editForm.assigned_to;
      if (editForm.remarks !== undefined) updates.remarks = editForm.remarks || null;

      const { error } = await supabase
        .from('recurring_period_tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      setEditingTask(null);
      fetchTasks();
      onTasksUpdate();
      toast.success('Task updated successfully!');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const startEditingTask = (task: PeriodTask) => {
    setEditingTask(task.id);
    setEditForm({
      due_date: task.due_date,
      assigned_to: task.assigned_to || '',
      remarks: task.remarks || ''
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-300';
      case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-orange-100 text-orange-700';
      case 'low': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const completionPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  if (loading) {
    return <div className="flex justify-center p-4">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">Tasks for {periodName}</h4>
          <p className="text-sm text-gray-600 mt-1">
            {completedTasks} of {totalTasks} tasks completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {Math.round(completionPercentage)}%
          </span>
          <button
            onClick={() => setShowAddTask(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add Task
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-8 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border-2 border-dashed border-orange-300">
          <AlertCircle size={48} className="mx-auto text-orange-400 mb-3" />
          <p className="text-gray-900 text-base font-semibold mb-2">No Tasks Found for This Period</p>
          <div className="max-w-xl mx-auto space-y-2 text-sm">
            <p className="text-gray-700">
              Tasks are automatically copied from your service task templates when a period is created.
            </p>
            <div className="bg-white border border-orange-200 rounded-lg p-3 text-left">
              <p className="font-medium text-gray-900 mb-1">To set up task templates:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-gray-700 ml-2 text-xs">
                <li>Go to <strong>Services</strong> page</li>
                <li>Select your service and click to view details</li>
                <li>Navigate to the <strong>Task Templates</strong> tab</li>
                <li>Add tasks with due date offsets (e.g., GSTR-1 on 10th, GSTR-3B on 20th)</li>
                <li>New periods will automatically include these tasks</li>
              </ol>
            </div>
            <p className="text-gray-700 font-medium mt-3">
              For now, click <strong>"Add Task"</strong> above to manually add tasks to this period.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              <strong>Example:</strong> For GST filing service, create separate tasks for GSTR-1 (due 10th) and GSTR-3B (due 20th).
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const isExpanded = expandedTasks.has(task.id);
            const isEditing = editingTask === task.id;
            const isOverdue = task.status !== 'completed' && new Date(task.due_date) < new Date();
            const daysUntilDue = Math.ceil(
              (new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={task.id}
                className={`border-2 rounded-lg transition-all ${
                  task.status === 'completed'
                    ? 'border-green-300 bg-green-50'
                    : isOverdue
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <button
                        onClick={() => toggleTaskExpanded(task.id)}
                        className="mt-1 text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="font-medium text-gray-900">{task.title}</h5>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                          {task.status === 'completed' && (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                              <CheckCircle size={14} />
                              Completed
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} className={isOverdue ? 'text-red-500' : 'text-blue-500'} />
                            <span className="text-gray-600">Due:</span>
                            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'}>
                              {formatDateDisplay(task.due_date)}
                            </span>
                            {task.status !== 'completed' && (
                              daysUntilDue >= 0 ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  daysUntilDue === 0 ? 'bg-red-100 text-red-700' :
                                  daysUntilDue <= 3 ? 'bg-orange-100 text-orange-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {daysUntilDue === 0 ? 'Today' : `${daysUntilDue}d`}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                  {Math.abs(daysUntilDue)}d overdue
                                </span>
                              )
                            )}
                          </div>

                          {task.staff && (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <User size={14} className="text-gray-400" />
                              <span>{task.staff.name}</span>
                            </div>
                          )}

                          {task.estimated_hours && (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <Clock size={14} className="text-gray-400" />
                              <span>{task.estimated_hours}h est.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditingTask(task)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit task"
                      >
                        <Edit2 size={16} />
                      </button>
                      <select
                        value={task.status}
                        onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                        className={`px-2 py-1 rounded text-sm font-medium border-2 cursor-pointer ${getStatusColor(task.status)}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pl-9 space-y-2 text-sm">
                      {task.description && (
                        <div>
                          <span className="font-medium text-gray-700">Description:</span>
                          <p className="text-gray-600 mt-1">{task.description}</p>
                        </div>
                      )}

                      {task.remarks && (
                        <div>
                          <span className="font-medium text-gray-700">Remarks:</span>
                          <p className="text-gray-600 mt-1">{task.remarks}</p>
                        </div>
                      )}

                      {task.completed_at && (
                        <div className="text-gray-600">
                          <span className="font-medium">Completed:</span> {formatDateDisplay(task.completed_at.split('T')[0])}
                        </div>
                      )}

                      {task.actual_hours > 0 && (
                        <div className="text-gray-600">
                          <span className="font-medium">Actual Hours:</span> {task.actual_hours}h
                        </div>
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div className="mt-3 pl-9 pt-3 border-t border-gray-200 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Due Date
                          </label>
                          <input
                            type="date"
                            value={editForm.due_date}
                            onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Assign To
                          </label>
                          <select
                            value={editForm.assigned_to}
                            onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          >
                            <option value="">Unassigned</option>
                            {staffList.map(staff => (
                              <option key={staff.id} value={staff.id}>{staff.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Remarks
                        </label>
                        <textarea
                          value={editForm.remarks}
                          onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          rows={2}
                          placeholder="Add notes or remarks..."
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingTask(null)}
                          className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUpdateTask(task.id)}
                          className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalTasks > 0 && periodStatus !== 'completed' && completedTasks === totalTasks && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle size={20} />
            <span className="font-semibold">All tasks completed!</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            The period will be marked as completed and ready for billing.
          </p>
        </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Task</h3>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Enter task title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                  placeholder="Task description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={newTaskForm.due_date}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                  <select
                    value={newTaskForm.assigned_to}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, assigned_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={newTaskForm.estimated_hours}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, estimated_hours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTask(false);
                    setNewTaskForm({
                      title: '',
                      description: '',
                      due_date: '',
                      priority: 'medium',
                      assigned_to: '',
                      estimated_hours: ''
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
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
    </div>
  );
}
