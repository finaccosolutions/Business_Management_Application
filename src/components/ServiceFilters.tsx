import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Filter } from 'lucide-react';

interface ServiceFiltersProps {
  filters: {
    category_id: string;
    subcategory_id: string;
    status: string;
    is_recurring: string;
  };
  onFilterChange: (filters: any) => void;
  onClose: () => void;
}

interface Category {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
}

export default function ServiceFilters({ filters, onFilterChange, onClose }: ServiceFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (filters.category_id) {
      loadSubcategories(filters.category_id);
    } else {
      setSubcategories([]);
    }
  }, [filters.category_id]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('id, name, level, parent_id')
        .eq('level', 0)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadSubcategories = async (categoryId: string) => {
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('id, name, level, parent_id')
        .eq('parent_id', categoryId)
        .order('name');

      if (error) throw error;
      setSubcategories(data || []);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    onFilterChange({
      ...filters,
      category_id: categoryId,
      subcategory_id: ''
    });
  };

  const handleReset = () => {
    onFilterChange({
      category_id: '',
      subcategory_id: '',
      status: '',
      is_recurring: '',
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Category
        </label>
        <select
          value={filters.category_id}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Subcategory
        </label>
        <select
          value={filters.subcategory_id}
          onChange={(e) => onFilterChange({ ...filters, subcategory_id: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!filters.category_id || subcategories.length === 0}
        >
          <option value="">All Subcategories</option>
          {subcategories.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Service Type
        </label>
        <select
          value={filters.is_recurring}
          onChange={(e) => onFilterChange({ ...filters, is_recurring: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
        >
          <option value="">All Types</option>
          <option value="true">Recurring</option>
          <option value="false">One-Time</option>
        </select>
      </div>

      <div className="md:col-span-4 flex gap-3 justify-end">
        <button
          onClick={handleReset}
          className="px-6 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium"
        >
          Reset Filters
        </button>
      </div>
    </div>
  );
}
