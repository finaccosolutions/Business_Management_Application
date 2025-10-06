import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, StickyNote } from 'lucide-react';

interface NoteModalProps {
  customerId: string | null;
  leadId: string | null;
  noteId?: string;
  initialData?: {
    note: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function NoteModal({
  customerId,
  leadId,
  noteId,
  initialData,
  onClose,
  onSuccess,
}: NoteModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    note: initialData?.note || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      if (noteId) {
        const { error } = await supabase
          .from('customer_notes')
          .update({
            note: formData.note,
            content: formData.note,
            updated_at: new Date().toISOString(),
          })
          .eq('id', noteId);

        if (error) throw error;

        if (customerId) {
          await supabase.from('customer_activities').insert({
            user_id: user.id,
            customer_id: customerId,
            activity_type: 'note',
            activity_title: 'Note updated',
            activity_description: formData.note.substring(0, 100),
          });
        }
      } else {
        const noteData: any = {
          user_id: user.id,
          note: formData.note,
          title: 'Note',
          content: formData.note,
        };

        if (customerId) {
          noteData.customer_id = customerId;
        } else if (leadId) {
          noteData.lead_id = leadId;
        }

        const { error } = await supabase.from('customer_notes').insert(noteData);

        if (error) throw error;

        if (customerId) {
          await supabase.from('customer_activities').insert({
            user_id: user.id,
            customer_id: customerId,
            activity_type: 'note',
            activity_title: 'Note created',
            activity_description: formData.note.substring(0, 100),
          });
        }
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-yellow-600 to-yellow-700 text-white p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StickyNote size={28} />
              <h2 className="text-2xl font-bold">{noteId ? 'Edit Note' : 'Add Note'}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Enter your note..."
              rows={8}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : noteId ? 'Update Note' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
