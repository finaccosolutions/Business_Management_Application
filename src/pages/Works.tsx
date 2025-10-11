import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { copyServiceTasksToWork } from '../lib/serviceTaskUtils';
import {
  Plus,
  X,
  Trash2,
  ClipboardList,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Repeat,
  Briefcase,
  Filter,
  DollarSign,
  TrendingUp,
  Users,
} from 'lucide-react';
import WorkDetails from '../components/work/WorkDetails';

interface Work {
  id: string;
  customer_id: string;
  service_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  is_recurring_instance: boolean;
  parent_service_id: string | null;
  instance_date: string | null;
  billing_status: string;
  billing_amount: number | null;
  estimated_hours: number | null;
  actual_duration_hours: number | null;
  customers: { name: string };
  services: { name: string; is_recurring: boolean };
  staff_members: { name: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  is_recurring: boolean;
  recurrence_type: string | null;
  recurrence_day: number | null;
  default_price: number | null;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const statusConfig = {
  pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  in_progress: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
  completed: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  overdue: { color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
};

const priorityColors = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const billingStatusColors = {
  not_billed: 'bg-gray-100 text-gray-700',
  billed: 'bg-green-100 text-green-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

type ViewType = 'statistics' | 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';

export default function Works() {
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('all');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterBillingStatus, setFilterBillingStatus] = useState('');

  const [formData, setFormData] = useState({
    customer_id: '',
    service_id: '',
    assigned_to: '',
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    due_date: '',
    billing_status: 'not_billed',
    billing_amount: '',
    estimated_hours: '',
    is_recurring: false,
    recurrence_pattern: '',
    recurrence_day: '',
    auto_bill: true,
    is_active: true,
    work_type: 'regular',
    start_date: '',
    completion_deadline: '',
    department: '',
    work_location: '',
    requirements: '',
    deliverables: '',
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [worksResult, customersResult, servicesResult, staffResult] = await Promise.all([
        supabase
          .from('works')
          .select('*, customers(name), services!service_id(name, is_recurring), staff_members(name)')
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('services').select('*').order('name'),
        supabase.from('staff_members').select('id, name, role').eq('is_active', true).order('name'),
      ]);

      if (worksResult.error) throw worksResult.error;
      if (customersResult.error) throw customersResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (staffResult.error) throw staffResult.error;

      setWorks(worksResult.data || []);
      setCustomers(customersResult.data || []);
      setServices(servicesResult.data || []);
      setStaffMembers(staffResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (serviceId: string) => {
    setFormData({ ...formData, service_id: serviceId });

    const selectedService = services.find(s => s.id === serviceId);
    if (selectedService && !editingWork) {
      const updates: any = {
        service_id: serviceId,
      };

      if (selectedService.default_price && !formData.billing_amount) {
        updates.billing_amount = selectedService.default_price.toString();
      }

      if (selectedService.is_recurring) {
        updates.is_recurring = true;
        updates.recurrence_pattern = selectedService.recurrence_type || 'monthly';
        updates.recurrence_day = selectedService.recurrence_day?.toString() || '';
      }

      setFormData({ ...formData, ...updates });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const workData: any = {
        user_id: user!.id,
        customer_id: formData.customer_id,
        service_id: formData.service_id,
        assigned_to: formData.assigned_to || null,
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date || null,
        billing_status: formData.billing_status,
        billing_amount: formData.billing_amount ? parseFloat(formData.billing_amount) : null,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        is_recurring: formData.is_recurring,
        recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null,
        recurrence_day: formData.is_recurring && formData.recurrence_day ? parseInt(formData.recurrence_day) : null,
        auto_bill: formData.auto_bill,
        is_active: formData.is_active,
        work_type: formData.is_recurring ? 'recurring' : 'regular',
        updated_at: new Date().toISOString(),
      };

      if (formData.assigned_to && !editingWork) {
        workData.assigned_date = new Date().toISOString();
      }

      if (formData.status === 'completed' && !editingWork) {
        workData.completion_date = new Date().toISOString();
      }

      let workId: string | null = null;
      let shouldCreateInvoice = false;

      if (editingWork) {
        if (formData.status === 'completed' && editingWork.status !== 'completed') {
          workData.completion_date = new Date().toISOString();
          shouldCreateInvoice = true;
          workId = editingWork.id;
        }

        const { error } = await supabase.from('works').update(workData).eq('id', editingWork.id);
        if (error) throw error;
      } else {
        const { data: newWork, error } = await supabase
          .from('works')
          .insert(workData)
          .select()
          .single();
        if (error) throw error;

        if (newWork) {
          await copyServiceTasksToWork(formData.service_id, newWork.id);

          if (formData.status === 'completed') {
            shouldCreateInvoice = true;
            workId = newWork.id;
          }
        }
      }

      if (shouldCreateInvoice && workId) {
        await createInvoiceForWork(workId, formData.customer_id, formData.service_id);
      }

      setShowModal(false);
      setEditingWork(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving work:', error);
      alert('Failed to save work. Please try again.');
    }
  };

  const createInvoiceForWork = async (workId: string, customerId: string, serviceId: string) => {
    try {
      const { data: invoiceCount } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      const count = invoiceCount || 0;
      const invoiceNumber = `INV-${String(count + 1).padStart(4, '0')}`;

      const service = services.find(s => s.id === serviceId);
      const servicePrice = service?.default_price || 0;
      const taxRate = 18;
      const subtotal = servicePrice;
      const taxAmount = (subtotal * taxRate) / 100;
      const totalAmount = subtotal + taxAmount;

      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);

      const invoiceData = {
        user_id: user!.id,
        customer_id: customerId,
        work_id: workId,
        invoice_number: invoiceNumber,
        invoice_date: today.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'draft',
        notes: 'Auto-generated invoice for completed work',
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const invoiceItem = {
        invoice_id: invoice.id,
        description: service?.name || 'Service',
        quantity: 1,
        unit_price: servicePrice,
        amount: subtotal + taxAmount,
      };

      const { error: itemError } = await supabase
        .from('invoice_items')
        .insert(invoiceItem);

      if (itemError) throw itemError;

      console.log(`Invoice ${invoiceNumber} created successfully for work ${workId}`);
    } catch (error) {
      console.error('Error creating invoice:', error);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this work?')) return;

    try {
      const { error } = await supabase.from('works').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting work:', error);
    }
  };

  const handleEdit = (work: Work) => {
    setEditingWork(work);
    setFormData({
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
      is_recurring: false,
      recurrence_pattern: '',
      recurrence_day: '',
      auto_bill: true,
      is_active: true,
      work_type: 'regular',
      start_date: '',
      completion_deadline: '',
      department: '',
      work_location: '',
      requirements: '',
      deliverables: '',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      customer_id: '',
      service_id: '',
      assigned_to: '',
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      due_date: '',
      billing_status: 'not_billed',
      billing_amount: '',
      estimated_hours: '',
      is_recurring: false,
      recurrence_pattern: '',
      recurrence_day: '',
      auto_bill: true,
      is_active: true,
      work_type: 'regular',
      start_date: '',
      completion_deadline: '',
      department: '',
      work_location: '',
      requirements: '',
      deliverables: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWork(null);
    resetForm();
  };

  // Calculate statistics
  const stats = {
    total: works.length,
    pending: works.filter((w) => w.status === 'pending').length,
    inProgress: works.filter((w) => w.status === 'in_progress').length,
    completed: works.filter((w) => w.status === 'completed').length,
    overdue: works.filter((w) => {
      if (w.status === 'completed') return false;
      return w.due_date && new Date(w.due_date) < new Date();
    }).length,
    totalRevenue: works.reduce((sum, w) => sum + (w.billing_amount || 0), 0),
    notBilled: works.filter((w) => w.billing_status === 'not_billed').length,
  };

  // Filter works based on active view
const filteredWorks = works.filter((work) => {
  // Status filter
  if (activeView !== 'statistics' && activeView !== 'all') {
    if (activeView === 'overdue') {
      if (work.status === 'completed' || !work.due_date || new Date(work.due_date) >= new Date()) {
        return false;
      }
    } else if (work.status !== activeView) {
      return false;
    }
  }

  // Customer filter
  if (filterCustomer && work.customer_id !== filterCustomer) return false;

  // Service filter
  if (filterService && work.service_id !== filterService) return false;

  // Priority filter
  if (filterPriority && work.priority !== filterPriority) return false;

  // Billing status filter
  if (filterBillingStatus && work.billing_status !== filterBillingStatus) return false;

  return true;
});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Works</h1>
          <p className="text-gray-600 mt-1">Track and manage all work assignments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white px-6 py-3 rounded-lg hover:from-orange-600 hover:to-amber-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add New Work</span>
        </button>
      </div>

      {/* Tabs for Views */}
<div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setActiveView('statistics')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          activeView === 'statistics'
            ? 'bg-orange-50 text-orange-600 border-2 border-orange-200'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <TrendingUp size={18} />
        Statistics
      </button>
      <button
        onClick={() => setActiveView('all')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          activeView === 'all'
            ? 'bg-blue-50 text-blue-600 border-2 border-blue-200'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Briefcase size={18} />
        All ({stats.total})
      </button>
      <button
        onClick={() => setActiveView('pending')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          activeView === 'pending'
            ? 'bg-yellow-50 text-yellow-600 border-2 border-yellow-200'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Clock size={18} />
        Pending ({stats.pending})
      </button>
      <button
        onClick={() => setActiveView('in_progress')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          activeView === 'in_progress'
            ? 'bg-blue-50 text-blue-600 border-2 border-blue-200'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Clock size={18} />
        In Progress ({stats.inProgress})
      </button>
      <button
        onClick={() => setActiveView('completed')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          activeView === 'completed'
            ? 'bg-green-50 text-green-600 border-2 border-green-200'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <CheckCircle size={18} />
        Completed ({stats.completed})
      </button>
      <button
        onClick={() => setActiveView('overdue')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          activeView === 'overdue'
            ? 'bg-red-50 text-red-600 border-2 border-red-200'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <AlertCircle size={18} />
        Overdue ({stats.overdue})
      </button>
    </div>
    
    {/* Additional Filters */}
    <div className="flex flex-wrap gap-3 items-center">
      <select
        value={filterCustomer}
        onChange={(e) => setFilterCustomer(e.target.value)}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
      >
        <option value="">All Customers</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>

      <select
        value={filterService}
        onChange={(e) => setFilterService(e.target.value)}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
      >
        <option value="">All Services</option>
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </select>

      <select
        value={filterPriority}
        onChange={(e) => setFilterPriority(e.target.value)}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
      >
        <option value="">All Priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <select
        value={filterBillingStatus}
        onChange={(e) => setFilterBillingStatus(e.target.value)}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
      >
        <option value="">All Billing Status</option>
        <option value="not_billed">Not Billed</option>
        <option value="billed">Billed</option>
        <option value="paid">Paid</option>
      </select>

      {(filterCustomer || filterService || filterPriority || filterBillingStatus) && (
        <button
          onClick={() => {
            setFilterCustomer('');
            setFilterService('');
            setFilterPriority('');
            setFilterBillingStatus('');
          }}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  </div>
</div>

      {/* Statistics View */}
      {activeView === 'statistics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total Works</p>
            </div>
            <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
            </div>
            <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
            </div>
            <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Overdue</p>
            </div>
            <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-teal-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-teal-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
            </div>
            <p className="text-3xl font-bold text-teal-600">
              ₹{stats.totalRevenue.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Not Billed</p>
            </div>
            <p className="text-3xl font-bold text-orange-600">{stats.notBilled}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-cyan-50 rounded-lg">
                <Clock className="w-5 h-5 text-cyan-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
            </div>
            <p className="text-3xl font-bold text-cyan-600">{stats.inProgress}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Repeat className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Recurring</p>
            </div>
            <p className="text-3xl font-bold text-emerald-600">
              {works.filter((w) => w.is_recurring_instance).length}
            </p>
          </div>
        </div>
      )}

      {/* Works Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredWorks.map((work) => {
          const StatusIcon = statusConfig[work.status as keyof typeof statusConfig]?.icon || Clock;
          const isOverdue =
            work.status !== 'completed' && work.due_date && new Date(work.due_date) < new Date();

          return (
            <div
              key={work.id}
              onClick={() => setSelectedWork(work.id)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all cursor-pointer flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-lg mb-1">{work.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users size={14} />
                    <span>{work.customers.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <Briefcase size={14} />
                    <span>{work.services.name}</span>
                  </div>
                </div>
                {work.is_recurring_instance && (
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Repeat className="w-4 h-4 text-emerald-600" />
                  </div>
                )}
              </div>

              {/* Description */}
              {work.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{work.description}</p>
              )}

              {/* Status & Priority Badges */}
              <div className="flex flex-wrap gap-2 mb-4 flex-grow">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${
                    isOverdue
                      ? statusConfig.overdue.color
                      : statusConfig[work.status as keyof typeof statusConfig]?.color ||
                        'bg-gray-100 text-gray-700'
                  }`}
                >
                  <StatusIcon size={12} />
                  {isOverdue ? 'Overdue' : work.status.replace('_', ' ')}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    priorityColors[work.priority as keyof typeof priorityColors] || priorityColors.medium
                  }`}
                >
                  {work.priority}
                </span>
                {work.billing_status && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      billingStatusColors[work.billing_status as keyof typeof billingStatusColors]
                    }`}
                  >
                    {work.billing_status.replace('_', ' ')}
                  </span>
                )}
              </div>

              {/* Footer Info */}
              <div className="space-y-2 text-sm text-gray-600">
                {work.due_date && (
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    <span>Due: {new Date(work.due_date).toLocaleDateString()}</span>
                  </div>
                )}
                {work.billing_amount && (
                  <div className="flex items-center gap-2 text-teal-600 font-semibold">
                    <DollarSign size={14} />
                    <span>₹{work.billing_amount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {work.staff_members && (
                  <div className="flex items-center gap-2">
                    <Users size={14} />
                    <span>{work.staff_members.name}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-gray-100 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWork(work.id);
                  }}
                  className="flex-1 px-4 py-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors font-medium"
                >
                  View Details
                </button>
                <button
                  onClick={(e) => handleDelete(work.id, e)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}

        {filteredWorks.length === 0 && (
          <div className="col-span-full text-center py-12">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No works found</h3>
            <p className="text-gray-600 mb-4">
              {activeView === 'all' ? 'Get started by adding your first work' : 'No works match this filter'}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Work Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header with Gradient */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <ClipboardList size={28} />
                {editingWork ? 'Edit Work' : 'Add New Work'}
              </h2>
              <button
                onClick={closeModal}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer *
                  </label>
                  <select
                    required
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Select Customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service *
                  </label>
                  <select
                    required
                    value={formData.service_id}
                    onChange={(e) => handleServiceChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Select Service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                        {service.is_recurring && ' (Recurring)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Work title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Work description"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign to Staff
                  </label>
                  <select
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} ({staff.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Status
                  </label>
                  <select
                    value={formData.billing_status}
                    onChange={(e) => setFormData({ ...formData, billing_status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="not_billed">Not Billed</option>
                    <option value="billed">Billed</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.billing_amount}
                    onChange={(e) => setFormData({ ...formData, billing_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estimated Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.estimated_hours}
                    onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Work Location
                  </label>
                  <input
                    type="text"
                    value={formData.work_location}
                    onChange={(e) => setFormData({ ...formData, work_location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Office, Remote, Client site, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Accounts, Tax, Legal, etc."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requirements & Instructions
                </label>
                <textarea
                  value={formData.requirements}
                  onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Specific requirements, documents needed, steps to follow..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected Deliverables
                </label>
                <textarea
                  value={formData.deliverables}
                  onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="What should be delivered upon completion..."
                />
              </div>

              {/* Auto-billing Settings */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <DollarSign className="w-4 h-4 text-teal-600" />
                    Automatic Billing
                  </label>
                  <input
                    type="checkbox"
                    checked={formData.auto_bill}
                    onChange={(e) => setFormData({ ...formData, auto_bill: e.target.checked })}
                    className="w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                </div>
                <p className="text-xs text-gray-600">
                  When enabled, an invoice will be automatically generated when work is marked as completed.
                </p>
              </div>

              {/* Recurring Work Section */}
              {formData.is_recurring && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Repeat className="w-5 h-5 text-orange-600" />
                    <h3 className="font-semibold text-orange-900">Recurring Work Settings</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Recurrence Pattern
                      </label>
                      <select
                        value={formData.recurrence_pattern}
                        onChange={(e) => setFormData({ ...formData, recurrence_pattern: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="half_yearly">Half Yearly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Due Day (Day of Month)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.recurrence_day}
                        onChange={(e) => setFormData({ ...formData, recurrence_day: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="e.g., 10 for 10th of each month"
                      />
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">
                    <p className="font-medium mb-1">Note:</p>
                    <p>This creates ONE work that manages all recurring periods. You can track each period's completion inside the work details.</p>
                  </div>
                </div>
              )}

              {/* Manual Recurring Toggle */}
              {!editingWork && (
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <label htmlFor="is_recurring" className="text-sm font-medium text-gray-700">
                    This is a recurring work (e.g., monthly GST filing, quarterly returns)
                  </label>
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all font-medium shadow-lg"
              >
                {editingWork ? 'Update Work' : 'Create Work'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Work Details Modal */}
      {selectedWork && (
        <WorkDetails
          workId={selectedWork}
          onClose={() => setSelectedWork(null)}
          onUpdate={fetchData}
          onEdit={() => {
            const work = works.find(w => w.id === selectedWork);
            if (work) {
              setSelectedWork(null);
              handleEdit(work);
            }
          }}
        />
      )}

    </div>
  );
}
