import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Trash2, Image as ImageIcon } from 'lucide-react';

interface AddServiceModalProps {
  onClose: () => void;
  onSuccess: () => void;
  service?: any;
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
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function AddServiceModal({ onClose, onSuccess, service: editingService }: AddServiceModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    service_code: '',
    category: '',
    description: '',
    image_url: '',
    estimated_duration_hours: 0,
    estimated_duration_minutes: 0,
    estimated_duration_value: 0,
    estimated_duration_unit: 'days',
    default_price: '',
    tax_rate: '0',
    is_recurring: false,
    recurrence_type: 'monthly',
    recurrence_day: 1,
    recurrence_month: 1,
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
        image_url: editingService.image_url || '',
        estimated_duration_hours: editingService.estimated_duration_hours || 0,
        estimated_duration_minutes: editingService.estimated_duration_minutes || 0,
        estimated_duration_value: editingService.estimated_duration_value || 0,
        estimated_duration_unit: editingService.estimated_duration_unit || 'days',
        default_price: editingService.default_price?.toString() || '',
        tax_rate: editingService.tax_rate?.toString() || '0',
        is_recurring: editingService.is_recurring || false,
        recurrence_type: editingService.recurrence_type || 'monthly',
        recurrence_day: editingService.recurrence_day || 1,
        recurrence_month: editingService.recurrence_month || 1,
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
      const serviceData: any = {
        user_id: user!.id,
        name: formData.name,
        service_code: formData.service_code || null,
        category: formData.category || null,
        description: formData.description || null,
        image_url: formData.image_url || null,
        estimated_duration_hours: formData.estimated_duration_hours,
        estimated_duration_minutes: formData.estimated_duration_minutes,
        estimated_duration_value: formData.estimated_duration_value,
        estimated_duration_unit: formData.estimated_duration_unit,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
        tax_rate: parseFloat(formData.tax_rate),
        is_recurring: formData.is_recurring,
        recurrence_type: formData.is_recurring ? formData.recurrence_type : null,
        recurrence_day: null,
        recurrence_days: null,
        recurrence_start_date: formData.recurrence_start_date || null,
        recurrence_end_date: formData.recurrence_end_date || null,
        advance_notice_days: formData.advance_notice_days,
        auto_generate_work: formData.auto_generate_work,
        status: formData.status,
        custom_fields: formData.custom_fields,
        updated_at: new Date().toISOString(),
      };

      if (formData.is_recurring) {
        if (formData.recurrence_type === 'monthly') {
          serviceData.recurrence_day = formData.recurrence_day;
        } else if (formData.recurrence_type === 'weekly') {
          serviceData.recurrence_days = formData.recurrence_days;
        } else if (formData.recurrence_type === 'quarterly') {
          serviceData.custom_fields = {
            ...formData.custom_fields,
            quarterly_day: formData.recurrence_day,
            quarterly_month: ((formData.recurrence_day - 1) % 3) + 1,
          };
        } else if (formData.recurrence_type === 'half-yearly') {
          serviceData.custom_fields = {
            ...formData.custom_fields,
            half_yearly_day: formData.recurrence_day,
            half_yearly_month: formData.recurrence_month,
          };
        } else if (formData.recurrence_type === 'yearly') {
          serviceData.custom_fields = {
            ...formData.custom_fields,
            yearly_day: formData.recurrence_day,
            yearly_month: formData.recurrence_month,
          };
        }
      }

      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id);

        if (error) throw error;

        if (formData.is_recurring && editingService.is_recurring) {
          await supabase
            .from('works')
            .update({
              due_date: new Date().toISOString(),
            })
            .eq('service_id', editingService.id)
            .eq('status', 'pending');
        }
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

