import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Plus, Trash2, X, Edit2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface CreateServiceProps {
    onNavigate: (page: string, params?: any) => void;
    editServiceId?: string;
}

const RECURRENCE_TYPES = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half-yearly', label: 'Half-Yearly' },
    { value: 'yearly', label: 'Yearly' },
];

export default function CreateService({ onNavigate, editServiceId }: CreateServiceProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
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
        custom_fields: {} as any,
        period_calculation_type: 'previous_period',
        period_offset_value: 1,
        period_offset_unit: 'month',
        due_day_of_period: 'end',
        custom_due_offset: 10,
    });

    const [customFieldKey, setCustomFieldKey] = useState('');
    const [customFieldValue, setCustomFieldValue] = useState('');
    const [categories, setCategories] = useState<Array<{ id: string, name: string, level: number, parent_id: string | null }>>([]);
    const [subcategories, setSubcategories] = useState<Array<{ id: string, name: string }>>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (editServiceId) {
            loadServiceForEdit(editServiceId);
        } else {
            const generateAndSetServiceCode = async () => {
                if (user) {
                    try {
                        const { data, error } = await supabase.rpc('generate_next_id', {
                            p_user_id: user.id,
                            p_id_type: 'service_code'
                        });

                        if (data) {
                            setFormData(prev => ({ ...prev, service_code: data }));
                        } else {
                            const fallback = `SRV-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
                            setFormData(prev => ({ ...prev, service_code: fallback }));
                        }
                    } catch (error) {
                        console.error('Error in generateServiceCode:', error);
                    }
                }
            };
            generateAndSetServiceCode();
        }
    }, [user, editServiceId]);

    const loadServiceForEdit = async (id: string) => {
        setLoading(true);
        try {
            const { data: service, error } = await supabase
                .from('services')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            if (service) {
                if (service.category_id) {
                    await loadSubcategories(service.category_id);
                }

                setFormData({
                    name: service.name,
                    service_code: service.service_code,
                    category: service.category || '',
                    category_id: service.category_id || '',
                    subcategory_id: service.subcategory_id || '',
                    description: service.description || '',
                    image_url: service.image_url || '',
                    hsn_code: service.hsn_code || '',
                    estimated_duration_hours: service.estimated_duration_hours || 0,
                    estimated_duration_minutes: service.estimated_duration_minutes || 0,
                    estimated_duration_value: service.estimated_duration_value || 0,
                    estimated_duration_unit: service.estimated_duration_unit || 'days',
                    default_price: service.default_price?.toString() || '',
                    tax_rate: service.tax_rate?.toString() || '0',
                    is_recurring: service.is_recurring,
                    recurrence_type: service.recurrence_type || 'monthly',
                    recurrence_day: service.recurrence_day || 1,
                    recurrence_month: service.custom_fields?.yearly_month || service.custom_fields?.half_yearly_month || 1,
                    recurrence_days: service.recurrence_days || [],
                    recurrence_start_date: service.recurrence_start_date || '',
                    recurrence_end_date: service.recurrence_end_date || '',
                    advance_notice_days: service.advance_notice_days || 3,
                    auto_generate_work: service.auto_generate_work,
                    status: service.status,
                    custom_fields: service.custom_fields || {},
                    period_calculation_type: service.custom_fields?.period_calculation_type || 'previous_period',
                    period_offset_value: service.custom_fields?.period_offset_value || 1,
                    period_offset_unit: service.custom_fields?.period_offset_unit || 'month',
                    due_day_of_period: service.custom_fields?.due_day_of_period || 'end',
                    custom_due_offset: service.custom_fields?.custom_due_offset || 10,
                });

                if (service.image_url) {
                    setImagePreview(service.image_url);
                }
            }
        } catch (error: any) {
            console.error('Error loading service:', error);
            showToast('Failed to load service details', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const { data: categoryData, error } = await supabase
                .from('service_categories')
                .select('id, name, level, parent_id')
                .eq('level', 0)
                .order('name');

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

            return `SRV-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        } catch (error) {
            return `SRV-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let imageUrl = formData.image_url;

            if (imageFile) {
                try {
                    const fileExt = imageFile.name.split('.').pop();
                    const fileName = `${user!.id}/${Date.now()}.${fileExt}`;

                    const { error: uploadError } = await supabase.storage
                        .from('service-images')
                        .upload(fileName, imageFile);

                    if (!uploadError) {
                        const { data } = supabase.storage
                            .from('service-images')
                            .getPublicUrl(fileName);
                        imageUrl = data.publicUrl;
                    }
                } catch (error) {
                    console.error('Storage error:', error);
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

            if (editServiceId) {
                // Update
                const { error } = await supabase
                    .from('services')
                    .update(serviceData)
                    .eq('id', editServiceId);

                if (error) throw error;
                showToast('Service updated successfully', 'success');
            } else {
                // Insert
                const { error } = await supabase.from('services').insert(serviceData);
                if (error) throw error;
                showToast('Service created successfully', 'success');
            }

            onNavigate('services');
        } catch (error: any) {
            console.error('Error saving service:', error);
            showToast(error.message || 'Failed to save service', 'error');
        } finally {
            setLoading(false);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => onNavigate('services')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    {editServiceId ? <Edit2 className="w-8 h-8 text-blue-600" /> : <Plus className="w-8 h-8 text-blue-600" />}
                    {editServiceId ? 'Edit Service' : 'Add New Service'}
                </h1>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Basic Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Service Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., VAT Filing, Bookkeeping"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Service Code *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.service_code}
                                    onChange={(e) => setFormData({ ...formData, service_code: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                                    placeholder="Auto-generated"
                                    readOnly={!!editServiceId} // Ideally readonly for edit too, unless needed
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Service identifier
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Category
                                </label>
                                <select
                                    value={formData.category_id}
                                    onChange={(e) => handleCategoryChange(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Subcategory
                                </label>
                                <select
                                    value={formData.subcategory_id}
                                    onChange={(e) => setFormData({ ...formData, subcategory_id: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                                    disabled={!formData.category_id || subcategories.length === 0}
                                >
                                    <option value="">Select subcategory</option>
                                    {subcategories.map((sub) => (
                                        <option key={sub.id} value={sub.id}>
                                            {sub.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Status
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    HSN/SAC Code
                                </label>
                                <input
                                    type="text"
                                    value={formData.hsn_code}
                                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 998314"
                                />
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Description
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows={3}
                                placeholder="Brief description of the service"
                            />
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Service Image
                            </label>
                            <div className="flex items-start gap-4">
                                <div className="flex-1">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Upload an image (max 5MB, jpg/png/gif)
                                    </p>
                                </div>
                                {imagePreview && (
                                    <div className="relative w-20 h-20 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50">
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
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Duration & Pricing
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Duration"
                                    />
                                    <select
                                        value={formData.estimated_duration_unit}
                                        onChange={(e) =>
                                            setFormData({ ...formData, estimated_duration_unit: e.target.value })
                                        }
                                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                        <option value="weeks">Weeks</option>
                                        <option value="months">Months</option>
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    How long this service typically takes to complete
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Default Price
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.default_price}
                                    onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Tax Rate (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={formData.tax_rate}
                                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                        <div className="flex items-center space-x-3 mb-2">
                            <input
                                type="checkbox"
                                id="is_recurring"
                                checked={formData.is_recurring}
                                onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="is_recurring" className="text-lg font-semibold text-gray-900">
                                Recurring Service
                            </label>
                        </div>
                        <p className="text-sm text-gray-600 mb-4 ml-8">
                            Mark this service as recurring to enable automatic work generation. Detailed configuration will be managed in the Work creation page.
                        </p>

                        {formData.is_recurring && (
                            <div className="space-y-5 mt-6">
                                <div className="bg-white rounded-lg p-4 border border-gray-200">
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                                        Recurrence Settings
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                How Often? *
                                            </label>
                                            <select
                                                value={formData.recurrence_type}
                                                onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                {RECURRENCE_TYPES.map((type) => (
                                                    <option key={type.value} value={type.value}>
                                                        {type.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-gray-500 mt-2">
                                                Select how frequently this service recurs. Detailed options will be available when creating work.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Custom Fields
                        </h3>
                        <div className="space-y-3">
                            {Object.entries(formData.custom_fields).map(([key, value]) => (
                                <div key={key} className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                                    <div className="flex-1">
                                        <span className="text-sm font-medium text-gray-700">
                                            {key}:
                                        </span>{' '}
                                        <span className="text-sm text-gray-600">{value as string}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeCustomField(key)}
                                        className="p-1 text-red-600 hover:bg-red-50 rounded"
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
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Field name"
                                />
                                <input
                                    type="text"
                                    value={customFieldValue}
                                    onChange={(e) => setCustomFieldValue(e.target.value)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

                    <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
                        <button
                            type="button"
                            onClick={() => onNavigate('services')}
                            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            {editServiceId ? 'Update Service' : 'Create Service'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
