import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    DollarSign, CheckCircle, ArrowLeft, ClipboardList, Repeat
} from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';

interface CreateWorkProps {
    onNavigate: (page: string, params?: any) => void;
    initialCustomerId?: string;
    initialServiceId?: string;
    editWorkId?: string; // Added for edit mode
}

interface WorkTaskConfig {
    service_task_id: string;
    task_title: string;
    recurrence_type: string;
    recurrence_start_day: string;
    recurrence_start_month: string;
    due_offset_type: string;
    due_offset_value: number;
    exact_due_date: string;
    start_date: string;
    assigned_to?: string;
}

export default function CreateWork({ onNavigate, initialCustomerId, initialServiceId, editWorkId }: CreateWorkProps) {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [customers, setCustomers] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [staffMembers, setStaffMembers] = useState<any[]>([]);

    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const [formData, setFormData] = useState({
        work_number: '',
        customer_id: initialCustomerId || '',
        service_id: initialServiceId || '',
        assigned_to: '',
        title: '',
        description: '',
        status: 'pending',
        priority: 'medium',
        due_date: '',
        billing_status: 'not_billed',
        billing_amount: '',
        estimated_hours: '',
        estimated_duration_value: 0,
        estimated_duration_unit: 'days',
        is_recurring: false,
        recurrence_pattern: '',
        recurrence_day: '',
        auto_bill: true,
        start_date: new Date().toISOString().split('T')[0], // Default to today
        completion_deadline: '',
        department: '',
        work_location: '',
        requirements: '',
        deliverables: '',
        period_type: 'previous_period',
        financial_year_start_month: 4,
        weekly_start_day: 'monday',
        monthly_start_day: '1',
        quarterly_start_day: '1',
        half_yearly_start_day: '4',
        yearly_start_day: '4',
        period_calculation_type: 'previous_period',
        period_offset_value: 0,
        period_offset_unit: 'month',
        due_day_of_period: '',
        custom_due_offset: 0,
    });

    const [workTaskConfigs, setWorkTaskConfigs] = useState<WorkTaskConfig[]>([]);

    useEffect(() => {
        if (user) {
            fetchDependencies();
        }
    }, [user]);

    // Auto-fill task assignees when Manager changes
    useEffect(() => {
        if (formData.assigned_to && workTaskConfigs.length > 0) {
            setWorkTaskConfigs(prev => prev.map(config => {
                // Only update if currently unassigned
                if (!config.assigned_to) {
                    return { ...config, assigned_to: formData.assigned_to };
                }
                return config;
            }));
        }
    }, [formData.assigned_to]);

    // Fetch dependencies and then handle edit/initialization
    const fetchDependencies = async () => {
        try {
            const [customersResult, servicesResult, staffResult] = await Promise.all([
                supabase.from('customers').select('id, name').order('name'),
                supabase.from('services').select('*').order('name'),
                supabase.from('staff_members').select('id, name, role').eq('is_active', true).order('name'),
                supabase.from('service_categories').select('*').eq('level', 0).order('name'),
            ]);

            setCustomers(customersResult.data || []);
            setServices(servicesResult.data || []);
            setStaffMembers(staffResult.data || []);

            // Handle Edit Mode
            if (editWorkId) {
                setIsEditing(true);
                await loadWorkForEdit(editWorkId, servicesResult.data || []);
            } else {
                // Handle Create Mode Initialization
                if (initialCustomerId) {
                    // We need to wait for customers/services to be set, but we can pass them directly here
                    handleCustomerOrServiceChange(initialCustomerId, formData.service_id, customersResult.data || [], servicesResult.data || []);
                }
                if (initialServiceId) {
                    handleServiceChange(initialServiceId, servicesResult.data || []);
                }

                // Generate Work Number for new work
                const num = await generateWorkNumber();
                if (num) setFormData(prev => ({ ...prev, work_number: num }));
            }

        } catch (error) {
            console.error('Error fetching dependencies:', error);
        }
    };

    const generateWorkNumber = async () => {
        try {
            const { data } = await supabase.rpc('generate_next_id', {
                p_user_id: user!.id,
                p_id_type: 'work_id'
            });
            return data || '';
        } catch (error) {
            console.error('Error in generateWorkNumber:', error);
            return '';
        }
    };

    const loadWorkForEdit = async (workId: string, _currentServices: any[]) => {
        setLoading(true);
        try {
            const { data: work, error } = await supabase
                .from('works')
                .select('*')
                .eq('id', workId)
                .single();

            if (error) throw error;
            if (work) {
                setFormData({
                    work_number: work.work_number || '',
                    customer_id: work.customer_id,
                    service_id: work.service_id,
                    assigned_to: work.assigned_to || '',
                    title: work.title,
                    description: work.description || '',
                    status: work.status,
                    priority: work.priority,
                    due_date: work.due_date || '',
                    billing_status: work.billing_status,
                    billing_amount: work.billing_amount?.toString() || '',
                    estimated_hours: work.estimated_hours?.toString() || '',
                    estimated_duration_value: work.estimated_duration_value || 0,
                    estimated_duration_unit: work.estimated_duration_unit || 'days',
                    is_recurring: work.is_recurring || false,
                    recurrence_pattern: work.recurrence_pattern || '',
                    recurrence_day: work.recurrence_day?.toString() || '',
                    auto_bill: work.auto_bill !== undefined ? work.auto_bill : true,
                    start_date: work.start_date || new Date().toISOString().split('T')[0],
                    completion_deadline: '',
                    department: work.department || '',
                    work_location: work.work_location || '',
                    requirements: work.requirements || '',
                    deliverables: work.deliverables || '',
                    period_type: work.period_type || 'previous_period',
                    period_calculation_type: work.period_calculation_type || 'previous_period',
                    financial_year_start_month: work.financial_year_start_month || 4,
                    weekly_start_day: work.weekly_start_day || 'monday',
                    monthly_start_day: work.monthly_start_day?.toString() || '1',
                    quarterly_start_day: work.quarterly_start_day?.toString() || '1',
                    half_yearly_start_day: work.half_yearly_start_day?.toString() || '4',
                    yearly_start_day: work.yearly_start_day?.toString() || '4',
                    period_offset_value: 0,
                    period_offset_unit: 'month',
                    due_day_of_period: '',
                    custom_due_offset: 0,
                });

                // Fetch existing task configurations
                const { data: tasks } = await supabase
                    .from('work_task_configs')
                    .select('*, service_tasks(title)')
                    .eq('work_id', work.id);

                if (tasks && tasks.length > 0) {
                    const configs = tasks.map((t: any) => ({
                        service_task_id: t.service_task_id,
                        task_title: t.service_tasks?.title || 'Untitled Task',
                        recurrence_type: t.task_recurrence_type || '',
                        recurrence_start_day: t.recurrence_start_day || 'monday',
                        recurrence_start_month: t.recurrence_start_month?.toString() || '1',
                        due_offset_type: t.due_offset_type || 'days',
                        due_offset_value: t.due_offset_value || 0,
                        exact_due_date: t.exact_due_date || '',
                        start_date: '',
                        assigned_to: t.assigned_to || ''
                    }));
                    setWorkTaskConfigs(configs);
                } else if (work.service_id) {
                    // Fallback: Fetch default service tasks if no configs exist
                    const { data: defaultTasks } = await supabase
                        .from('service_tasks')
                        .select('*')
                        .eq('service_id', work.service_id)
                        .eq('is_active', true)
                        .order('sort_order');

                    if (defaultTasks) {
                        const configs: WorkTaskConfig[] = defaultTasks.map(t => ({
                            service_task_id: t.id,
                            task_title: t.title,
                            recurrence_type: t.task_recurrence_type || '',
                            recurrence_start_day: t.task_recurrence_type === 'weekly' ? 'monday' : '1',
                            recurrence_start_month: ['quarterly', 'half_yearly', 'yearly'].includes(t.task_recurrence_type || work.recurrence_pattern || '') ? '4' : '',
                            due_offset_type: t.due_offset_type || 'days',
                            due_offset_value: t.due_offset_value || 10,
                            exact_due_date: t.exact_due_date || '',
                            start_date: t.start_date || '',
                            assigned_to: ''
                        }));
                        setWorkTaskConfigs(configs);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading work for edit:', error);
            showToast('error', 'Failed to load work details');
        } finally {
            setLoading(false);
        }
    };

    const handleServiceChange = async (serviceId: string, currentServices: any[] = services) => {
        const selectedService = currentServices.find(s => s.id === serviceId);

        if (selectedService) { // Only auto-fill if not editing
            const updates: any = {
                service_id: serviceId,
                is_recurring: selectedService.is_recurring || false,
            };

            if (selectedService.default_price && !formData.billing_amount) {
                updates.billing_amount = selectedService.default_price.toString();
            }

            if (selectedService.estimated_duration_value) {
                updates.estimated_duration_value = selectedService.estimated_duration_value;
            }
            if (selectedService.estimated_duration_unit) {
                updates.estimated_duration_unit = selectedService.estimated_duration_unit;
            }

            if (selectedService.recurrence_start_date) {
                updates.start_date = selectedService.recurrence_start_date;
            } else if (!formData.start_date) {
                updates.start_date = new Date().toISOString().split('T')[0];
            }

            if (selectedService.is_recurring) {
                updates.recurrence_pattern = selectedService.recurrence_type || 'monthly';
                updates.recurrence_day = selectedService.recurrence_day?.toString() || '10';
                updates.due_date = '';

                if (selectedService.custom_fields) {
                    updates.period_calculation_type = selectedService.custom_fields.period_calculation_type || 'previous_period';
                    updates.period_offset_value = selectedService.custom_fields.period_offset_value || 1;
                    updates.period_offset_unit = selectedService.custom_fields.period_offset_unit || 'month';
                    updates.due_day_of_period = selectedService.custom_fields.due_day_of_period || 'end';
                    updates.custom_due_offset = selectedService.custom_fields.custom_due_offset || 10;
                }

                // Fetch tasks
                const { data: tasks } = await supabase
                    .from('service_tasks')
                    .select('*')
                    .eq('service_id', serviceId)
                    .eq('is_active', true)
                    .order('sort_order');

                if (tasks) {
                    const configs: WorkTaskConfig[] = tasks.map(t => ({
                        service_task_id: t.id,
                        task_title: t.title,
                        recurrence_type: t.task_recurrence_type || '',
                        recurrence_start_day: t.task_recurrence_type === 'weekly' ? 'monday' : '1',
                        recurrence_start_month: ['quarterly', 'half_yearly', 'yearly'].includes(t.task_recurrence_type || selectedService.recurrence_type || '') ? '4' : '',
                        due_offset_type: t.due_offset_type || 'days',
                        due_offset_value: t.due_offset_value || 10,
                        exact_due_date: t.exact_due_date || '',
                        start_date: t.start_date || '',
                        assigned_to: ''
                    }));
                    setWorkTaskConfigs(configs);
                }

            } else {
                updates.recurrence_pattern = '';
                updates.recurrence_day = '';
                // Don't reset start_date if it wasn't recurrence based but likely we want to keep it valid
                setWorkTaskConfigs([]);
            }

            setFormData(prev => ({ ...prev, ...updates }));
            handleCustomerOrServiceChange(formData.customer_id, serviceId, customers, currentServices);
        } else {
            // Just update ID if editing or no special logic needed
            setFormData(prev => ({ ...prev, service_id: serviceId }));
        }
    };

    const handleCustomerOrServiceChange = (customerId?: string, serviceId?: string, currentCustomers: any[] = customers, currentServices: any[] = services) => {
        const cId = customerId || formData.customer_id;
        const sId = serviceId || formData.service_id;

        if (cId && sId) {
            const customer = currentCustomers.find(c => c.id === cId);
            const service = currentServices.find(s => s.id === sId);

            if (customer && service && !isEditing) {
                setFormData(prev => ({
                    ...prev,
                    title: `${service.name} - ${customer.name}`,
                    customer_id: cId,
                    service_id: sId
                }));
            }
        }
    };

    const updateTaskConfig = (index: number, field: keyof WorkTaskConfig, value: any) => {
        const newConfigs = [...workTaskConfigs];
        newConfigs[index] = { ...newConfigs[index], [field]: value };
        setWorkTaskConfigs(newConfigs);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const workData: any = {
                work_number: formData.work_number, // Keep work number for updates too just in case
                customer_id: formData.customer_id,
                service_id: formData.service_id,
                assigned_to: formData.assigned_to || null,
                title: formData.title,
                description: formData.description || null,
                status: formData.status,
                priority: formData.priority,
                due_date: formData.is_recurring ? null : (formData.due_date || null),
                start_date: formData.start_date || null,
                billing_status: formData.billing_status,
                billing_amount: formData.billing_amount ? parseFloat(formData.billing_amount) : null,
                estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
                is_recurring: formData.is_recurring,
                recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null,
                recurrence_day: formData.is_recurring && formData.recurrence_day ? parseInt(formData.recurrence_day) : null,
                period_calculation_type: formData.is_recurring ? formData.period_type : null,
                work_location: formData.work_location || null,
                department: formData.department || null,
                requirements: formData.requirements || null,
                deliverables: formData.deliverables || null,
                auto_bill: formData.auto_bill,
                financial_year_start_month: formData.is_recurring ? parseInt(formData.financial_year_start_month.toString()) : null,
                weekly_start_day: formData.is_recurring && formData.recurrence_pattern === 'weekly' ? formData.weekly_start_day : null,
                monthly_start_day: formData.is_recurring && formData.recurrence_pattern === 'monthly' ? parseInt(formData.monthly_start_day) : null,
                quarterly_start_day: formData.is_recurring && formData.recurrence_pattern === 'quarterly' ? parseInt(formData.quarterly_start_day) : null,
                half_yearly_start_day: formData.is_recurring && formData.recurrence_pattern === 'half_yearly' ? parseInt(formData.half_yearly_start_day) : null,
                yearly_start_day: formData.is_recurring && formData.recurrence_pattern === 'yearly' ? parseInt(formData.yearly_start_day) : null,
                updated_at: new Date().toISOString(),
            };

            if (formData.assigned_to && (!isEditing)) {
                workData.assigned_date = new Date().toISOString();
            }

            if (formData.status === 'completed' && (!isEditing)) {
                workData.completion_date = new Date().toISOString();
            }

            let savedWorkId = editWorkId;

            if (isEditing && editWorkId) {
                // UPDATE
                const { error } = await supabase.from('works').update(workData).eq('id', editWorkId);
                if (error) throw error;
                showToast('success', 'Work updated successfully');
            } else {
                // CREATE
                workData.user_id = user!.id;
                const { data: newWork, error } = await supabase
                    .from('works')
                    .insert(workData)
                    .select()
                    .single();

                if (error) throw error;
                savedWorkId = newWork.id;
                showToast('success', 'Work created successfully');
            }

            // Handle Task Configs - for both Create and Edit (Update: Delete all and re-insert for edit)
            if (savedWorkId && formData.is_recurring) {
                if (isEditing) {
                    // Delete existing configs
                    await supabase.from('work_task_configs').delete().eq('work_id', savedWorkId);
                }

                if (workTaskConfigs.length > 0) {
                    const configInserts = workTaskConfigs.map(c => {
                        const effectiveRecurrence = c.recurrence_type || formData.recurrence_pattern || 'monthly';
                        let startDay = c.recurrence_start_day;

                        if (!startDay) {
                            if (effectiveRecurrence === 'weekly') startDay = 'monday';
                            else if (effectiveRecurrence !== 'daily') startDay = '1';
                        }

                        return {
                            work_id: savedWorkId,
                            service_task_id: c.service_task_id,
                            task_recurrence_type: c.recurrence_type || null,
                            recurrence_start_day: startDay,
                            recurrence_start_month: c.recurrence_start_month ? parseInt(c.recurrence_start_month.toString()) : null,
                            due_offset_type: c.due_offset_type || 'days',
                            due_offset_value: c.due_offset_value || 0,
                            exact_due_date: c.exact_due_date || null,
                            assigned_to: c.assigned_to || null
                        };
                    });

                    const { error: configError } = await supabase.from('work_task_configs').insert(configInserts);
                    if (configError) {
                        console.error('Error saving task configs:', configError);
                        showToast('error', 'Work saved but task configurations update failed.');
                    }
                }

                // If Creating, trigger auto-generate. If Editing, user might expect regeneration?
                // Usually editing settings implies we should re-eval next tasks, but `auto_generate_periods_and_tasks` checks existence.
                // For now, trigger it only on Create to be safe, or explicit button.
                // The legacy logic only did it on create. 
                // Let's stick to Create for auto-gen for now to avoid unwanted side effects on existing tracked work.
                if (!isEditing) {
                    try {
                        await supabase.rpc('auto_generate_periods_and_tasks', { p_work_id: savedWorkId });
                    } catch (err) {
                        console.error('Auto-generate error', err);
                        showToast('error', 'Work created, but auto-generation encountered issues.');
                    }
                }
            }

            onNavigate('works');
        } catch (error) {
            console.error('Error saving work:', error);
            showToast('error', 'Failed to save work');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-gray-50/50 pb-24">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <button onClick={() => onNavigate('works')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <ClipboardList className="w-6 h-6 text-orange-600" />
                                {isEditing ? 'Edit Work' : 'Create New Work'}
                            </h1>
                            <p className="text-xs text-gray-500">{formData.work_number}</p>
                        </div>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Main Content (Left Column) */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Basic Info Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2 mb-2">
                                Basic Information
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700">Service</label>
                                    <SearchableSelect
                                        label=""
                                        options={services.map(service => ({
                                            ...service,
                                            name: `${service.name}${service.is_recurring ? ' (Recurring)' : ''}`
                                        }))}
                                        value={formData.service_id}
                                        onChange={(value) => handleServiceChange(value)}
                                        placeholder="Select Service"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700">Customer</label>
                                    <SearchableSelect
                                        label=""
                                        options={customers}
                                        value={formData.customer_id}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, customer_id: value }));
                                            handleCustomerOrServiceChange(value, formData.service_id);
                                        }}
                                        placeholder="Select Customer"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">Work Title *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    placeholder="e.g. GST Filing - Oct 2025"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    placeholder="Optional details..."
                                />
                            </div>
                        </div>

                        {/* Schedule Card (Recurring Only) */}
                        {formData.is_recurring && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                                    <Repeat className="w-4 h-4 text-orange-600" />
                                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Work Period Recurrence</h3>
                                </div>
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-700">Recurrence Frequency</label>
                                        <select
                                            required={formData.is_recurring}
                                            value={formData.recurrence_pattern}
                                            onChange={(e) => setFormData({ ...formData, recurrence_pattern: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                                        >
                                            <option value="">Select frequency</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                            <option value="quarterly">Quarterly</option>
                                            <option value="half_yearly">Half Yearly</option>
                                            <option value="yearly">Yearly</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-700">First Start Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.start_date}
                                            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                                        />
                                    </div>

                                    {/* Period Generation Logic */}
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-700">Period Gen. Logic</label>
                                        <select
                                            required
                                            value={formData.period_type}
                                            onChange={(e) => setFormData({ ...formData, period_type: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        >
                                            <option value="previous_period">Previous Period (Lagging)</option>
                                            <option value="current_period">Current Period</option>
                                            <option value="next_period">Next Period (Leading)</option>
                                        </select>
                                    </div>

                                    {/* Dynamic Start Settings - Spanning full width if needed, or taking slots */}
                                    {formData.recurrence_pattern !== 'daily' && formData.recurrence_pattern !== '' && (
                                        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-gray-100 pt-4">
                                            {/* Weekly */}
                                            {formData.recurrence_pattern === 'weekly' && (
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-700">Start Day</label>
                                                    <select
                                                        value={formData.weekly_start_day}
                                                        onChange={(e) => setFormData({ ...formData, weekly_start_day: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                    >
                                                        {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(d => (
                                                            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            {/* Financial Year & Start Day Settings for Non-Weekly Periodic Work */}
                                            {formData.recurrence_pattern !== 'weekly' && formData.recurrence_pattern !== 'daily' && formData.recurrence_pattern !== '' && (
                                                <>
                                                    <div className="md:col-span-3 border-t border-gray-100 pt-4 mt-2">
                                                        <h4 className="text-xs font-semibold text-gray-900 mb-3 uppercase tracking-wide">Recurrence Start Settings</h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                                            {/* Start Month Configuration (For Q/H/Y only) */}
                                                            {['quarterly', 'half-yearly', 'half_yearly', 'yearly'].includes(formData.recurrence_pattern) && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-medium text-gray-700">
                                                                        {formData.recurrence_pattern === 'quarterly' ? 'Start Month of First Quarter' :
                                                                            formData.recurrence_pattern.includes('half') ? 'Start Month of First Half' :
                                                                                'Start Month of Year'}
                                                                    </label>
                                                                    <select
                                                                        value={formData.financial_year_start_month}
                                                                        onChange={(e) => setFormData({ ...formData, financial_year_start_month: parseInt(e.target.value) })}
                                                                        className="w-full px-3 py-2 border border-blue-100 bg-blue-50/30 rounded-lg text-sm"
                                                                    >
                                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                            <option key={m} value={m}>
                                                                                {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    <p className="text-[10px] text-gray-500">
                                                                        {formData.recurrence_pattern === 'quarterly' ? 'Determines quarter cycle (e.g. Jan->Apr->Jul...)' :
                                                                            'Determines the cycle start month.'}
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {/* Monthly Start */}
                                                            {formData.recurrence_pattern === 'monthly' && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-medium text-gray-700">Start Day of Month</label>
                                                                    <select
                                                                        value={formData.monthly_start_day}
                                                                        onChange={(e) => setFormData({ ...formData, monthly_start_day: e.target.value })}
                                                                        className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm"
                                                                    >
                                                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                                            <option key={d} value={d}>Day {d}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {/* Quarterly Start */}
                                                            {formData.recurrence_pattern === 'quarterly' && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-medium text-gray-700">Start Day of Quarter</label>
                                                                    <select
                                                                        value={formData.quarterly_start_day}
                                                                        onChange={(e) => setFormData({ ...formData, quarterly_start_day: e.target.value })}
                                                                        className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm"
                                                                    >
                                                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                                            <option key={d} value={d}>Day {d}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {/* Half-Yearly Start */}
                                                            {(formData.recurrence_pattern === 'half_yearly' || formData.recurrence_pattern === 'half-yearly') && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-medium text-gray-700">Start Day of Half-Year</label>
                                                                    <select
                                                                        value={formData.half_yearly_start_day}
                                                                        onChange={(e) => setFormData({ ...formData, half_yearly_start_day: e.target.value })}
                                                                        className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm"
                                                                    >
                                                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                                            <option key={d} value={d}>Day {d}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {/* Yearly Start */}
                                                            {formData.recurrence_pattern === 'yearly' && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-medium text-gray-700">Start Day of Year</label>
                                                                    <select
                                                                        value={formData.yearly_start_day}
                                                                        onChange={(e) => setFormData({ ...formData, yearly_start_day: e.target.value })}
                                                                        className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm"
                                                                    >
                                                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                                            <option key={d} value={d}>Day {d}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Task Configuration Table */}
                        {formData.is_recurring && workTaskConfigs.length > 0 && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Task Configuration</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                                            <tr>
                                                <th className="px-4 py-3 w-[25%]">Task</th>
                                                <th className="px-4 py-3 w-[20%]">Recurrence</th>
                                                <th className="px-4 py-3 w-[30%]">Start Settings</th>
                                                <th className="px-4 py-3 w-[25%]">Assignee</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {workTaskConfigs.map((config, index) => {
                                                const taskRecurrence = config.recurrence_type || formData.recurrence_pattern || 'monthly';

                                                return (
                                                    <tr key={index} className="group hover:bg-gray-50/50">
                                                        <td className="px-4 py-3 align-top">
                                                            <div className="font-medium text-gray-900">{config.task_title}</div>
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <span className="text-xs text-gray-500">Due:</span>
                                                                <input
                                                                    type="number"
                                                                    value={config.due_offset_value || 0}
                                                                    onChange={(e) => updateTaskConfig(index, 'due_offset_value', parseInt(e.target.value))}
                                                                    className="w-12 p-1 border border-gray-300 rounded text-xs"
                                                                    min="0"
                                                                />
                                                                <select
                                                                    value={config.due_offset_type || 'days'}
                                                                    onChange={(e) => updateTaskConfig(index, 'due_offset_type', e.target.value)}
                                                                    className="p-1 border border-gray-300 rounded text-xs"
                                                                >
                                                                    <option value="days">Days</option>
                                                                    <option value="weeks">Weeks</option>
                                                                    <option value="months">Months</option>
                                                                </select>
                                                                <span className="text-xs text-gray-500">after</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            <select
                                                                value={config.recurrence_type}
                                                                onChange={(e) => updateTaskConfig(index, 'recurrence_type', e.target.value)}
                                                                className="w-full p-1.5 border border-gray-300 rounded text-xs"
                                                            >
                                                                <option value="">Default (Inherit)</option>
                                                                <option value="daily">Daily</option>
                                                                <option value="weekly">Weekly</option>
                                                                <option value="monthly">Monthly</option>
                                                                <option value="quarterly">Quarterly</option>
                                                                <option value="half_yearly">Half Yearly</option>
                                                                <option value="yearly">Yearly</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-3 align-top space-y-2">
                                                            {/* Dynamic Start Day/Month/WeekDay based on recurrence */}
                                                            {taskRecurrence === 'weekly' ? (
                                                                <select
                                                                    value={config.recurrence_start_day || 'monday'}
                                                                    onChange={(e) => updateTaskConfig(index, 'recurrence_start_day', e.target.value)}
                                                                    className="w-full p-1.5 border border-gray-300 rounded text-xs"
                                                                >
                                                                    {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(d => (
                                                                        <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                                                    ))}
                                                                </select>
                                                            ) : taskRecurrence === 'daily' ? (
                                                                <span className="text-xs text-gray-400 italic">Every day</span>
                                                            ) : (
                                                                <div className="flex gap-2">
                                                                    {['quarterly', 'half_yearly', 'yearly'].includes(taskRecurrence) && (
                                                                        <select
                                                                            value={config.recurrence_start_month || '1'}
                                                                            onChange={(e) => updateTaskConfig(index, 'recurrence_start_month', e.target.value)}
                                                                            className="w-1/2 p-1.5 border border-gray-300 rounded text-xs"
                                                                        >
                                                                            <option value="">Month</option>
                                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                                <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                    <input
                                                                        type="number"
                                                                        placeholder="Day"
                                                                        min="1" max="31"
                                                                        value={config.recurrence_start_day}
                                                                        onChange={(e) => updateTaskConfig(index, 'recurrence_start_day', e.target.value)}
                                                                        className={`${['quarterly', 'half_yearly', 'yearly'].includes(taskRecurrence) ? 'w-1/2' : 'w-full'} p-1.5 border border-gray-300 rounded text-xs`}
                                                                    />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-top">
                                                            <select
                                                                value={config.assigned_to || ''}
                                                                onChange={(e) => updateTaskConfig(index, 'assigned_to', e.target.value)}
                                                                className="w-full p-1.5 border border-gray-300 rounded text-xs"
                                                            >
                                                                <option value="">Unassigned</option>
                                                                {staffMembers.map(staff => (
                                                                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar (Right Column) */}
                    <div className="space-y-6">
                        {/* Settings Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">
                                Details & Settings
                            </h3>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">Priority</label>
                                <select
                                    value={formData.priority}
                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">Assigned Manager</label>
                                <select
                                    value={formData.assigned_to}
                                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                    <option value="">Unassigned</option>
                                    {staffMembers.map(staff => (
                                        <option key={staff.id} value={staff.id}>{staff.name} ({staff.role})</option>
                                    ))}
                                </select>
                            </div>

                            {!formData.is_recurring && (
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700">Due Date</label>
                                    <input
                                        type="date"
                                        value={formData.due_date}
                                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">Location</label>
                                <input
                                    type="text"
                                    value={formData.work_location}
                                    onChange={(e) => setFormData({ ...formData, work_location: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    placeholder="e.g. Remote"
                                />
                            </div>
                        </div>

                        {/* Billing Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">
                                Billing
                            </h3>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700">Amount</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.billing_amount}
                                        onChange={(e) => setFormData({ ...formData, billing_amount: e.target.value })}
                                        className="w-full pl-9 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    id="auto_bill"
                                    type="checkbox"
                                    checked={formData.auto_bill}
                                    onChange={(e) => setFormData({ ...formData, auto_bill: e.target.checked })}
                                    className="w-4 h-4 text-orange-600 rounded border-gray-300"
                                />
                                <label htmlFor="auto_bill" className="text-sm text-gray-700 select-none">Auto-generate invoice</label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Action Footer */}
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-30">
                    <div className="max-w-7xl mx-auto flex justify-between items-center">
                        <button
                            type="button"
                            onClick={() => onNavigate('works')}
                            className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={loading}
                            className="flex items-center gap-2 px-8 py-2.5 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-md"
                        >
                            <CheckCircle className="w-4 h-4" /> {loading ? 'Saving...' : (isEditing ? 'Update Work' : 'Create Work')}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
