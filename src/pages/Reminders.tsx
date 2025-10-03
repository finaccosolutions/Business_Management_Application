import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Calendar, CheckCircle, Circle } from 'lucide-react';

interface Reminder {
  id: string;
  title: string;
  message: string;
  reminder_date: string;
  is_read: boolean;
  created_at: string;
}

export default function Reminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchReminders();
    }
  }, [user]);

  const fetchReminders = async () => {
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .order('reminder_date', { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('reminders')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
      fetchReminders();
    } catch (error) {
      console.error('Error marking reminder as read:', error);
    }
  };

  const deleteReminder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) return;

    try {
      const { error } = await supabase.from('reminders').delete().eq('id', id);

      if (error) throw error;
      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
    }
  };

  const unreadCount = reminders.filter((r) => !r.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reminders</h1>
        <p className="text-gray-600 mt-1">
          {unreadCount > 0
            ? `You have ${unreadCount} unread reminder${unreadCount > 1 ? 's' : ''}`
            : 'No unread reminders'}
        </p>
      </div>

      <div className="space-y-4">
        {reminders.map((reminder) => {
          const isPast = new Date(reminder.reminder_date) < new Date();
          const isToday =
            new Date(reminder.reminder_date).toDateString() === new Date().toDateString();

          return (
            <div
              key={reminder.id}
              className={`bg-white rounded-xl shadow-sm border p-6 transform transition-all duration-200 hover:shadow-lg ${
                reminder.is_read
                  ? 'border-gray-200 opacity-75'
                  : 'border-orange-200 bg-gradient-to-r from-white to-orange-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div
                      className={`p-2 rounded-lg ${
                        reminder.is_read ? 'bg-gray-100' : 'bg-orange-100'
                      }`}
                    >
                      <Bell
                        className={`w-5 h-5 ${
                          reminder.is_read ? 'text-gray-500' : 'text-orange-600'
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{reminder.title}</h3>
                      <div className="flex items-center text-sm text-gray-600 mt-1">
                        <Calendar className="w-4 h-4 mr-1" />
                        <span>
                          {new Date(reminder.reminder_date).toLocaleDateString()} -{' '}
                          {new Date(reminder.reminder_date).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isToday && (
                          <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                            Today
                          </span>
                        )}
                        {isPast && !isToday && (
                          <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-700 ml-12">{reminder.message}</p>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {!reminder.is_read && (
                    <button
                      onClick={() => markAsRead(reminder.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Mark as read"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteReminder(reminder.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Circle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {reminders.length === 0 && (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reminders</h3>
            <p className="text-gray-600">
              You're all caught up! Reminders will appear here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
