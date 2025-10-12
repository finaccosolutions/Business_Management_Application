import { Activity as ActivityIcon, CheckCircle, Clock, User, FileText, DollarSign, AlertCircle, Users, Repeat, Calendar } from 'lucide-react';
import { Activity } from './WorkDetailsTypes';

interface ActivityTimelineProps {
  activities: Activity[];
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'work_created':
        return <FileText size={16} className="text-blue-600" />;
      case 'status_change':
        return <AlertCircle size={16} className="text-orange-600" />;
      case 'assignment':
      case 'reassignment':
        return <Users size={16} className="text-purple-600" />;
      case 'task_created':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'task_completed':
        return <CheckCircle size={16} className="text-emerald-600" />;
      case 'time_logged':
        return <Clock size={16} className="text-blue-600" />;
      case 'recurring_period_created':
        return <Repeat size={16} className="text-indigo-600" />;
      case 'recurring_period_completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'invoice_generated':
        return <DollarSign size={16} className="text-teal-600" />;
      case 'note_added':
        return <FileText size={16} className="text-gray-600" />;
      default:
        return <ActivityIcon size={16} className="text-gray-600" />;
    }
  };

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'work_created':
        return 'bg-blue-100 border-blue-300';
      case 'status_change':
        return 'bg-orange-100 border-orange-300';
      case 'assignment':
      case 'reassignment':
        return 'bg-purple-100 border-purple-300';
      case 'task_created':
        return 'bg-green-100 border-green-300';
      case 'task_completed':
        return 'bg-emerald-100 border-emerald-300';
      case 'time_logged':
        return 'bg-blue-100 border-blue-300';
      case 'recurring_period_created':
        return 'bg-indigo-100 border-indigo-300';
      case 'recurring_period_completed':
        return 'bg-green-100 border-green-300';
      case 'invoice_generated':
        return 'bg-teal-100 border-teal-300';
      case 'note_added':
        return 'bg-gray-100 border-gray-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
        <ActivityIcon size={48} className="mx-auto text-gray-400 mb-4" />
        <p className="text-gray-600">No activity yet</p>
        <p className="text-sm text-gray-500 mt-1">Activity will appear here as changes are made</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 text-lg flex items-center gap-2">
        <ActivityIcon size={20} className="text-orange-600" />
        Activity Timeline
      </h3>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={activity.id} className="relative flex gap-4">
              <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 ${getActivityColor(activity.type)} flex items-center justify-center z-10 bg-white`}>
                {getActivityIcon(activity.type)}
              </div>

              <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{activity.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
                    {activity.metadata && (
                      <div className="mt-2 text-xs text-gray-500">
                        {Object.entries(activity.metadata).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="font-medium capitalize">{key.replace('_', ' ')}:</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">{formatTimestamp(activity.timestamp)}</p>
                    {activity.user && (
                      <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 justify-end">
                        <User size={12} />
                        {activity.user}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
