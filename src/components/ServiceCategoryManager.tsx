import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Edit2, Trash2, Folder, Briefcase, Save, XCircle } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';

interface ServiceCategoryManagerProps {
  onClose: () => void;
  onCategoryUpdate: () => void;
}

interface ServiceCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  service_count?: number;
}

interface WorkCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  work_count?: number;
}

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
];

export default function ServiceCategoryManager({ onClose, onCategoryUpdate }: ServiceCategoryManagerProps) {
  const { user } = useAuth();
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [workCategories, setWorkCategories] = useState<WorkCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingServiceCategory, setEditingServiceCategory] = useState<ServiceCategory | null>(null);
  const [editingWorkCategory, setEditingWorkCategory] = useState<WorkCategory | null>(null);
  const [newServiceCategory, setNewServiceCategory] = useState({ name: '', description: '', color: PRESET_COLORS[0] });
  const [newWorkCategory, setNewWorkCategory] = useState({ name: '', description: '', color: PRESET_COLORS[0] });
  const [activeTab, setActiveTab] = useState<'service' | 'work'>('service');
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  useEffect(() => {
    loadCategories();
  }, [user]);

  const loadCategories = async () => {
    try {
      const [serviceCats, workCats, services, works] = await Promise.all([
        supabase.from('service_categories').select('*').order('name'),
        supabase.from('work_categories').select('*').order('name'),
        supabase.from('services').select('id, category'),
        supabase.from('works').select('id, category')
      ]);

      if (serviceCats.error) throw serviceCats.error;
      if (workCats.error) throw workCats.error;

      const serviceCategoriesWithCount = (serviceCats.data || []).map(cat => ({
        ...cat,
        service_count: services.data?.filter(s => s.category === cat.name).length || 0
      }));

      const workCategoriesWithCount = (workCats.data || []).map(cat => ({
        ...cat,
        work_count: works.data?.filter(w => w.category === cat.name).length || 0
      }));

      setServiceCategories(serviceCategoriesWithCount);
      setWorkCategories(workCategoriesWithCount);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleAddServiceCategory = async () => {
    if (!newServiceCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      const { error } = await supabase.from('service_categories').insert({
        user_id: user!.id,
        name: newServiceCategory.name.trim(),
        description: newServiceCategory.description.trim() || null,
        color: newServiceCategory.color
      });

      if (error) throw error;

      toast.success('Service category added successfully');
      setNewServiceCategory({ name: '', description: '', color: PRESET_COLORS[0] });
      loadCategories();
      onCategoryUpdate();
    } catch (error: any) {
      console.error('Error adding service category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to add category');
      }
    }
  };

  const handleAddWorkCategory = async () => {
    if (!newWorkCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      const { error } = await supabase.from('work_categories').insert({
        user_id: user!.id,
        name: newWorkCategory.name.trim(),
        description: newWorkCategory.description.trim() || null,
        color: newWorkCategory.color
      });

      if (error) throw error;

      toast.success('Work category added successfully');
      setNewWorkCategory({ name: '', description: '', color: PRESET_COLORS[0] });
      loadCategories();
    } catch (error: any) {
      console.error('Error adding work category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to add category');
      }
    }
  };

  const handleUpdateServiceCategory = async () => {
    if (!editingServiceCategory) return;

    try {
      const { error } = await supabase
        .from('service_categories')
        .update({
          name: editingServiceCategory.name.trim(),
          description: editingServiceCategory.description?.trim() || null,
          color: editingServiceCategory.color,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingServiceCategory.id);

      if (error) throw error;

      await supabase
        .from('services')
        .update({ category: editingServiceCategory.name.trim() })
        .eq('category', serviceCategories.find(c => c.id === editingServiceCategory.id)?.name);

      toast.success('Service category updated successfully');
      setEditingServiceCategory(null);
      loadCategories();
      onCategoryUpdate();
    } catch (error: any) {
      console.error('Error updating service category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to update category');
      }
    }
  };

  const handleUpdateWorkCategory = async () => {
    if (!editingWorkCategory) return;

    try {
      const { error } = await supabase
        .from('work_categories')
        .update({
          name: editingWorkCategory.name.trim(),
          description: editingWorkCategory.description?.trim() || null,
          color: editingWorkCategory.color,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingWorkCategory.id);

      if (error) throw error;

      await supabase
        .from('works')
        .update({ category: editingWorkCategory.name.trim() })
        .eq('category', workCategories.find(c => c.id === editingWorkCategory.id)?.name);

      toast.success('Work category updated successfully');
      setEditingWorkCategory(null);
      loadCategories();
    } catch (error: any) {
      console.error('Error updating work category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to update category');
      }
    }
  };

  const handleDeleteServiceCategory = (category: ServiceCategory) => {
    showConfirmation({
      title: 'Delete Service Category',
      message: category.service_count && category.service_count > 0
        ? `This category is used by ${category.service_count} service(s). Deleting it will remove the category from all services. Continue?`
        : 'Are you sure you want to delete this category?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          await supabase.from('services').update({ category: null }).eq('category', category.name);

          const { error } = await supabase.from('service_categories').delete().eq('id', category.id);
          if (error) throw error;

          toast.success('Service category deleted successfully');
          loadCategories();
          onCategoryUpdate();
        } catch (error) {
          console.error('Error deleting service category:', error);
          toast.error('Failed to delete category');
        }
      }
    });
  };

  const handleDeleteWorkCategory = (category: WorkCategory) => {
    showConfirmation({
      title: 'Delete Work Category',
      message: category.work_count && category.work_count > 0
        ? `This category is used by ${category.work_count} work(s). Deleting it will remove the category from all works. Continue?`
        : 'Are you sure you want to delete this category?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          await supabase.from('works').update({ category: null }).eq('category', category.name);

          const { error } = await supabase.from('work_categories').delete().eq('id', category.id);
          if (error) throw error;

          toast.success('Work category deleted successfully');
          loadCategories();
        } catch (error) {
          console.error('Error deleting work category:', error);
          toast.error('Failed to delete category');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-3">
              <Folder className="w-7 h-7" />
              Manage Categories
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              Organize your services and works by creating and managing categories
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-all text-white hover:rotate-90 duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
          <div className="flex">
            <button
              onClick={() => setActiveTab('service')}
              className={`flex-1 px-6 py-3 font-medium transition-colors ${
                activeTab === 'service'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Briefcase className="w-5 h-5" />
                Service Categories ({serviceCategories.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('work')}
              className={`flex-1 px-6 py-3 font-medium transition-colors ${
                activeTab === 'work'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Folder className="w-5 h-5" />
                Work Categories ({workCategories.length})
              </div>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'service' ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border border-blue-200 dark:border-slate-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-lg">
                  <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Add New Service Category
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Category Name *
                    </label>
                    <input
                      type="text"
                      value={newServiceCategory.name}
                      onChange={(e) => setNewServiceCategory({ ...newServiceCategory, name: e.target.value })}
                      placeholder="e.g., Tax Filing, Auditing"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newServiceCategory.description}
                      onChange={(e) => setNewServiceCategory({ ...newServiceCategory, description: e.target.value })}
                      placeholder="Optional description"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Color
                    </label>
                    <div className="flex gap-2">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewServiceCategory({ ...newServiceCategory, color })}
                          className={`w-10 h-10 rounded-lg transition-all ${
                            newServiceCategory.color === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddServiceCategory}
                      className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Add Category
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-lg">
                  Service Categories
                </h3>
                {serviceCategories.length === 0 ? (
                  <div className="text-center py-16 bg-gray-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700">
                    <Folder className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-slate-600" />
                    <p className="text-gray-600 dark:text-slate-400 text-lg">No service categories yet</p>
                    <p className="text-sm text-gray-500 dark:text-slate-500 mt-2">Add your first category above to get started</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-white dark:bg-slate-800 rounded-lg overflow-hidden shadow-sm">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Color</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Name</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Description</th>
                          <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">Services</th>
                          <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceCategories.map((category) => (
                          <tr key={category.id} className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                            <td className="px-6 py-4">
                              {editingServiceCategory?.id === category.id ? (
                                <div className="flex gap-1">
                                  {PRESET_COLORS.map(color => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => setEditingServiceCategory({ ...editingServiceCategory, color })}
                                      className={`w-6 h-6 rounded ${
                                        editingServiceCategory.color === color ? 'ring-2 ring-blue-500' : ''
                                      }`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: category.color || '#3B82F6' }} />
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {editingServiceCategory?.id === category.id ? (
                                <input
                                  type="text"
                                  value={editingServiceCategory.name}
                                  onChange={(e) => setEditingServiceCategory({ ...editingServiceCategory, name: e.target.value })}
                                  className="w-full px-3 py-1 border border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                />
                              ) : (
                                <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {editingServiceCategory?.id === category.id ? (
                                <input
                                  type="text"
                                  value={editingServiceCategory.description || ''}
                                  onChange={(e) => setEditingServiceCategory({ ...editingServiceCategory, description: e.target.value })}
                                  className="w-full px-3 py-1 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                  placeholder="Description"
                                />
                              ) : (
                                <span className="text-sm text-gray-600 dark:text-slate-400">{category.description || '-'}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm rounded-full font-medium">
                                {category.service_count || 0}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                {editingServiceCategory?.id === category.id ? (
                                  <>
                                    <button
                                      onClick={handleUpdateServiceCategory}
                                      className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                      title="Save changes"
                                    >
                                      <Save className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => setEditingServiceCategory(null)}
                                      className="p-2 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                      title="Cancel"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setEditingServiceCategory(category)}
                                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                      title="Edit category"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteServiceCategory(category)}
                                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                      title="Delete category"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border border-green-200 dark:border-slate-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-lg">
                  <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
                  Add New Work Category
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Category Name *
                    </label>
                    <input
                      type="text"
                      value={newWorkCategory.name}
                      onChange={(e) => setNewWorkCategory({ ...newWorkCategory, name: e.target.value })}
                      placeholder="e.g., Urgent, Recurring, Advisory"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newWorkCategory.description}
                      onChange={(e) => setNewWorkCategory({ ...newWorkCategory, description: e.target.value })}
                      placeholder="Optional description"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Color
                    </label>
                    <div className="flex gap-2">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewWorkCategory({ ...newWorkCategory, color })}
                          className={`w-10 h-10 rounded-lg transition-all ${
                            newWorkCategory.color === color ? 'ring-2 ring-offset-2 ring-green-500 scale-110' : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddWorkCategory}
                      className="w-full px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Add Category
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-lg">
                  Work Categories
                </h3>
                {workCategories.length === 0 ? (
                  <div className="text-center py-16 bg-gray-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700">
                    <Folder className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-slate-600" />
                    <p className="text-gray-600 dark:text-slate-400 text-lg">No work categories yet</p>
                    <p className="text-sm text-gray-500 dark:text-slate-500 mt-2">Add your first category above to get started</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-white dark:bg-slate-800 rounded-lg overflow-hidden shadow-sm">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Color</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Name</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Description</th>
                          <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">Works</th>
                          <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workCategories.map((category) => (
                          <tr key={category.id} className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                            <td className="px-6 py-4">
                              {editingWorkCategory?.id === category.id ? (
                                <div className="flex gap-1">
                                  {PRESET_COLORS.map(color => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => setEditingWorkCategory({ ...editingWorkCategory, color })}
                                      className={`w-6 h-6 rounded ${
                                        editingWorkCategory.color === color ? 'ring-2 ring-green-500' : ''
                                      }`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: category.color || '#10B981' }} />
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {editingWorkCategory?.id === category.id ? (
                                <input
                                  type="text"
                                  value={editingWorkCategory.name}
                                  onChange={(e) => setEditingWorkCategory({ ...editingWorkCategory, name: e.target.value })}
                                  className="w-full px-3 py-1 border border-green-500 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                />
                              ) : (
                                <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {editingWorkCategory?.id === category.id ? (
                                <input
                                  type="text"
                                  value={editingWorkCategory.description || ''}
                                  onChange={(e) => setEditingWorkCategory({ ...editingWorkCategory, description: e.target.value })}
                                  className="w-full px-3 py-1 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                  placeholder="Description"
                                />
                              ) : (
                                <span className="text-sm text-gray-600 dark:text-slate-400">{category.description || '-'}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm rounded-full font-medium">
                                {category.work_count || 0}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                {editingWorkCategory?.id === category.id ? (
                                  <>
                                    <button
                                      onClick={handleUpdateWorkCategory}
                                      className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                      title="Save changes"
                                    >
                                      <Save className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => setEditingWorkCategory(null)}
                                      className="p-2 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                      title="Cancel"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setEditingWorkCategory(category)}
                                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                      title="Edit category"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteWorkCategory(category)}
                                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                      title="Delete category"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-slate-700 p-6 bg-gray-50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
