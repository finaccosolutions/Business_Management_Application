import { X, Filter } from 'lucide-react';

interface ServiceFiltersProps {
  filters: {
    category: string;
    status: string;
    is_recurring: string;
  };
  onFilterChange: (filters: any) => void;
  onClose: () => void;
}

const SERVICE_CATEGORIES = [
  'Accounting',
  'Tax Filing',
  'Bookkeeping',
  'Payroll',
  'Auditing',
  'Consultation',
  'Registration',
  'Compliance',
  'Other',
];

export default function ServiceFilters({ filters, onFilterChange, onClose }: ServiceFiltersProps) {
  const handleReset = () => {
    onFilterChange({
      category: '',
      status: '',
      is_recurring: '',
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Category
        </label>
        <select
          value={filters.category}
          onChange={(e) => onFilterChange({ ...filters, category: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
        >
          <option value="">All Categories</option>
          {SERVICE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
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

      <div className="md:col-span-3 flex gap-3 justify-end">
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
