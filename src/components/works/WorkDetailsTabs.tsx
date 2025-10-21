import { CheckSquare, Clock, Users, Briefcase, Calendar, Repeat, DollarSign, CheckCircle, Edit2, Trash2, Plus, ArrowRightLeft, Activity, PlayCircle, StopCircle, AlertTriangle, FileText, Upload, Download } from 'lucide-react';
import { Task, TimeLog, Assignment, RecurringInstance, Activity as ActivityType, WorkDocument, priorityColors } from './WorkDetailsTypes';
import { ActivityTimeline } from './ActivityTimeline';
import { RecurringPeriodManager } from './RecurringPeriodManager';

interface OverviewTabProps {
  work: any;
  tasks: any[];
  timeLogs: any[];
  onStatusChange?: (status: string) => void;
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToService?: (serviceId: string) => void;
  onAssignClick?: () => void;
}

export function OverviewTab({ work, tasks, timeLogs, onStatusChange, onNavigateToCustomer, onNavigateToService, onAssignClick }: OverviewTabProps) {
  const totalHours = timeLogs.reduce((sum, log) => sum + (log.duration_hours || 0), 0);
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-orange-600" />
            <p className="text-xs font-medium text-gray-600">Time Tracked</p>
          </div>
          <p className="text-2xl font-bold text-orange-600">{totalHours.toFixed(1)}h</p>
          {work.estimated_hours && (
            <p className="text-xs text-gray-500 mt-1">of {work.estimated_hours}h estimated</p>
          )}
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-xs font-medium text-gray-600">Tasks</p>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {completedTasks}/{tasks.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">completed</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-blue-600" />
            <p className="text-xs font-medium text-gray-600">Assigned To</p>
          </div>
          <p className="text-lg font-semibold text-blue-600 truncate">
            {work.staff_members?.name || 'Unassigned'}
          </p>
          {onAssignClick && (
            <button
              onClick={onAssignClick}
              className="text-xs text-blue-600 hover:text-blue-700 mt-1 hover:underline"
            >
              {work.assigned_to ? 'Reassign' : 'Assign'}
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
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
              {onNavigateToCustomer ? (
                <button
                  onClick={() => onNavigateToCustomer(work.customer_id)}
                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium mt-1 text-left"
                >
                  {work.customers?.name}
                </button>
              ) : (
                <p className="text-gray-900 mt-1">{work.customers?.name}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Service</label>
              {onNavigateToService ? (
                <button
                  onClick={() => onNavigateToService(work.service_id)}
                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium mt-1 text-left"
                >
                  {work.services?.name}
                </button>
              ) : (
                <p className="text-gray-900 mt-1">{work.services?.name}</p>
              )}
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
  isRecurring?: boolean;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onUpdateTaskStatus: (taskId: string, status: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function TasksTab({ tasks, isRecurring = false, onAddTask, onEditTask, onUpdateTaskStatus, onDeleteTask }: TasksTabProps) {
  // For non-recurring works, show regular task management
  // For recurring works, show info that tasks are in Recurring Periods tab
  if (isRecurring) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Repeat size={24} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Recurring Work - Task Management
              </h3>
              <p className="text-gray-700 mb-3">
                This is a recurring work. All tasks are managed per period in the <strong>Periods & Tasks</strong> tab.
              </p>
              <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-medium text-gray-900">How task management works for recurring works:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                  <li>Go to the <strong>"Periods & Tasks"</strong> tab to see all periods</li>
                  <li>Select a period to view and manage its tasks</li>
                  <li>Each task has its own due date, assignee, status, and remarks</li>
                  <li>Period status automatically updates based on task completion</li>
                  <li>After completing all tasks, create an invoice manually from the Invoices page</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                    <span className={`flex items-center gap-1 ${
                      task.status !== 'completed' && new Date(task.due_date) < new Date()
                        ? 'text-red-600 font-medium'
                        : ''
                    }`}>
                      <Calendar size={14} />
                      Due: {new Date(task.due_date).toLocaleDateString()}
                      {task.status !== 'completed' && new Date(task.due_date) < new Date() && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Overdue</span>
                      )}
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
  workId: string;
  work: any;
  onUpdate: () => void;
}

export function RecurringTab({ workId, work, onUpdate }: RecurringTabProps) {
  return <RecurringPeriodManager workId={workId} work={work} onUpdate={onUpdate} />;
}

interface ActivityTabProps {
  activities: ActivityType[];
}

export function ActivityTab({ activities }: ActivityTabProps) {
  return <ActivityTimeline activities={activities} />;
}

interface DocumentsTabProps {
  documents: WorkDocument[];
  onAddDocument: () => void;
  onEditDocument: (document: WorkDocument) => void;
  onDeleteDocument: (documentId: string) => void;
  onToggleCollected: (documentId: string, isCollected: boolean) => void;
  onUploadFile: (documentId: string) => void;
}

export function DocumentsTab({
  documents,
  onAddDocument,
  onEditDocument,
  onDeleteDocument,
  onToggleCollected,
  onUploadFile
}: DocumentsTabProps) {
  const sortedDocuments = [...documents].sort((a, b) => a.sort_order - b.sort_order);

  const requiredDocs = sortedDocuments.filter(d => d.is_required);
  const optionalDocs = sortedDocuments.filter(d => !d.is_required);
  const collectedCount = documents.filter(d => d.is_collected).length;
  const requiredCollectedCount = requiredDocs.filter(d => d.is_collected).length;
  const uploadedCount = documents.filter(d => d.file_url).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 text-lg">Documents Management</h3>
        <button
          onClick={onAddDocument}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Document</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={16} className="text-blue-600" />
            <p className="text-xs font-medium text-blue-900">Total Documents</p>
          </div>
          <p className="text-2xl font-bold text-blue-700">{documents.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-xs font-medium text-green-900">Collected</p>
          </div>
          <p className="text-2xl font-bold text-green-700">
            {collectedCount}/{documents.length}
            {requiredDocs.length > 0 && (
              <span className="text-sm ml-2">({requiredCollectedCount}/{requiredDocs.length} req.)</span>
            )}
          </p>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Upload size={16} className="text-teal-600" />
            <p className="text-xs font-medium text-teal-900">Uploaded</p>
          </div>
          <p className="text-2xl font-bold text-teal-700">{uploadedCount}/{documents.length}</p>
        </div>
      </div>

      {requiredDocs.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600" />
            Required Documents
          </h4>
          <div className="space-y-3">
            {requiredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onEdit={onEditDocument}
                onDelete={onDeleteDocument}
                onToggleCollected={onToggleCollected}
                onUploadFile={onUploadFile}
              />
            ))}
          </div>
        </div>
      )}

      {optionalDocs.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText size={18} className="text-gray-600" />
            Optional Documents
          </h4>
          <div className="space-y-3">
            {optionalDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onEdit={onEditDocument}
                onDelete={onDeleteDocument}
                onToggleCollected={onToggleCollected}
                onUploadFile={onUploadFile}
              />
            ))}
          </div>
        </div>
      )}

      {documents.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium">No documents yet</p>
          <p className="text-sm text-gray-500 mt-2">
            Documents from the service template will appear here automatically when work is created.
          </p>
          <button
            onClick={onAddDocument}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Plus size={16} />
            <span>Add First Document</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface DocumentCardProps {
  document: WorkDocument;
  onEdit: (document: WorkDocument) => void;
  onDelete: (documentId: string) => void;
  onToggleCollected: (documentId: string, isCollected: boolean) => void;
  onUploadFile: (documentId: string) => void;
}

function DocumentCard({ document, onEdit, onDelete, onToggleCollected, onUploadFile }: DocumentCardProps) {
  return (
    <div
      className={`bg-white border-2 rounded-xl p-4 transition-all ${
        document.is_required && !document.is_collected
          ? 'border-red-300 bg-red-50'
          : document.is_collected
          ? 'border-green-300 bg-green-50'
          : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900">{document.name}</h4>
            {document.is_required && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                Required
              </span>
            )}
            {document.is_collected && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                <CheckCircle size={12} />
                Collected
              </span>
            )}
            {document.file_url && (
              <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium flex items-center gap-1">
                <Upload size={12} />
                Uploaded
              </span>
            )}
          </div>
          {document.description && (
            <p className="text-sm text-gray-600 mt-1">{document.description}</p>
          )}
          {document.category && (
            <p className="text-xs text-gray-500 mt-1">
              Category: <span className="font-medium">{document.category}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
            {document.collected_at && (
              <span>Collected: {new Date(document.collected_at).toLocaleDateString()}</span>
            )}
            {document.uploaded_at && (
              <span>Uploaded: {new Date(document.uploaded_at).toLocaleDateString()}</span>
            )}
            {document.file_size && (
              <span>Size: {(document.file_size / 1024).toFixed(2)} KB</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => onToggleCollected(document.id, !document.is_collected)}
            className={`p-2 rounded-lg transition-colors ${
              document.is_collected
                ? 'text-green-600 hover:bg-green-100'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
            title={document.is_collected ? 'Mark as not collected' : 'Mark as collected'}
          >
            <CheckCircle size={18} />
          </button>
          <button
            onClick={() => onUploadFile(document.id)}
            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
            title="Upload file"
          >
            <Upload size={18} />
          </button>
          {document.file_url && (
            <a
              href={document.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Download file"
            >
              <Download size={18} />
            </a>
          )}
          <button
            onClick={() => onEdit(document)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit document"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(document.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete document"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
