import { useState } from 'react';
import { Phone, Mail, MessageSquare, Users as UsersIcon, Plus, Edit2, Trash2, Calendar, CheckCircle, AlertCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Communication {
  id: string;
  communication_type: string;
  subject: string;
  description: string | null;
  communication_date: string;
  participants: string | null;
  outcome: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
  created_at: string;
}

interface CommunicationsTabProps {
  workId: string;
  communications: Communication[];
  onUpdate: () => void;
}

export function CommunicationsTab({ workId, communications, onUpdate }: CommunicationsTabProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingCommunication, setEditingCommunication] = useState<Communication | null>(null);
  const [formData, setFormData] = useState({
    communication_type: 'call',
    subject: '',
    description: '',
    communication_date: new Date().toISOString().split('T')[0],
    participants: '',
    outcome: '',
    follow_up_required: false,
    follow_up_date: '',
  });

  const communicationIcons: Record<string, any> = {
    call: Phone,
    email: Mail,
    meeting: UsersIcon,
    message: MessageSquare,
    note: Edit2,
    other: AlertCircle,
  };

  const communicationColors: Record<string, string> = {
    call: 'bg-blue-50 text-blue-600 border-blue-200',
    email: 'bg-teal-50 text-teal-600 border-teal-200',
    meeting: 'bg-orange-50 text-orange-600 border-orange-200',
    message: 'bg-green-50 text-green-600 border-green-200',
    note: 'bg-gray-50 text-gray-600 border-gray-200',
    other: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        work_id: workId,
        user_id: user!.id,
        ...formData,
        description: formData.description || null,
        participants: formData.participants || null,
        outcome: formData.outcome || null,
        follow_up_date: formData.follow_up_required && formData.follow_up_date ? formData.follow_up_date : null,
      };

      if (editingCommunication) {
        const { error } = await supabase
          .from('work_communications')
          .update(data)
          .eq('id', editingCommunication.id);
        if (error) throw error;
        toast.success('Communication updated');
      } else {
        const { error } = await supabase
          .from('work_communications')
          .insert(data);
        if (error) throw error;
        toast.success('Communication added');
      }

      resetForm();
      onUpdate();
    } catch (error) {
      console.error('Error saving communication:', error);
      toast.error('Failed to save communication');
    }
  };

  const handleEdit = (communication: Communication) => {
    setEditingCommunication(communication);
    setFormData({
      communication_type: communication.communication_type,
      subject: communication.subject,
      description: communication.description || '',
      communication_date: communication.communication_date,
      participants: communication.participants || '',
      outcome: communication.outcome || '',
      follow_up_required: communication.follow_up_required,
      follow_up_date: communication.follow_up_date || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this communication?')) return;
    try {
      const { error } = await supabase
        .from('work_communications')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Communication deleted');
      onUpdate();
    } catch (error) {
      console.error('Error deleting communication:', error);
      toast.error('Failed to delete communication');
    }
  };

  const resetForm = () => {
    setFormData({
      communication_type: 'call',
      subject: '',
      description: '',
      communication_date: new Date().toISOString().split('T')[0],
      participants: '',
      outcome: '',
      follow_up_required: false,
      follow_up_date: '',
    });
    setEditingCommunication(null);
    setShowModal(false);
  };

  const sortedCommunications = [...communications].sort(
    (a, b) => new Date(b.communication_date).getTime() - new Date(a.communication_date).getTime()
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">Communications Log</h3>
          <p className="text-sm text-gray-600 mt-1">Track all interactions and communications</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Communication</span>
        </button>
      </div>

      <div className="space-y-3">
        {sortedCommunications.map((comm) => {
          const Icon = communicationIcons[comm.communication_type] || AlertCircle;
          const colorClass = communicationColors[comm.communication_type] || communicationColors.other;

          return (
            <div key={comm.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg border ${colorClass}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{comm.subject}</h4>
                      <p className="text-sm text-gray-500">
                        {new Date(comm.communication_date).toLocaleDateString()} •{' '}
                        {comm.communication_type.charAt(0).toUpperCase() + comm.communication_type.slice(1)}
                      </p>
                    </div>
                  </div>

                  {comm.description && (
                    <p className="text-sm text-gray-700 mt-2 ml-12">{comm.description}</p>
                  )}

                  {comm.participants && (
                    <div className="text-sm text-gray-600 mt-2 ml-12 flex items-center gap-2">
                      <UsersIcon size={14} />
                      <span>Participants: {comm.participants}</span>
                    </div>
                  )}

                  {comm.outcome && (
                    <div className="text-sm text-gray-700 mt-2 ml-12 bg-blue-50 border border-blue-200 rounded-lg p-2">
                      <strong className="text-blue-900">Outcome:</strong> {comm.outcome}
                    </div>
                  )}

                  {comm.follow_up_required && (
                    <div className="mt-2 ml-12 flex items-center gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-2 inline-flex">
                      <AlertCircle size={14} />
                      <span>
                        Follow-up required
                        {comm.follow_up_date && ` by ${new Date(comm.follow_up_date).toLocaleDateString()}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(comm)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit communication"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(comm.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete communication"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {communications.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 font-medium">No communications yet</p>
            <p className="text-sm text-gray-500 mt-2">
              Log calls, emails, meetings, and other interactions here
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <MessageSquare size={28} />
                {editingCommunication ? 'Edit Communication' : 'Add Communication'}
              </h2>
              <button
                onClick={resetForm}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                <select
                  required
                  value={formData.communication_type}
                  onChange={(e) => setFormData({ ...formData, communication_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="call">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="message">Message</option>
                  <option value="note">Note</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
                <input
                  type="text"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Brief description of communication"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                <input
                  type="date"
                  required
                  value={formData.communication_date}
                  onChange={(e) => setFormData({ ...formData, communication_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Participants</label>
                <input
                  type="text"
                  value={formData.participants}
                  onChange={(e) => setFormData({ ...formData, participants: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Who was involved in this communication?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="What was discussed or communicated?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Outcome</label>
                <textarea
                  value={formData.outcome}
                  onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="What was the result or decision?"
                />
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.follow_up_required}
                    onChange={(e) => setFormData({ ...formData, follow_up_required: e.target.checked })}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  Follow-up Required
                </label>

                {formData.follow_up_required && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Follow-up Date</label>
                    <input
                      type="date"
                      value={formData.follow_up_date}
                      onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}
              </div>
            </form>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all font-medium shadow-lg"
              >
                {editingCommunication ? 'Update' : 'Add'} Communication
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
