import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, ArrowLeft, Plus, Edit2, Trash2, Folder, FolderTree, Save, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
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
  parent_id: string | null;
  level: number;
  display_order: number;
  service_count?: number;
  subcategories?: ServiceCategory[];
  expanded?: boolean;
}

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
];

export default function ServiceCategoryManager({ onClose, onCategoryUpdate }: ServiceCategoryManagerProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    color: PRESET_COLORS[0],
    parent_id: null as string | null,
    level: 0
  });
  const [showSubcategoryForm, setShowSubcategoryForm] = useState<string | null>(null);
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  useEffect(() => {
    loadCategories();
  }, [user]);

  const loadCategories = async () => {
    try {
      const [categoriesData, services] = await Promise.all([
        supabase
          .from('service_categories')
          .select('*')
          .order('display_order')
          .order('name'),
        supabase.from('services').select('id, category_id, subcategory_id')
      ]);

      if (categoriesData.error) throw categoriesData.error;

      const allCategories = categoriesData.data || [];

      const categoriesWithCount = allCategories.map(cat => ({
        ...cat,
        service_count: services.data?.filter(s =>
          cat.level === 0
            ? s.category_id === cat.id
            : s.subcategory_id === cat.id
        ).length || 0,
        expanded: true
      }));

      const rootCategories = categoriesWithCount
        .filter(c => c.level === 0)
        .map(cat => ({
          ...cat,
          subcategories: categoriesWithCount.filter(sub => sub.parent_id === cat.id)
        }));

      setCategories(rootCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      const maxOrder = await supabase
        .from('service_categories')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1);

      const { error } = await supabase.from('service_categories').insert({
        user_id: user!.id,
        name: newCategory.name.trim(),
        description: newCategory.description.trim() || null,
        color: newCategory.color,
        parent_id: newCategory.parent_id,
        level: newCategory.level,
        display_order: (maxOrder.data?.[0]?.display_order || 0) + 1
      });

      if (error) throw error;

      toast.success(`${newCategory.level === 0 ? 'Category' : 'Subcategory'} added successfully`);
      setNewCategory({ name: '', description: '', color: PRESET_COLORS[0], parent_id: null, level: 0 });
      setShowSubcategoryForm(null);
      loadCategories();
      onCategoryUpdate();
    } catch (error: any) {
      console.error('Error adding category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to add category');
      }
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;

    try {
      const { error } = await supabase
        .from('service_categories')
        .update({
          name: editingCategory.name.trim(),
          description: editingCategory.description?.trim() || null,
          color: editingCategory.color,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingCategory.id);

      if (error) throw error;

      toast.success('Category updated successfully');
      setEditingCategory(null);
      loadCategories();
      onCategoryUpdate();
    } catch (error: any) {
      console.error('Error updating category:', error);
      if (error.code === '23505') {
        toast.error('A category with this name already exists');
      } else {
        toast.error('Failed to update category');
      }
    }
  };

  const handleDeleteCategory = (category: ServiceCategory) => {
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;
    const totalServices = category.service_count || 0;

    let message = 'Are you sure you want to delete this category?';
    if (hasSubcategories) {
      message = `This category has ${category.subcategories?.length} subcategory(ies). Deleting it will also delete all subcategories. Continue?`;
    } else if (totalServices > 0) {
      message = `This category is used by ${totalServices} service(s). Deleting it will remove the category from all services. Continue?`;
    }

    showConfirmation({
      title: 'Delete Category',
      message,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          if (category.level === 0) {
            await supabase.from('services').update({ category_id: null }).eq('category_id', category.id);
          } else {
            await supabase.from('services').update({ subcategory_id: null }).eq('subcategory_id', category.id);
          }

          const { error } = await supabase.from('service_categories').delete().eq('id', category.id);
          if (error) throw error;

          toast.success('Category deleted successfully');
          loadCategories();
          onCategoryUpdate();
        } catch (error) {
          console.error('Error deleting category:', error);
          toast.error('Failed to delete category');
        }
      }
    });
  };

  const toggleExpand = (categoryId: string) => {
    setCategories(categories.map(cat =>
      cat.id === categoryId ? { ...cat, expanded: !cat.expanded } : cat
    ));
  };

  const startAddSubcategory = (parentCategory: ServiceCategory) => {
    setShowSubcategoryForm(parentCategory.id);
    setNewCategory({
      name: '',
      description: '',
      color: parentCategory.color || PRESET_COLORS[0],
      parent_id: parentCategory.id,
      level: 1
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
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-4 sm:p-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors mr-2"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-slate-400" />
            </button>
            <FolderTree className="w-7 h-7 text-blue-600" />
            Manage Categories
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 ml-12">
            Organize your services with categories and subcategories
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-lg">
              <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Add New Category
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategory.level === 0 ? newCategory.name : ''}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="e.g., GST, Income Tax, Auditing"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  disabled={newCategory.level === 1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={newCategory.level === 0 ? newCategory.description : ''}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  disabled={newCategory.level === 1}
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
                      onClick={() => setNewCategory({ ...newCategory, color })}
                      className={`w-10 h-10 rounded-lg transition-all ${newCategory.color === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                        }`}
                      style={{ backgroundColor: color }}
                      disabled={newCategory.level === 1}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={newCategory.level === 1}
                >
                  <Plus className="w-5 h-5" />
                  Add Category
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-lg">
              Categories & Subcategories
            </h3>
            {categories.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700">
                <FolderTree className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-slate-600" />
                <p className="text-gray-600 dark:text-slate-400 text-lg">No categories yet</p>
                <p className="text-sm text-gray-500 dark:text-slate-500 mt-2">Add your first category above to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleExpand(category.id)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors"
                        >
                          {category.expanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                          )}
                        </button>

                        {editingCategory?.id === category.id ? (
                          <>
                            <div className="flex gap-2">
                              {PRESET_COLORS.map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => setEditingCategory({ ...editingCategory, color })}
                                  className={`w-6 h-6 rounded ${editingCategory.color === color ? 'ring-2 ring-blue-500' : ''
                                    }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            <input
                              type="text"
                              value={editingCategory.name}
                              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                              className="flex-1 px-3 py-1 border border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={editingCategory.description || ''}
                              onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                              className="flex-1 px-3 py-1 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              placeholder="Description"
                            />
                            <button
                              onClick={handleUpdateCategory}
                              className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingCategory(null)}
                              className="p-2 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: category.color || '#3B82F6' }} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Folder className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                                <span className="font-semibold text-gray-900 dark:text-white">{category.name}</span>
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full font-medium">
                                  {category.service_count || 0} services
                                </span>
                                {category.subcategories && category.subcategories.length > 0 && (
                                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full font-medium">
                                    {category.subcategories.length} subcategories
                                  </span>
                                )}
                              </div>
                              {category.description && (
                                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{category.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startAddSubcategory(category)}
                                className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Plus className="w-4 h-4" />
                                Add Subcategory
                              </button>
                              <button
                                onClick={() => setEditingCategory(category)}
                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(category)}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {showSubcategoryForm === category.id && (
                      <div className="p-4 bg-blue-50 dark:bg-slate-900/50 border-t border-blue-200 dark:border-slate-700">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Subcategory to {category.name}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                            placeholder="Subcategory name"
                            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          />
                          <input
                            type="text"
                            value={newCategory.description}
                            onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                            placeholder="Description (optional)"
                            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleAddCategory}
                              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setShowSubcategoryForm(null);
                                setNewCategory({ name: '', description: '', color: PRESET_COLORS[0], parent_id: null, level: 0 });
                              }}
                              className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {category.expanded && category.subcategories && category.subcategories.length > 0 && (
                      <div className="bg-gray-50 dark:bg-slate-900/30 border-t border-gray-200 dark:border-slate-700">
                        {category.subcategories.map((subcategory) => (
                          <div key={subcategory.id} className="p-4 pl-16 border-b border-gray-200 dark:border-slate-700 last:border-b-0 hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors">
                            {editingCategory?.id === subcategory.id ? (
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={editingCategory.name}
                                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                  className="flex-1 px-3 py-1 border border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                />
                                <input
                                  type="text"
                                  value={editingCategory.description || ''}
                                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                                  className="flex-1 px-3 py-1 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                  placeholder="Description"
                                />
                                <button
                                  onClick={handleUpdateCategory}
                                  className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingCategory(null)}
                                  className="p-2 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 flex-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color || '#3B82F6' }} />
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{subcategory.name}</span>
                                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full font-medium">
                                    {subcategory.service_count || 0} services
                                  </span>
                                </div>
                                {subcategory.description && (
                                  <span className="text-sm text-gray-600 dark:text-slate-400">{subcategory.description}</span>
                                )}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setEditingCategory(subcategory)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCategory(subcategory)}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