  const getOrdinalSuffix = (num: number) => {
    if (num === 1 || num === 21 || num === 31) return 'st';
    if (num === 2 || num === 22) return 'nd';
    if (num === 3 || num === 23) return 'rd';
    return 'th';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 p-6 flex items-center justify-between z-10 rounded-t-xl shadow-lg">
          <div>
            <h2 className="text-2xl font-bold text-white drop-shadow-md">
              {editingService ? 'Edit Service' : 'Add New Service'}
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              {editingService ? 'Update service details and settings' : 'Create a new service for your business'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-all text-white hover:rotate-90 duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                  placeholder="Auto-generated (e.g., SRV-001)"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Leave blank to auto-generate
                </p>
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

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Service Image URL
              </label>
              <div className="flex space-x-2">
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="https://example.com/service-image.jpg"
                />
                {formData.image_url && (
                  <div className="w-12 h-12 border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-slate-700">
                    <img
                      src={formData.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <ImageIcon className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Provide a URL to an image representing this service
              </p>
            </div>
          </div>

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
                  <input
                    type="number"
                    min="0"
                    value={formData.estimated_duration_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estimated_duration_value: parseInt(e.target.value) || 0,
                      })
                    }
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    placeholder="Duration"
                  />
                  <select
                    value={formData.estimated_duration_unit}
                    onChange={(e) =>
                      setFormData({ ...formData, estimated_duration_unit: e.target.value })
                    }
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  How long this service typically takes to complete
                </p>
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

          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border border-blue-200 dark:border-slate-600">
            <div className="flex items-center space-x-3 mb-2">
              <input
                type="checkbox"
                id="is_recurring"
                checked={formData.is_recurring}
                onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="is_recurring" className="text-lg font-semibold text-gray-900 dark:text-white">
                Recurring Service
              </label>
            </div>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 ml-8">
              Enable automatic work generation for services that repeat on a schedule
            </p>

            {formData.is_recurring && (
              <div className="space-y-5 mt-6">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Schedule Configuration
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        How Often?
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Day of Month
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
                            Day {day}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center">
                        <span className="font-medium">Due every month on day {formData.recurrence_day}</span>
                      </p>
                    </div>
                  )}

                  {formData.recurrence_type === 'weekly' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Select Days of Week
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleWeekday(day.value)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all shadow-sm ${
                              formData.recurrence_days.includes(day.value)
                                ? 'bg-blue-500 text-white shadow-blue-200 dark:shadow-blue-900'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      {formData.recurrence_days.length > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                          Due every week on: {formData.recurrence_days
                            .sort((a, b) => a - b)
                            .map(d => WEEKDAYS.find(w => w.value === d)?.label)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  {formData.recurrence_type === 'quarterly' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Day of Quarter
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
                            Day {day}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        Due on day {formData.recurrence_day} of the first month of each quarter (Jan, Apr, Jul, Oct)
                      </p>
                    </div>
                  )}

                  {formData.recurrence_type === 'half-yearly' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Month (Half-Yearly)
                        </label>
                        <select
                          value={formData.recurrence_month}
                          onChange={(e) =>
                            setFormData({ ...formData, recurrence_month: parseInt(e.target.value) })
                          }
                          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                          {MONTHS.slice(0, 6).map((month) => (
                            <option key={month.value} value={month.value}>
                              {month.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Day (Due Date)
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
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Due twice a year: {MONTHS[formData.recurrence_month - 1].label} {formData.recurrence_day} and {MONTHS[formData.recurrence_month + 5].label} {formData.recurrence_day}
                        </p>
                      </div>
                    </>
                  )}

                  {formData.recurrence_type === 'yearly' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Month (Yearly Due)
                        </label>
                        <select
                          value={formData.recurrence_month}
                          onChange={(e) =>
                            setFormData({ ...formData, recurrence_month: parseInt(e.target.value) })
                          }
                          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                          {MONTHS.map((month) => (
                            <option key={month.value} value={month.value}>
                              {month.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          Day (Due Date)
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
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Due annually on {MONTHS[formData.recurrence_month - 1].label} {formData.recurrence_day}
                        </p>
                      </div>
                    </>
                  )}

                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Date Range
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        Leave blank for indefinite recurrence
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Automation Settings
                  </h4>
                  <div className="space-y-3">
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
                        Work items will be created this many days before the due date
                      </p>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-blue-50 dark:bg-slate-700 rounded-lg">
                      <input
                        type="checkbox"
                        id="auto_generate_work"
                        checked={formData.auto_generate_work}
                        onChange={(e) =>
                          setFormData({ ...formData, auto_generate_work: e.target.checked })
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                      />
                      <div>
                        <label htmlFor="auto_generate_work" className="text-sm font-medium text-gray-900 dark:text-white block">
                          Auto-generate work items
                        </label>
                        <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">
                          Automatically create work tasks for customers based on this schedule
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
