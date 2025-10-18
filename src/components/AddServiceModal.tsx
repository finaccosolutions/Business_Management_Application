import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, X, Plus, Trash2, Image as ImageIcon } from 'lucide-react';

interface AddServiceModalProps {
  onClose: () => void;
  onSuccess: () => void;
  service?: any;
}

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
    category_id: '',
    subcategory_id: '',
    description: '',
    image_url: '',
    hsn_code: '',
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
    period_calculation_type: 'previous_period',
    period_offset_value: 1,
    period_offset_unit: 'month',
    due_day_of_period: 'end',
    custom_due_offset: 10,
  });

  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [categories, setCategories] = useState<Array<{id: string, name: string, level: number, parent_id: string | null}>>([]);
  const [subcategories, setSubcategories] = useState<Array<{id: string, name: string}>>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => {
    loadCategories();
    if (!editingService) {
      generateAndSetServiceCode();
    }
  }, []);

  const generateAndSetServiceCode = async () => {
    const code = await generateServiceCode();
    setFormData(prev => ({ ...prev, service_code: code }));
  };

  useEffect(() => {
    if (editingService) {
      setImagePreview(editingService.image_url || '');
      if (editingService.category_id) {
        loadSubcategories(editingService.category_id);
      }

      const internalFields = ['period_calculation_type', 'period_offset_value', 'period_offset_unit', 'due_day_of_period', 'custom_due_offset', 'quarterly_day', 'quarterly_month', 'half_yearly_day', 'half_yearly_month', 'yearly_day', 'yearly_month'];
      const userCustomFields = { ...editingService.custom_fields };
      internalFields.forEach(field => delete userCustomFields[field]);

      setFormData({
        name: editingService.name || '',
        service_code: editingService.service_code || '',
        category: editingService.category || '',
        category_id: editingService.category_id || '',
        subcategory_id: editingService.subcategory_id || '',
        description: editingService.description || '',
        image_url: editingService.image_url || '',
        hsn_code: editingService.hsn_code || '',
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
        custom_fields: userCustomFields,
        period_calculation_type: editingService.custom_fields?.period_calculation_type || 'previous_period',
        period_offset_value: editingService.custom_fields?.period_offset_value || 1,
        period_offset_unit: editingService.custom_fields?.period_offset_unit || 'month',
        due_day_of_period: editingService.custom_fields?.due_day_of_period || 'end',
        custom_due_offset: editingService.custom_fields?.custom_due_offset || 10,
      });
    }
  }, [editingService]);

  const loadCategories = async () => {
    try {
      const { data: categoryData, error } = await supabase
        .from('service_categories')
        .select('id, name, level, parent_id')
        .eq('level', 0)
        .order('name');

      if (error) {
        console.error('Error loading categories:', error);
        return;
      }

      if (categoryData) {
        setCategories(categoryData);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadSubcategories = async (categoryId: string) => {
    try {
      const { data: subcategoryData, error } = await supabase
        .from('service_categories')
        .select('id, name')
        .eq('parent_id', categoryId)
        .order('name');

      if (error) {
        console.error('Error loading subcategories:', error);
        return;
      }

      setSubcategories(subcategoryData || []);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    const selectedCategory = categories.find(c => c.id === categoryId);
    setFormData({
      ...formData,
      category_id: categoryId,
      category: selectedCategory?.name || '',
      subcategory_id: ''
    });
    if (categoryId) {
      loadSubcategories(categoryId);
    } else {
      setSubcategories([]);
    }
  };


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const generateServiceCode = async () => {
    try {
      const { data, error } = await supabase.rpc('generate_next_id', {
        p_user_id: user!.id,
        p_id_type: 'service_code'
      });

      if (!error && data) {
        return data;
      }

      const { data: existingServices } = await supabase
        .from('services')
        .select('service_code')
        .not('service_code', 'is', null)
        .order('created_at', { ascending: false})
        .limit(1);

      let nextNumber = 1;
      if (existingServices && existingServices.length > 0) {
        const lastCode = existingServices[0].service_code;
        const match = lastCode?.match(/SRV-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      return `SRV-${nextNumber.toString().padStart(3, '0')}`;
    } catch (error) {
      console.error('Error generating service code:', error);
      return `SRV-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let imageUrl = formData.image_url;

      if (imageFile) {
        try {
          const fileExt = imageFile.name.split('.').pop();
          const fileName = `${user!.id}/${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('service-images')
            .upload(fileName, imageFile);

          if (uploadError) {
            console.error('Upload error:', uploadError);
            alert('Image upload failed. Please contact admin to set up storage bucket. Service will be created without image.');
          } else {
            const { data } = supabase.storage
              .from('service-images')
              .getPublicUrl(fileName);
            imageUrl = data.publicUrl;
          }
        } catch (error) {
          console.error('Storage error:', error);
          alert('Image upload is not configured. Service will be created without image.');
        }
      }

      const generatedCode = formData.service_code || await generateServiceCode();

      const customFields: any = { ...formData.custom_fields };

      if (formData.is_recurring) {
        customFields.period_calculation_type = formData.period_calculation_type;
        customFields.period_offset_value = formData.period_offset_value;
        customFields.period_offset_unit = formData.period_offset_unit;
        customFields.due_day_of_period = formData.due_day_of_period;
        customFields.custom_due_offset = formData.custom_due_offset;
      }

      const serviceData: any = {
        user_id: user!.id,
        name: formData.name,
        service_code: generatedCode,
        category: formData.category || null,
        category_id: formData.category_id || null,
        subcategory_id: formData.subcategory_id || null,
        description: formData.description || null,
        image_url: imageUrl || null,
        hsn_code: formData.hsn_code || null,
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
        custom_fields: customFields,
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
                  Service Code *
                </label>
                <input
                  type="text"
                  required
                  value={formData.service_code}
                  onChange={(e) => setFormData({ ...formData, service_code: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="Auto-generated"
                  readOnly={!editingService}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {editingService ? 'Service identifier' : 'Auto-generated based on settings'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Category
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select category</option>
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
                  value={formData.subcategory_id}
                  onChange={(e) => setFormData({ ...formData, subcategory_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!formData.category_id || subcategories.length === 0}
                >
                  <option value="">Select subcategory</option>
                  {subcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
                {formData.category_id && subcategories.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    No subcategories available for this category
                  </p>
                )}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  HSN/SAC Code
                </label>
                <input
                  type="text"
                  value={formData.hsn_code}
                  onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="e.g., 998314"
                />
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
                Service Image
              </label>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Upload an image (max 5MB, jpg/png/gif)
                  </p>
                </div>
                {imagePreview && (
                  <div className="relative w-20 h-20 border-2 border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-slate-700">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview('');
                        setFormData({ ...formData, image_url: '' });
                      }}
                      className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
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
              Enable automatic work generation for services that repeat on a schedule. Task templates with individual due dates can be defined in the Service Details page after creation.
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
                    <div className="md:col-span-2 space-y-4">
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600 space-y-4">
                        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Period Configuration</h5>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Period Type
                          </label>
                          <select
                            value={formData.period_calculation_type}
                            onChange={(e) => setFormData({ ...formData, period_calculation_type: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          >
                            <option value="previous_period">Previous Period (e.g., previous month)</option>
                            <option value="current_period">Current Period (e.g., current month)</option>
                            <option value="custom_range">Custom Date Range</option>
                          </select>
                        </div>

                        {formData.period_calculation_type === 'custom_range' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Days Before Due Date
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={formData.period_offset_value}
                                onChange={(e) => setFormData({ ...formData, period_offset_value: parseInt(e.target.value) || 1 })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Period Unit
                              </label>
                              <select
                                value={formData.period_offset_unit}
                                onChange={(e) => setFormData({ ...formData, period_offset_unit: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              >
                                <option value="day">Days</option>
                                <option value="week">Weeks</option>
                                <option value="month">Months</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="bg-blue-50 dark:bg-slate-700/50 p-3 rounded-lg border border-blue-200 dark:border-slate-600">
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">Summary:</p>
                          <p className="text-xs text-blue-800 dark:text-blue-400">
                            Recurs monthly
                          </p>
                          <p className="text-xs text-blue-800 dark:text-blue-400 mt-1">
                            Period: {formData.period_calculation_type === 'previous_period' ? 'Previous month (1st to last day)' :
                                     formData.period_calculation_type === 'current_period' ? 'Current month (1st to last day)' :
                                     `${formData.period_offset_value} ${formData.period_offset_unit}(s) before due date`}
                          </p>
                        </div>
                      </div>
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
                    <div className="md:col-span-2 space-y-4">
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600 space-y-4">
                        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Period Configuration</h5>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Period Type
                          </label>
                          <select
                            value={formData.period_calculation_type}
                            onChange={(e) => setFormData({ ...formData, period_calculation_type: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          >
                            <option value="previous_period">Previous Quarter (3 months)</option>
                            <option value="current_period">Current Quarter (3 months)</option>
                            <option value="custom_range">Custom Date Range</option>
                          </select>
                        </div>

                        {formData.period_calculation_type === 'custom_range' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Days/Months Before Due
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={formData.period_offset_value}
                                onChange={(e) => setFormData({ ...formData, period_offset_value: parseInt(e.target.value) || 1 })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Period Unit
                              </label>
                              <select
                                value={formData.period_offset_unit}
                                onChange={(e) => setFormData({ ...formData, period_offset_unit: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              >
                                <option value="day">Days</option>
                                <option value="month">Months</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="bg-blue-50 dark:bg-slate-700/50 p-3 rounded-lg border border-blue-200 dark:border-slate-600">
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">Summary:</p>
                          <p className="text-xs text-blue-800 dark:text-blue-400">
                            Recurs quarterly (Jan, Apr, Jul, Oct)
                          </p>
                          <p className="text-xs text-blue-800 dark:text-blue-400 mt-1">
                            Period: {formData.period_calculation_type === 'previous_period' ? 'Previous quarter (3 months)' :
                                     formData.period_calculation_type === 'current_period' ? 'Current quarter (3 months)' :
                                     `${formData.period_offset_value} ${formData.period_offset_unit}(s) before due date`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.recurrence_type === 'half-yearly' && (
                    <div className="md:col-span-2 space-y-4">
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600 space-y-4">
                        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Period Configuration</h5>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Period Type
                          </label>
                          <select
                            value={formData.period_calculation_type}
                            onChange={(e) => setFormData({ ...formData, period_calculation_type: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          >
                            <option value="previous_period">Previous Half-Year (6 months)</option>
                            <option value="current_period">Current Half-Year (6 months)</option>
                            <option value="custom_range">Custom Date Range</option>
                          </select>
                        </div>

                        {formData.period_calculation_type === 'custom_range' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Days/Months Before Due
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={formData.period_offset_value}
                                onChange={(e) => setFormData({ ...formData, period_offset_value: parseInt(e.target.value) || 1 })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Period Unit
                              </label>
                              <select
                                value={formData.period_offset_unit}
                                onChange={(e) => setFormData({ ...formData, period_offset_unit: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              >
                                <option value="day">Days</option>
                                <option value="month">Months</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="bg-blue-50 dark:bg-slate-700/50 p-3 rounded-lg border border-blue-200 dark:border-slate-600">
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">Summary:</p>
                          <p className="text-xs text-blue-800 dark:text-blue-400">
                            Recurs twice yearly
                          </p>
                          <p className="text-xs text-blue-800 dark:text-blue-400 mt-1">
                            Period: {formData.period_calculation_type === 'previous_period' ? 'Previous half-year (6 months)' :
                                     formData.period_calculation_type === 'current_period' ? 'Current half-year (6 months)' :
                                     `${formData.period_offset_value} ${formData.period_offset_unit}(s) before due date`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.recurrence_type === 'yearly' && (
                    <div className="md:col-span-2 space-y-4">
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600 space-y-4">
                        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Period Configuration</h5>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Period Type
                          </label>
                          <select
                            value={formData.period_calculation_type}
                            onChange={(e) => setFormData({ ...formData, period_calculation_type: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          >
                            <option value="previous_period">Previous Financial Year (Apr-Mar)</option>
                            <option value="current_period">Current Financial Year (Apr-Mar)</option>
                            <option value="custom_range">Custom Date Range</option>
                          </select>
                        </div>

                        {formData.period_calculation_type === 'custom_range' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Days/Months Before Due
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={formData.period_offset_value}
                                onChange={(e) => setFormData({ ...formData, period_offset_value: parseInt(e.target.value) || 1 })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                Period Unit
                              </label>
                              <select
                                value={formData.period_offset_unit}
                                onChange={(e) => setFormData({ ...formData, period_offset_unit: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              >
                                <option value="day">Days</option>
                                <option value="month">Months</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="bg-blue-50 dark:bg-slate-700/50 p-3 rounded-lg border border-blue-200 dark:border-slate-600">
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">Summary:</p>
                          <p className="text-xs text-blue-800 dark:text-blue-400">
                            Recurs annually
                          </p>
                          <p className="text-xs text-blue-800 dark:text-blue-400 mt-1">
                            Period: {formData.period_calculation_type === 'previous_period' ? 'Previous financial year (Apr-Mar)' :
                                     formData.period_calculation_type === 'current_period' ? 'Current financial year (Apr-Mar)' :
                                     `${formData.period_offset_value} ${formData.period_offset_unit}(s) before due date`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
