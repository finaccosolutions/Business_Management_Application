// src/components/AddServiceModal.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Trash2 } from 'lucide-react';

interface AddServiceModalProps {
  onClose: () => void;
  onSuccess: () => void;
  editingService?: any;
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

const RECURRENCE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half-yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
];

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function AddServiceModal({ onClose, onSuccess, editingService }: AddServiceModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    service_code: '',
    category: '',
    description: '',
    estimated_duration_hours: 0,
    estimated_duration_minutes: 0,
    default_price: '',
    tax_rate: '0',
    is_recurring: false,
    recurrence_type: 'monthly',
    recurrence_day: 1,
    recurrence_days: [] as number[],
    recurrence_start_date: '',
    recurrence_end_date: '',
    advance_notice_days: 3,
    auto_generate_work: true,
    status: 'active',
    custom_fields: {},
  });

  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');

  useEffect(() => {
    if (editingService) {
      setFormData({
        name: editingService.name || '',
        service_code: editingService.service_code || '',
        category: editingService.category || '',
        description: editingService.description || '',
        estimated_duration_hours: editingService.estimated_duration_hours || 0,
        estimated_duration_minutes: editingService.estimated_duration_minutes || 0,
        default_price: editingService.default_price?.toString() || '',
        tax_rate: editingService.tax_rate?.toString() || '0',
        is_recurring: editingService.is_recurring || false,
        recurrence_type: editingService.recurrence_type || 'monthly',
        recurrence_day: editingService.recurrence_day || 1,
        recurrence_days: editingService.recurrence_days || [],
        recurrence_start_date: editingService.recurrence_start_date || '',
        recurrence_end_date: editingService.recurrence_end_date || '',
        advance_notice_days: editingService.advance_notice_days || 3,
        auto_generate_work: editingService.auto_generate_work !== false,
        status: editingService.status || 'active',
        custom_fields: editingService.custom_fields || {},
      });
    }
  }, [editingService]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const serviceData = {
        user_id: user!.id,
        name: formData.name,
        service_code: formData.service_code || null,
        category: formData.category || null,
        description: formData.description || null,
        estimated_duration_hours: formData.estimated_duration_hours,
        estimated_duration_minutes: formData.estimated_duration_minutes,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
        tax_rate: parseFloat(formData.tax_rate),
        is_recurring: formData.is_recurring,
        recurrence_type: formData.is_recurring ? formData.recurrence_type : null,
        recurrence_day: formData.is_recurring && formData.recurrence_type === 'monthly' ? formData.recurrence_day : null,
        recurrence_days: formData.is_recurring && formData.recurrence_type === 'weekly' ? formData.recurrence_days : null,
        recurrence_start_date: formData.recurrence_start_date || null,
        recurrence_end_date: formData.recurrence_end_date || null,
        advance_notice_days: formData.advance_notice_days,
        auto_generate_work: formData.auto_generate_work,
        status: formData.status,
        custom_fields: formData.custom_fields,
        updated_at: new Date().toISOString(),
      };

      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert(serviceData);
        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving service:', error);
      alert('Failed to save service');
    }
  };

  const addCustomField = () => {
    if (customFieldKey && customFieldValue) {
      setFormData({
        ...formData,
        custom_fields: {
          ...formData.custom_fields,
          [customFieldKey]: customFieldValue,
        },
      });
      setCustomFieldKey('');
      setCustomFieldValue('');
    }
  };

  const removeCustomField = (key: string) => {
    const newFields = { ...formData.custom_fields };
    delete newFields[key];
    setFormData({ ...formData, custom_fields: newFields });
  };

  const toggleWeekday = (day: number) => {
    const days = [...formData.recurrence_days];
    const index = days.indexOf(day);
    if (index > -1) {
      days.splice(index, 1);
    } else {
      days.push(day);
    }
    setFormData({ ...formData, recurrence_days: days });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {editingService ? 'Edit Service' : 'Add New Service'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="e.g., VAT Filing, Bookkeeping"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Service Code
                </label>
                <input
                  type="text"
                  value={formData.service_code}
                  onChange={(e) => setFormData({ ...formData, service_code: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="e.g., SVC-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select category</option>
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
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                rows={3}
                placeholder="Brief description of the service"
              />
            </div>
          </div>

          {/* Duration and Pricing */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Duration & Pricing
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Estimated Duration
                </label>
                <div className="flex space-x-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      value={formData.estimated_duration_hours}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          estimated_duration_hours: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      placeholder="Hours"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={formData.estimated_duration_minutes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          estimated_duration_minutes: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      placeholder="Minutes"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Default Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.default_price}
                  onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Recurring Service Settings */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                id="is_recurring"
                checked={formData.is_recurring}
                onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="is_recurring" className="text-lg font-semibold text-gray-900 dark:text-white">
                Recurring Service
              </label>
            </div>

            {formData.is_recurring && (
              <div className="space-y-4 pl-6 border-l-2 border-blue-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Recurrence Type
                    </label>
                    <select
                      value={formData.recurrence_type}
                      onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    >
                      {RECURRENCE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.recurrence_type === 'monthly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Day of Month (Due Date)
                      </label>
                      <select
                        value={formData.recurrence_day}
                        onChange={(e) =>
                          setFormData({ ...formData, recurrence_day: parseInt(e.target.value) })
                        }
                        className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        Service due on the {formData.recurrence_day}
                        {formData.recurrence_day === 1 ? 'st' : formData.recurrence_day === 2 ? 'nd' : formData.recurrence_day === 3 ? 'rd' : 'th'} of every month
                      </p>
                    </div>
                  )}

                  {formData.recurrence_type === 'weekly' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Days of Week
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleWeekday(day.value)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                              formData.recurrence_days.includes(day.value)
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {formData.recurrence_type === 'yearly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Day of Year (Due Date)
                      </label>
                      <select
                        value={formData.recurrence_day}
                        onChange={(e) =>
                          setFormData({ ...formData, recurrence_day: parseInt(e.target.value) })
                        }
                        className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formData.recurrence_start_date}
                      onChange={(e) =>
                        setFormData({ ...formData, recurrence_start_date: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      End Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={formData.recurrence_end_date}
                      onChange={(e) =>
                        setFormData({ ...formData, recurrence_end_date: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Advance Notice (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.advance_notice_days}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          advance_notice_days: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      Create work items this many days before due date
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="auto_generate_work"
                    checked={formData.auto_generate_work}
                    onChange={(e) =>
                      setFormData({ ...formData, auto_generate_work: e.target.checked })
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="auto_generate_work" className="text-sm text-gray-700 dark:text-slate-300">
                    Automatically generate work items for this recurring service
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Custom Fields */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Custom Fields
            </h3>
            <div className="space-y-3">
              {Object.entries(formData.custom_fields).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                      {key}:
                    </span>{' '}
                    <span className="text-sm text-gray-600 dark:text-slate-400">{value as string}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomField(key)}
                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <div className="flex space-x-2">
                <input
                  type="text"
                  value={customFieldKey}
                  onChange={(e) => setCustomFieldKey(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="Field name"
                />
                <input
                  type="text"
                  value={customFieldValue}
                  onChange={(e) => setCustomFieldValue(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="Field value"
                />
                <button
                  type="button"
                  onClick={addCustomField}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {editingService ? 'Update Service' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
