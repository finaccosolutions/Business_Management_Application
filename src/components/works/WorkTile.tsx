import { Calendar, Users, Briefcase, DollarSign, Clock, AlertCircle, CheckCircle, Repeat, Edit2, Trash2, MapPin, ListTodo } from 'lucide-react';

interface WorkTileProps {
  work: any;
  onEdit: (work: any) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClick: () => void;
}

const statusConfig = {
  pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  in_progress: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
  completed: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  overdue: { color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
};

const priorityColors = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const billingStatusColors = {
  not_billed: 'bg-gray-100 text-gray-700',
  billed: 'bg-green-100 text-green-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

export default function WorkTile({ work, onEdit, onDelete, onClick }: WorkTileProps) {
  const StatusIcon = statusConfig[work.status as keyof typeof statusConfig]?.icon || Clock;
  const isOverdue = work.status !== 'completed' && work.due_date && new Date(work.due_date) < new Date();

  // Get pending task info - only count incomplete tasks
  const pendingTasks = work.work_tasks?.filter((t: any) => t.status !== 'completed') || [];
  const firstPendingTask = pendingTasks[0];
  const pendingCount = pendingTasks.length;

  // Format status display
  const getStatusDisplay = () => {
    if (isOverdue) return 'Overdue';
    if (work.status === 'pending' && firstPendingTask) {
      return `Pending: ${firstPendingTask.title}`;
    }
    if (work.status === 'in_progress' && firstPendingTask) {
      return `In Progress: ${firstPendingTask.title}`;
    }
    return work.status.replace('_', ' ');
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border-l-4 ${
        work.is_recurring_instance ? 'border-l-emerald-500' : 'border-l-orange-500'
      } border-t border-r border-b border-gray-200 transition-all cursor-pointer hover:shadow-md hover:bg-orange-50/30`}
      onClick={onClick}
    >
      <div className="p-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Icon + Title + Customer/Service */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white flex-shrink-0">
              <Briefcase size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm line-clamp-1 mb-0.5" title={work.title}>{work.title}</h3>
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Users size={10} className="flex-shrink-0" />
                <span className="truncate max-w-[120px]" title={work.customers.name}>{work.customers.name}</span>
                <span className="text-gray-400">•</span>
                <span className="truncate max-w-[120px] font-medium text-gray-700" title={work.services.name}>{work.services.name}</span>
              </div>
            </div>
          </div>

          {/* Center: Status, Priority, Billing Status + Additional Info */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
                isOverdue
                  ? statusConfig.overdue.color
                  : statusConfig[work.status as keyof typeof statusConfig]?.color || 'bg-gray-100 text-gray-700'
              }`}
            >
              <StatusIcon size={10} />
              <span className="truncate max-w-[100px]" title={getStatusDisplay()}>
                {getStatusDisplay()}
              </span>
            </span>

            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                priorityColors[work.priority as keyof typeof priorityColors] || priorityColors.medium
              }`}
            >
              {work.priority}
            </span>

            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                billingStatusColors[work.billing_status as keyof typeof billingStatusColors] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {work.billing_status ? work.billing_status.replace('_', ' ') : 'not billed'}
            </span>

            {work.is_recurring_instance && (
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">
                <Repeat size={9} />
                Recurring
              </span>
            )}

            {work.due_date && (
              <div className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                <Calendar size={10} className="text-blue-500" />
                <span className="font-medium">{new Date(work.due_date).toLocaleDateString()}</span>
              </div>
            )}

            {work.staff_members && (
              <div className="flex items-center gap-1 text-xs text-gray-600 max-w-[100px]">
                <Users size={10} className="text-blue-500 flex-shrink-0" />
                <span className="truncate" title={work.staff_members.name}>{work.staff_members.name}</span>
              </div>
            )}

            {work.work_location && (
              <div className="flex items-center gap-1 text-xs text-gray-600 max-w-[100px]">
                <MapPin size={10} className="text-green-500 flex-shrink-0" />
                <span className="truncate" title={work.work_location}>{work.work_location}</span>
              </div>
            )}

            {work.estimated_hours && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Clock size={9} />
                <span>{work.estimated_hours}h</span>
              </div>
            )}

            {pendingCount > 1 && (
              <div className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                <ListTodo size={10} />
                <span>+{pendingCount - 1}</span>
              </div>
            )}
          </div>

          {/* Right: Amount + Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {work.billing_amount && (
              <div className="flex items-center gap-1 text-sm text-teal-700 font-bold whitespace-nowrap">
                <DollarSign size={13} />
                ₹{work.billing_amount.toLocaleString('en-IN')}
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(work);
                }}
                className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                title="Edit work"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={(e) => onDelete(work.id, e)}
                className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                title="Delete work"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
