import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CheckCircle, Clock, Edit2, User, Calendar, AlertCircle, ChevronDown, ChevronRight
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
  const [editForm, setEditForm] = useState({
    due_date: '',
    assigned_to: '',
    remarks: ''
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
          staff:assigned_to(name)
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
        .from('staff')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setStaffList(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
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
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <AlertCircle size={40} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 text-sm">No tasks defined for this period</p>
          <p className="text-gray-500 text-xs mt-1">
            Tasks are automatically created from service task templates
          </p>
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
    </div>
  );
}
