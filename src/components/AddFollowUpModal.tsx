// src/components/AddFollowUpModal.tsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Calendar, Clock, Phone, Mail, MessageCircle, Users, Save } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface AddFollowUpModalProps {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: FollowUp;
  mode?: 'create' | 'edit';
}

interface FollowUp {
  id?: string;
  followup_date: string;
  followup_time: string;
  followup_type: string;
  remarks: string;
  reminder_date: string;
}

export default function AddFollowUpModal({
  leadId,
  leadName,
  onClose,
  onSuccess,
  initialData,
  mode = 'create',
}: AddFollowUpModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [createReminder, setCreateReminder] = useState(true);

  const [formData, setFormData] = useState({
    followup_date: initialData?.followup_date || '',
    followup_time: initialData?.followup_time || '10:00',
    followup_type: initialData?.followup_type || 'call',
    remarks: initialData?.remarks || '',
    reminder_date: initialData?.reminder_date || '',
  });

  const followupTypes = [
    { value: 'call', label: 'Phone Call', icon: Phone, color: 'text-green-600' },
    { value: 'email', label: 'Email', icon: Mail, color: 'text-blue-600' },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-500' },
    { value: 'meeting', label: 'Meeting', icon: Users, color: 'text-orange-600' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const followupData = {
        user_id: user?.id,
        lead_id: leadId,
        ...formData,
        status: 'pending',
      };

      if (mode === 'edit' && initialData?.id) {
        const { error } = await supabase
          .from('lead_followups')
          .update(followupData)
          .eq('id', initialData.id);

        if (error) throw error;
      } else {
        const { data: followup, error } = await supabase
          .from('lead_followups')
          .insert(followupData)
          .select()
          .single();

        if (error) throw error;

        // Create reminder if enabled
        if (createReminder && formData.reminder_date) {
          await supabase.from('reminders').insert({
            user_id: user?.id,
            title: `Follow-up: ${leadName}`,
            message: `${formData.followup_type} follow-up scheduled for ${leadName}. ${formData.remarks}`,
            reminder_date: formData.reminder_date,
            is_read: false,
          });
        }
      }

      toast.success(
        mode === 'edit' ? 'Follow-up updated successfully!' : 'Follow-up scheduled successfully!'
      );
      onSuccess();
    } catch (error: any) {
      console.error('Error saving follow-up:', error.message);
      toast.error('Failed to save follow-up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Calendar size={28} />
            {mode === 'edit' ? 'Edit Follow-Up' : 'Schedule Follow-Up'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900">Lead: {leadName}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Follow-Up Type *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {followupTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, followup_type: type.value })}
                    className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                      formData.followup_type === type.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={24} className={type.color} />
                    <span className="text-sm font-medium text-gray-900">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Follow-Up Date *
              </label>
              <div className="relative">
                <Calendar
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="date"
                  required
                  value={formData.followup_date}
                  onChange={(e) => setFormData({ ...formData, followup_date: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Follow-Up Time
              </label>
              <div className="relative">
                <Clock
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="time"
                  value={formData.followup_time}
                  onChange={(e) => setFormData({ ...formData, followup_time: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remarks / Notes
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add notes about this follow-up..."
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createReminder}
                onChange={(e) => setCreateReminder(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-900">Set reminder</span>
            </label>
            {createReminder && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Remind me on
                </label>
                <input
                  type="datetime-local"
                  value={formData.reminder_date}
                  onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
            >
              <Save size={18} />
              {loading ? 'Saving...' : mode === 'edit' ? 'Update Follow-Up' : 'Schedule Follow-Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
