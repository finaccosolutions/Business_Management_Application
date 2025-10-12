import { CheckSquare, Clock, Users, Briefcase, Calendar, Repeat, DollarSign, CheckCircle, Edit2, Trash2, Plus, ArrowRightLeft, Activity, PlayCircle, StopCircle, AlertTriangle } from 'lucide-react';
import { Task, TimeLog, Assignment, RecurringInstance, Activity as ActivityType, priorityColors } from './WorkDetailsTypes';
import { ActivityTimeline } from './ActivityTimeline';

interface OverviewTabProps {
  work: any;
  onStatusChange?: (status: string) => void;
}

export function OverviewTab({ work, onStatusChange }: OverviewTabProps) {
  return (
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
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${
                priorityColors[work.priority] || priorityColors.medium
              }`}>
                {work.priority.charAt(0).toUpperCase() + work.priority.slice(1)}
              </span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Status</label>
              <p className="text-gray-900 mt-1 capitalize">{work.status.replace('_', ' ')}</p>
            </div>
          </div>

          {/* Additional Details */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            {work.start_date && (
              <div>
                <label className="text-sm font-medium text-gray-500">Start Date</label>
                <p className="text-gray-900 mt-1">{new Date(work.start_date).toLocaleDateString()}</p>
              </div>
            )}
            {work.due_date && (
              <div>
                <label className="text-sm font-medium text-gray-500">Due Date</label>
                <p className="text-gray-900 mt-1">{new Date(work.due_date).toLocaleDateString()}</p>
              </div>
            )}
            {work.work_location && (
              <div>
                <label className="text-sm font-medium text-gray-500">Work Location</label>
                <p className="text-gray-900 mt-1">{work.work_location}</p>
              </div>
            )}
            {work.department && (
              <div>
                <label className="text-sm font-medium text-gray-500">Department</label>
                <p className="text-gray-900 mt-1">{work.department}</p>
              </div>
            )}
          </div>

          {/* Requirements & Deliverables */}
          {(work.requirements || work.deliverables) && (
            <div className="pt-4 border-t border-gray-200 space-y-4">
              {work.requirements && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Requirements & Instructions</label>
                  <p className="text-gray-700 mt-1 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{work.requirements}</p>
                </div>
              )}
              {work.deliverables && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Expected Deliverables</label>
                  <p className="text-gray-700 mt-1 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{work.deliverables}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TasksTabProps {
  tasks: Task[];
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onUpdateTaskStatus: (taskId: string, status: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function TasksTab({ tasks, onAddTask, onEditTask, onUpdateTaskStatus, onDeleteTask }: TasksTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 text-lg">Tasks & Subtasks</h3>
        <button
          onClick={onAddTask}
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
                      {new Date(task.due_date).toLocaleDateString()}
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
                  onClick={() => onEditTask(task)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit task"
                >
                  <Edit2 size={16} />
                </button>
                <select
                  value={task.status}
                  onChange={(e) => onUpdateTaskStatus(task.id, e.target.value)}
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
                  onClick={() => onDeleteTask(task.id)}
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
  );
}

interface TimeLogsTabProps {
  timeLogs: TimeLog[];
  onAddTimeLog: () => void;
  onEditTimeLog: (log: TimeLog) => void;
  onDeleteTimeLog: (logId: string) => void;
}

export function TimeLogsTab({ timeLogs, onAddTimeLog, onEditTimeLog, onDeleteTimeLog }: TimeLogsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 text-lg">Time Logs</h3>
        <button
          onClick={onAddTimeLog}
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
                  onClick={() => onEditTimeLog(log)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit time log"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => onDeleteTimeLog(log.id)}
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
  );
}

interface AssignmentsTabProps {
  assignments: Assignment[];
  onAssign: () => void;
  currentlyAssigned?: string | null;
}

export function AssignmentsTab({ assignments, onAssign, currentlyAssigned }: AssignmentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 text-lg">Assignment History</h3>
        <button
          onClick={onAssign}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>{currentlyAssigned ? 'Reassign' : 'Assign'}</span>
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
  );
}

interface RecurringTabProps {
  recurringInstances: RecurringInstance[];
  work: any;
  onAddPeriod: () => void;
  onEditPeriod: (instance: RecurringInstance) => void;
  onUpdatePeriodStatus: (instanceId: string, status: string) => void;
  onDeletePeriod: (instanceId: string) => void;
}

export function RecurringTab({
  recurringInstances,
  work,
  onAddPeriod,
  onEditPeriod,
  onUpdatePeriodStatus,
  onDeletePeriod
}: RecurringTabProps) {
  const sortedInstances = [...recurringInstances].sort((a, b) =>
    new Date(b.period_start_date).getTime() - new Date(a.period_start_date).getTime()
  );

  const pendingCount = recurringInstances.filter(i => i.status === 'pending').length;
  const inProgressCount = recurringInstances.filter(i => i.status === 'in_progress').length;
  const completedCount = recurringInstances.filter(i => i.status === 'completed').length;
  const overdueCount = recurringInstances.filter(i =>
    i.status !== 'completed' && new Date(i.due_date) < new Date()
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 text-lg">Recurring Periods Management</h3>
        <button
          onClick={onAddPeriod}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Period</span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-yellow-600" />
            <p className="text-xs font-medium text-yellow-900">Pending</p>
          </div>
          <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <PlayCircle size={16} className="text-blue-600" />
            <p className="text-xs font-medium text-blue-900">In Progress</p>
          </div>
          <p className="text-2xl font-bold text-blue-700">{inProgressCount}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-xs font-medium text-green-900">Completed</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{completedCount}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-red-600" />
            <p className="text-xs font-medium text-red-900">Overdue</p>
          </div>
          <p className="text-2xl font-bold text-red-700">{overdueCount}</p>
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Repeat className="w-5 h-5 text-orange-600" />
          <p className="font-medium text-orange-900">Recurring Work Pattern</p>
        </div>
        <div className="text-sm text-gray-700 space-y-1">
          <p>Pattern: <span className="font-medium capitalize">{work.recurrence_pattern}</span></p>
          {work.recurrence_day && (
            <p>Due Day: <span className="font-medium">Day {work.recurrence_day} of each period</span></p>
          )}
          {work.billing_amount && (
            <p>Default Billing: <span className="font-medium">₹{work.billing_amount.toLocaleString('en-IN')}</span></p>
          )}
          <p className="text-xs text-gray-600 mt-2">
            Each period is managed separately. When a period is completed, an invoice can be auto-generated based on the billing amount.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {sortedInstances.map((instance) => {
          const isOverdue = instance.status !== 'completed' && new Date(instance.due_date) < new Date();
          const daysUntilDue = Math.ceil((new Date(instance.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

          return (
            <div key={instance.id} className={`bg-white border-2 rounded-xl p-4 transition-all ${
              isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-orange-300'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-gray-900 text-lg">{instance.period_name}</h4>
                    {instance.billing_amount && (
                      <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-sm font-semibold flex items-center gap-1">
                        <DollarSign size={14} />
                        ₹{instance.billing_amount.toLocaleString('en-IN')}
                      </span>
                    )}
                    {isOverdue && (
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-semibold flex items-center gap-1">
                        <AlertTriangle size={14} />
                        Overdue
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 mt-3 text-sm">
                    <div className="flex items-center gap-4 text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        <strong>Period:</strong> {new Date(instance.period_start_date).toLocaleDateString()} - {new Date(instance.period_end_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        <strong>Due:</strong> {new Date(instance.due_date).toLocaleDateString()}
                        {instance.status !== 'completed' && daysUntilDue >= 0 && (
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            daysUntilDue <= 3 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {daysUntilDue === 0 ? 'Due today' : `${daysUntilDue} days left`}
                          </span>
                        )}
                      </span>
                    </div>
                    {instance.completed_at && (
                      <p className="flex items-center gap-1 text-green-600 font-medium">
                        <CheckCircle size={14} />
                        Completed: {new Date(instance.completed_at).toLocaleDateString()}
                        {instance.staff_members && ` by ${instance.staff_members.name}`}
                      </p>
                    )}
                    {instance.is_billed && instance.invoice_id && (
                      <p className="flex items-center gap-1 text-emerald-600 font-medium">
                        <DollarSign size={14} />
                        Invoice Generated (ID: {instance.invoice_id.slice(0, 8)}...)
                      </p>
                    )}
                    {instance.notes && (
                      <div className="bg-gray-50 rounded p-2 mt-2">
                        <p className="text-gray-700 text-xs"><strong>Notes:</strong> {instance.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => onEditPeriod(instance)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit period"
                  >
                    <Edit2 size={16} />
                  </button>
                  <select
                    value={instance.status}
                    onChange={(e) => onUpdatePeriodStatus(instance.id, e.target.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border-2 cursor-pointer transition-colors ${
                      instance.status === 'completed'
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : instance.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700 border-blue-300'
                        : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                    }`}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button
                    onClick={() => onDeletePeriod(instance.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete period"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {recurringInstances.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Repeat size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 font-medium">No recurring periods yet</p>
            <p className="text-sm text-gray-500 mt-2">
              Add periods to manage your recurring work. Each period can have its own billing amount and status.
            </p>
            <button
              onClick={onAddPeriod}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Plus size={16} />
              <span>Add First Period</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ActivityTabProps {
  activities: ActivityType[];
}

export function ActivityTab({ activities }: ActivityTabProps) {
  return <ActivityTimeline activities={activities} />;
}
