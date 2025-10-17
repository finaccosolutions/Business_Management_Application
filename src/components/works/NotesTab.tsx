import { useState } from 'react';
import { FileText, AlertCircle, Star, Plus, Edit2, Trash2, X, Lightbulb, MessageCircle, Wrench, Users as UsersIcon, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Note {
  id: string;
  note_type: string;
  title: string;
  content: string;
  is_important: boolean;
  created_at: string;
  updated_at: string;
}

interface NotesTabProps {
  workId: string;
  notes: Note[];
  onUpdate: () => void;
}

export function NotesTab({ workId, notes, onUpdate }: NotesTabProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [formData, setFormData] = useState({
    note_type: 'general',
    title: '',
    content: '',
    is_important: false,
  });

  const noteIcons: Record<string, any> = {
    general: FileText,
    technical: Wrench,
    client_feedback: MessageCircle,
    internal: UsersIcon,
    issue: AlertTriangle,
    reminder: AlertCircle,
    other: Lightbulb,
  };

  const noteColors: Record<string, string> = {
    general: 'bg-blue-50 text-blue-600 border-blue-200',
    technical: 'bg-slate-50 text-slate-600 border-slate-200',
    client_feedback: 'bg-teal-50 text-teal-600 border-teal-200',
    internal: 'bg-gray-50 text-gray-600 border-gray-200',
    issue: 'bg-red-50 text-red-600 border-red-200',
    reminder: 'bg-orange-50 text-orange-600 border-orange-200',
    other: 'bg-green-50 text-green-600 border-green-200',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        work_id: workId,
        user_id: user!.id,
        ...formData,
      };

      if (editingNote) {
        const { error } = await supabase
          .from('work_notes')
          .update(data)
          .eq('id', editingNote.id);
        if (error) throw error;
        toast.success('Note updated');
      } else {
        const { error } = await supabase
          .from('work_notes')
          .insert(data);
        if (error) throw error;
        toast.success('Note added');
      }

      resetForm();
      onUpdate();
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Failed to save note');
    }
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setFormData({
      note_type: note.note_type,
      title: note.title,
      content: note.content,
      is_important: note.is_important,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      const { error } = await supabase
        .from('work_notes')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Note deleted');
      onUpdate();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Failed to delete note');
    }
  };

  const toggleImportant = async (note: Note) => {
    try {
      const { error } = await supabase
        .from('work_notes')
        .update({ is_important: !note.is_important })
        .eq('id', note.id);
      if (error) throw error;
      toast.success(note.is_important ? 'Unmarked as important' : 'Marked as important');
      onUpdate();
    } catch (error) {
      console.error('Error updating note:', error);
      toast.error('Failed to update note');
    }
  };

  const resetForm = () => {
    setFormData({
      note_type: 'general',
      title: '',
      content: '',
      is_important: false,
    });
    setEditingNote(null);
    setShowModal(false);
  };

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.is_important !== b.is_important) {
      return a.is_important ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const importantNotes = notes.filter(n => n.is_important);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">Notes & Documentation</h3>
          <p className="text-sm text-gray-600 mt-1">
            Keep track of important information and observations
            {importantNotes.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                {importantNotes.length} important
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Note</span>
        </button>
      </div>

      <div className="space-y-3">
        {sortedNotes.map((note) => {
          const Icon = noteIcons[note.note_type] || FileText;
          const colorClass = noteColors[note.note_type] || noteColors.general;

          return (
            <div
              key={note.id}
              className={`bg-white border-2 rounded-xl p-4 hover:border-orange-300 transition-colors ${
                note.is_important ? 'border-yellow-400 bg-yellow-50/30' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg border ${colorClass}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900">{note.title}</h4>
                        {note.is_important && (
                          <Star size={16} className="text-yellow-500 fill-yellow-500" />
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                          {note.note_type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {new Date(note.created_at).toLocaleString()}
                        {note.updated_at !== note.created_at && (
                          <span className="ml-2">(edited {new Date(note.updated_at).toLocaleString()})</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 ml-12 whitespace-pre-wrap">{note.content}</p>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleImportant(note)}
                    className={`p-2 rounded-lg transition-colors ${
                      note.is_important
                        ? 'text-yellow-600 hover:bg-yellow-100'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={note.is_important ? 'Unmark as important' : 'Mark as important'}
                  >
                    <Star size={18} className={note.is_important ? 'fill-yellow-500' : ''} />
                  </button>
                  <button
                    onClick={() => handleEdit(note)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit note"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete note"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {notes.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 font-medium">No notes yet</p>
            <p className="text-sm text-gray-500 mt-2">
              Add notes to document important information, issues, or observations
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
                <FileText size={28} />
                {editingNote ? 'Edit Note' : 'Add Note'}
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
                  value={formData.note_type}
                  onChange={(e) => setFormData({ ...formData, note_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="general">General</option>
                  <option value="technical">Technical</option>
                  <option value="client_feedback">Client Feedback</option>
                  <option value="internal">Internal</option>
                  <option value="issue">Issue</option>
                  <option value="reminder">Reminder</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Brief title for the note"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content *</label>
                <textarea
                  required
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Write your note here..."
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_important}
                    onChange={(e) => setFormData({ ...formData, is_important: e.target.checked })}
                    className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                  />
                  <Star size={16} className={formData.is_important ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'} />
                  Mark as Important
                </label>
                <p className="text-xs text-gray-600 mt-2 ml-6">
                  Important notes appear at the top and are highlighted
                </p>
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
                {editingNote ? 'Update' : 'Add'} Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
