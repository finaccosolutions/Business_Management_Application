import { Calendar, Users, Briefcase, DollarSign, Clock, AlertCircle, CheckCircle, Repeat, Edit2, Trash2, MapPin } from 'lucide-react';

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

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border-l-4 ${
        work.is_recurring_instance ? 'border-l-emerald-500' : 'border-l-orange-500'
      } border-t border-r border-b border-gray-200 transition-all cursor-pointer hover:shadow-md hover:bg-orange-50/30`}
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex flex-col lg:flex-row items-start gap-4">
          {/* Work Title & Customer Section */}
          <div className="flex items-start gap-3 w-full lg:w-auto lg:min-w-[250px] lg:max-w-[250px]">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white flex-shrink-0">
              <Briefcase size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-900 text-base mb-1 line-clamp-1">{work.title}</h3>
              <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                <Users size={12} className="flex-shrink-0" />
                <span className="truncate">{work.customers.name}</span>
              </div>
              {work.is_recurring_instance && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  <Repeat size={11} />
                  Recurring
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block h-12 w-px bg-gray-200"></div>

          {/* Service & Details */}
          <div className="flex-1 min-w-0 w-full lg:w-auto">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Briefcase size={14} className="flex-shrink-0 text-orange-500" />
                <span className="truncate font-medium">{work.services.name}</span>
              </div>
              {work.description && (
                <p className="text-xs text-gray-600 line-clamp-1">{work.description}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {work.staff_members && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Users size={13} className="flex-shrink-0 text-blue-500" />
                    <span className="truncate">{work.staff_members.name}</span>
                  </div>
                )}
                {work.work_location && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <MapPin size={13} className="flex-shrink-0 text-green-500" />
                    <span className="truncate">{work.work_location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block h-12 w-px bg-gray-200"></div>

          {/* Status & Priority */}
          <div className="w-full lg:w-auto lg:min-w-[200px]">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    isOverdue
                      ? statusConfig.overdue.color
                      : statusConfig[work.status as keyof typeof statusConfig]?.color || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <StatusIcon size={12} />
                  {isOverdue ? 'Overdue' : work.status.replace('_', ' ')}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    priorityColors[work.priority as keyof typeof priorityColors] || priorityColors.medium
                  }`}
                >
                  {work.priority}
                </span>
              </div>
              {work.billing_status && (
                <span
                  className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    billingStatusColors[work.billing_status as keyof typeof billingStatusColors]
                  }`}
                >
                  {work.billing_status.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block h-12 w-px bg-gray-200"></div>

          {/* Due Date & Amount */}
          <div className="w-full lg:w-auto lg:min-w-[160px]">
            <div className="space-y-1.5">
              {work.due_date && (
                <div className="flex items-center gap-1.5 text-xs text-gray-700">
                  <Calendar size={13} className="flex-shrink-0 text-blue-500" />
                  <span className="font-medium">Due: {new Date(work.due_date).toLocaleDateString()}</span>
                </div>
              )}
              {work.billing_amount && (
                <div className="flex items-center gap-1.5 text-sm text-teal-700 bg-teal-50 px-2 py-1 rounded-lg font-semibold">
                  <DollarSign size={13} />
                  <span>₹{work.billing_amount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {work.estimated_hours && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Clock size={11} />
                  <span>{work.estimated_hours}h est.</span>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block h-12 w-px bg-gray-200"></div>

          {/* Actions */}
          <div className="w-full lg:w-auto flex items-center gap-2 lg:ml-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(work);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              <Edit2 size={14} />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={(e) => onDelete(work.id, e)}
              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="Delete work"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
