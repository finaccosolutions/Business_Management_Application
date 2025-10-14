import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Edit2, Trash2, Folder, ChevronRight, Briefcase } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';

interface ServiceCategoryManagerProps {
  onClose: () => void;
  onCategoryUpdate: () => void;
}

interface CategoryWithServices {
  name: string;
  count: number;
  services: Array<{ id: string; name: string; service_code: string; status: string }>;
}

export default function ServiceCategoryManager({ onClose, onCategoryUpdate }: ServiceCategoryManagerProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<CategoryWithServices[]>([]);
  const [uncategorized, setUncategorized] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ old: string; new: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  useEffect(() => {
    loadCategoriesWithServices();
  }, [user]);

  const loadCategoriesWithServices = async () => {
    try {
      const { data: services, error } = await supabase
        .from('services')
        .select('id, name, service_code, category, status')
        .order('category')
        .order('name');

      if (error) throw error;

      const categoryMap: Record<string, CategoryWithServices> = {};
      const uncategorizedServices: any[] = [];

      services?.forEach(service => {
        if (!service.category) {
          uncategorizedServices.push(service);
        } else {
          if (!categoryMap[service.category]) {
            categoryMap[service.category] = {
              name: service.category,
              count: 0,
              services: []
            };
          }
          categoryMap[service.category].count++;
          categoryMap[service.category].services.push(service);
        }
      });

      setCategories(Object.values(categoryMap).sort((a, b) => a.name.localeCompare(b.name)));
      setUncategorized(uncategorizedServices);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;

    const existingCategory = categories.find(c => c.name.toLowerCase() === newCategory.toLowerCase());
    if (existingCategory) {
      toast.error('Category already exists');
      return;
    }

    setCategories([...categories, { name: newCategory, count: 0, services: [] }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewCategory('');
    toast.success('Category added successfully');
    onCategoryUpdate();
  };

  const handleRenameCategory = async () => {
    if (!editingCategory || !editingCategory.new.trim()) return;

    const existingCategory = categories.find(c => c.name.toLowerCase() === editingCategory.new.toLowerCase() && c.name !== editingCategory.old);
    if (existingCategory) {
      toast.error('A category with this name already exists');
      return;
    }

    showConfirmation({
      title: 'Rename Category',
      message: `This will rename "${editingCategory.old}" to "${editingCategory.new}" for all services in this category. Continue?`,
      confirmText: 'Rename',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('services')
            .update({ category: editingCategory!.new })
            .eq('category', editingCategory!.old);

          if (error) throw error;

          toast.success('Category renamed successfully');
          setEditingCategory(null);
          loadCategoriesWithServices();
          onCategoryUpdate();
        } catch (error) {
          console.error('Error renaming category:', error);
          toast.error('Failed to rename category');
        }
      }
    });
  };

  const handleDeleteCategory = (categoryName: string) => {
    const category = categories.find(c => c.name === categoryName);

    showConfirmation({
      title: 'Delete Category',
      message: category && category.count > 0
        ? `This category contains ${category.count} service(s). Deleting it will remove the category from all services. The services themselves will not be deleted. Continue?`
        : 'Are you sure you want to delete this category?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('services')
            .update({ category: null })
            .eq('category', categoryName);

          if (error) throw error;

          toast.success('Category deleted successfully');
          loadCategoriesWithServices();
          onCategoryUpdate();
        } catch (error) {
          console.error('Error deleting category:', error);
          toast.error('Failed to delete category');
        }
      }
    });
  };

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
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
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-3">
              <Folder className="w-7 h-7" />
              Manage Service Categories
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              Organize your services by creating, editing, and managing categories
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-all text-white hover:rotate-90 duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Add New Category
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="Enter category name"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              Categories ({categories.length})
            </h3>
            <div className="space-y-2">
              {categories.map((category) => (
                <div key={category.name} className="border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => toggleCategory(category.name)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                      >
                        <ChevronRight
                          className={`w-5 h-5 text-gray-500 transition-transform ${
                            expandedCategories.has(category.name) ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                      {editingCategory?.old === category.name ? (
                        <input
                          type="text"
                          value={editingCategory.new}
                          onChange={(e) => setEditingCategory({ ...editingCategory, new: e.target.value })}
                          onKeyPress={(e) => e.key === 'Enter' && handleRenameCategory()}
                          onBlur={() => setEditingCategory(null)}
                          autoFocus
                          className="flex-1 px-3 py-1 border border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        />
                      ) : (
                        <>
                          <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                          <span className="px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 text-sm rounded-full">
                            {category.count} {category.count === 1 ? 'service' : 'services'}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingCategory({ old: category.name, new: category.name })}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="Rename category"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.name)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expandedCategories.has(category.name) && category.services.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 p-4">
                      <div className="space-y-2">
                        {category.services.map(service => (
                          <div
                            key={service.id}
                            className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700"
                          >
                            <div className="flex items-center gap-3">
                              <Briefcase className="w-4 h-4 text-gray-400" />
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">{service.name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                  Code: {service.service_code}
                                </p>
                              </div>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              service.status === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              {service.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {categories.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                  <Folder className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                  <p>No categories yet. Add your first category above.</p>
                </div>
              )}
            </div>
          </div>

          {uncategorized.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-gray-500" />
                Uncategorized Services ({uncategorized.length})
              </h3>
              <div className="border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900/50 p-4">
                <div className="space-y-2">
                  {uncategorized.map(service => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        <Briefcase className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{service.name}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            Code: {service.service_code}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        service.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {service.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-slate-700 p-6 bg-gray-50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
