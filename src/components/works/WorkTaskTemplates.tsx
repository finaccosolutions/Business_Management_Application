import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, X, Calendar, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

interface WorkTaskTemplate {
  id: string;
  work_id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date_offset_days: number;
  estimated_hours: number | null;
  display_order: number;
}

interface Props {
  workId: string;
  onUpdate?: () => void;
}

export function WorkTaskTemplates({ workId, onUpdate }: Props) {
  const [templates, setTemplates] = useState<WorkTaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkTaskTemplate | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date_offset_days: '',
    estimated_hours: ''
  });
  const toast = useToast();

  useEffect(() => {
    fetchTemplates();
  }, [workId]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('work_task_templates')
        .select('*')
        .eq('work_id', workId)
        .order('display_order');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load task templates');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      due_date_offset_days: '',
      estimated_hours: ''
    });
    setEditingTemplate(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    if (formData.due_date_offset_days === '') {
      toast.error('Due date offset is required');
      return;
    }

    try {
      const offset = parseInt(formData.due_date_offset_days);

      if (editingTemplate) {
        const { error } = await supabase
          .from('work_task_templates')
          .update({
            title: formData.title.trim(),
            description: formData.description || null,
            priority: formData.priority,
            due_date_offset_days: offset,
            estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Template updated successfully!');
      } else {
        const { error } = await supabase
          .from('work_task_templates')
          .insert({
            work_id: workId,
            title: formData.title.trim(),
            description: formData.description || null,
            priority: formData.priority,
            due_date_offset_days: offset,
            estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
            display_order: templates.length
          });

        if (error) throw error;
        toast.success('Template created successfully!');
      }

      setShowModal(false);
      resetForm();
      fetchTemplates();
      onUpdate?.();
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error(error.message || 'Failed to save template');
    }
  };

  const handleEdit = (template: WorkTaskTemplate) => {
    setEditingTemplate(template);
    setFormData({
      title: template.title,
      description: template.description || '',
      priority: template.priority,
      due_date_offset_days: template.due_date_offset_days.toString(),
      estimated_hours: template.estimated_hours?.toString() || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('work_task_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      toast.success('Template deleted successfully!');
      fetchTemplates();
      onUpdate?.();
    } catch (error: any) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading templates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">Additional Period Tasks</h4>
          <p className="text-sm text-gray-600 mt-1">
            Tasks added here will be automatically copied to all future periods of this work
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Add Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <AlertCircle size={24} className="mx-auto text-blue-500 mb-2" />
          <p className="text-sm text-gray-700">No task templates defined yet</p>
          <p className="text-xs text-gray-600 mt-1">
            Add templates that should be automatically included in every period
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white border-2 border-gray-200 rounded-lg p-3 hover:border-orange-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h5 className="font-medium text-gray-900">{template.title}</h5>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      template.priority === 'high' ? 'bg-red-100 text-red-700' :
                      template.priority === 'medium' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {template.priority}
                    </span>
                  </div>

                  {template.description && (
                    <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-blue-500" />
                      <span>
                        Due: <strong>{template.due_date_offset_days > 0 ? '+' : ''}{template.due_date_offset_days}</strong> days from period end
                      </span>
                    </div>
                    {template.estimated_hours && (
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-gray-400" />
                        <span><strong>{template.estimated_hours}</strong>h estimated</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit template"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete template"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingTemplate ? 'Edit Task Template' : 'Add Task Template'}
                </h3>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="e.g., GST Filing, Income Tax Return"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={2}
                  placeholder="Optional task description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estimated Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.estimated_hours}
                    onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date Offset (Days) *
                </label>
                <input
                  type="number"
                  required
                  value={formData.due_date_offset_days}
                  onChange={(e) => setFormData({ ...formData, due_date_offset_days: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Days from period end date. For example: 0 = on period end date, 10 = 10 days after period end date, -5 = 5 days before period end date
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700"
                >
                  {editingTemplate ? 'Update' : 'Create'} Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
