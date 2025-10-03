import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, 
  Edit2, 
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
  TrendingUp
} from 'lucide-react';
import WorkDetails from '../components/WorkDetails';

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
  pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { color: 'bg-blue-100 text-blue-700', icon: Clock },
  completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
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

export default function Works() {
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBillingStatus, setFilterBillingStatus] = useState('all');
  const [groupByService, setGroupByService] = useState(false);
  const [showRecurringOnly, setShowRecurringOnly] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: '',
    service_id: '',
    assigned_to: '',
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    due_date: '',
    estimated_hours: '',
    billing_amount: '',
    notes: '',
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
          .select('*, customers(name), services(name, is_recurring), staff_members(name)')
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('services').select('id, name, is_recurring, recurrence_type, recurrence_day, default_price').order('name'),
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

  const calculateDueDate = (serviceId: string): string => {
    const service = services.find(s => s.id === serviceId);
    if (!service || !service.is_recurring || !service.recurrence_day) {
      return '';
    }

    const today = new Date();
    let dueDate: Date;

    switch (service.recurrence_type) {
      case 'monthly':
        const currentMonth = new Date(today.getFullYear(), today.getMonth(), service.recurrence_day);
        dueDate = currentMonth >= today 
          ? currentMonth 
          : new Date(today.getFullYear(), today.getMonth() + 1, service.recurrence_day);
        break;
      case 'quarterly':
        const currentQuarter = new Date(today.getFullYear(), today.getMonth(), service.recurrence_day);
        dueDate = currentQuarter >= today 
          ? currentQuarter 
          : new Date(today.getFullYear(), today.getMonth() + 3, service.recurrence_day);
        break;
      case 'yearly':
        const currentYear = new Date(today.getFullYear(), 0, service.recurrence_day);
        dueDate = currentYear >= today 
          ? currentYear 
          : new Date(today.getFullYear() + 1, 0, service.recurrence_day);
        break;
      default:
        dueDate = today;
    }

    return dueDate.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const selectedService = services.find(s => s.id === formData.service_id);
      
      const workData = {
        user_id: user!.id,
        customer_id: formData.customer_id,
        service_id: formData.service_id,
        assigned_to: formData.assigned_to || null,
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date || null,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        billing_amount: formData.billing_amount ? parseFloat(formData.billing_amount) : (selectedService?.default_price || null),
        billing_status: 'not_billed',
        is_recurring_instance: selectedService?.is_recurring || false,
        parent_service_id: selectedService?.is_recurring ? formData.service_id : null,
        instance_date: selectedService?.is_recurring ? new Date().toISOString().split('T')[0] : null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (editingWork) {
        const { error } = await supabase.from('works').update(workData).eq('id', editingWork.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('works').insert(workData);
        if (error) throw error;
      }

      setShowModal(false);
      setEditingWork(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving work:', error);
      alert('Failed to save work');
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
      estimated_hours: work.estimated_hours?.toString() || '',
      billing_amount: work.billing_amount?.toString() || '',
      notes: '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this work?')) return;

    try {
      const { error } = await supabase.from('works').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting work:', error);
    }
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
      estimated_hours: '',
      billing_amount: '',
      notes: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWork(null);
    resetForm();
  };

  // Filter works
  let filteredWorks = works;
  
  if (filterStatus !== 'all') {
    filteredWorks = filteredWorks.filter(work => work.status === filterStatus);
  }
  
  if (filterBillingStatus !== 'all') {
    filteredWorks = filteredWorks.filter(work => work.billing_status === filterBillingStatus);
  }
  
  if (showRecurringOnly) {
    filteredWorks = filteredWorks.filter(work => work.is_recurring_instance);
  }

  // Group works by service
  const groupedWorks = groupByService
    ? filteredWorks.reduce((acc, work) => {
        const serviceName = work.services.name;
        if (!acc[serviceName]) {
          acc[serviceName] = [];
        }
        acc[serviceName].push(work);
        return acc;
      }, {} as Record<string, Work[]>)
    : { 'All Works': filteredWorks };

  // Calculate statistics
  const stats = {
    total: works.length,
    pending: works.filter(w => w.status === 'pending').length,
    inProgress: works.filter(w => w.status === 'in_progress').length,
    completed: works.filter(w => w.status === 'completed').length,
    overdue: works.filter(w => w.status === 'overdue').length,
    recurring: works.filter(w => w.is_recurring_instance).length,
    totalBilled: works.reduce((sum, w) => sum + (w.billing_status !== 'not_billed' ? (w.billing_amount || 0) : 0), 0),
    totalPending: works.reduce((sum, w) => sum + (w.billing_status === 'not_billed' ? (w.billing_amount || 0) : 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Works Management</h1>
          <p className="text-gray-600 mt-1">Track and manage all your work assignments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Work</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            <p className="text-xs font-medium text-gray-600">Total Works</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            <p className="text-xs font-medium text-gray-600">Pending</p>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <p className="text-xs font-medium text-gray-600">In Progress</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-xs font-medium text-gray-600">Completed</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-xs font-medium text-gray-600">Overdue</p>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Repeat className="w-5 h-5 text-purple-600" />
            <p className="text-xs font-medium text-gray-600">Recurring</p>
          </div>
          <p className="text-2xl font-bold text-purple-600">{stats.recurring}</p>
        </div>
      </div>

      {/* Billing Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Billed Amount</p>
              <p className="text-3xl font-bold text-green-600">₹{stats.totalBilled.toLocaleString('en-IN')}</p>
            </div>
            <DollarSign className="w-12 h-12 text-green-600 opacity-20" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Pending Billing</p>
              <p className="text-3xl font-bold text-orange-600">₹{stats.totalPending.toLocaleString('en-IN')}</p>
            </div>
            <AlertCircle className="w-12 h-12 text-orange-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filters & Views</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* Status Filters */}
          {['all', 'pending', 'in_progress', 'completed', 'overdue'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                filterStatus === status
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status === 'all' ? 'All Status' : status.replace('_', ' ').toUpperCase()}
            </button>
          ))}

          <div className="w-px h-8 bg-gray-300 mx-2"></div>

          {/* Billing Status Filters */}
          {['all', 'not_billed', 'billed', 'paid'].map((billing) => (
            <button
              key={billing}
              onClick={() => setFilterBillingStatus(billing)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                filterBillingStatus === billing
                  ? 'bg-green-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {billing === 'all' ? 'All Billing' : billing.replace('_', ' ').toUpperCase()}
            </button>
          ))}

          <div className="w-px h-8 bg-gray-300 mx-2"></div>

          {/* View Options */}
          <button
            onClick={() => setGroupByService(!groupByService)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
              groupByService
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {groupByService ? 'Ungroup' : 'Group by Service'}
          </button>

          <button
            onClick={() => setShowRecurringOnly(!showRecurringOnly)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              showRecurringOnly
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Repeat className="w-4 h-4" />
            {showRecurringOnly ? 'Show All' : 'Recurring Only'}
          </button>
        </div>
      </div>

      {/* Works Display */}
      <div className="space-y-8">
        {Object.entries(groupedWorks).map(([serviceName, serviceWorks]) => (
          <div key={serviceName} className="space-y-4">
            {groupByService && (
              <div className="flex items-center gap-3 pb-3 border-b-2 border-gray-200">
                <Briefcase className="w-6 h-6 text-orange-600" />
                <h3 className="text-xl font-bold text-gray-900">{serviceName}</h3>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                  {serviceWorks.length} {serviceWorks.length === 1 ? 'work' : 'works'}
                </span>
              </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {serviceWorks.map((work) => {
                const StatusIcon = statusConfig[work.status as keyof typeof statusConfig]?.icon || Clock;
                return (
                  <div
                    key={work.id}
                    className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.02] relative"
                  >
                    {/* Recurring Badge */}
                    {work.is_recurring_instance && (
                      <div className="absolute top-3 right-3">
                        <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                          <Repeat className="w-3 h-3 mr-1" />
                          Recurring
                        </span>
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 pr-2">
                        <h3 className="font-semibold text-gray-900 mb-2">{work.title}</h3>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span
                            className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                              statusConfig[work.status as keyof typeof statusConfig]?.color || 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {work.status.replace('_', ' ')}
                          </span>
                          <span
                            className={`inline-block px-2 py-1 text-xs rounded-full ${
                              priorityColors[work.priority as keyof typeof priorityColors] || 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {work.priority}
                          </span>
                          <span
                            className={`inline-block px-2 py-1 text-xs rounded-full ${
                              billingStatusColors[work.billing_status as keyof typeof billingStatusColors] || 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {work.billing_status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {work.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{work.description}</p>
                    )}

                    <div className="space-y-2 mb-4 text-sm">
                      <div className="flex items-center text-gray-700">
                        <span className="font-medium mr-2">Customer:</span>
                        <span className="truncate">{work.customers.name}</span>
                      </div>
                      {!groupByService && (
                        <div className="flex items-center text-gray-700">
                          <span className="font-medium mr-2">Service:</span>
                          <span className="truncate">{work.services.name}</span>
                        </div>
                      )}
                      {work.staff_members && (
                        <div className="flex items-center text-gray-700">
                          <span className="font-medium mr-2">Assigned:</span>
                          <span className="truncate">{work.staff_members.name}</span>
                        </div>
                      )}
                      {work.due_date && (
                        <div className="flex items-center text-gray-700">
                          <Calendar className="w-4 h-4 mr-2" />
                          <span>Due: {new Date(work.due_date).toLocaleDateString('en-IN')}</span>
                        </div>
                      )}
                      {work.billing_amount && (
                        <div className="flex items-center text-gray-700">
                          <DollarSign className="w-4 h-4 mr-2" />
                          <span className="font-semibold">₹{work.billing_amount.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {work.estimated_hours && (
                        <div className="flex items-center text-gray-600">
                          <Clock className="w-4 h-4 mr-2" />
                          <span>Est: {work.estimated_hours}h {work.actual_duration_hours ? `| Actual: ${work.actual_duration_hours}h` : ''}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex space-x-2 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => setSelectedWork(work.id)}
                        className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Details</span>
                      </button>
                      <button
                        onClick={() => handleEdit(work)}
                        className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(work.id)}
                        className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {serviceWorks.length === 0 && (
              <div className="col-span-full text-center py-12 bg-white rounded-xl border border-gray-200">
                <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No works found</h3>
                <p className="text-gray-600 mb-4">
                  {filterStatus === 'all' && filterBillingStatus === 'all' && !showRecurringOnly
                    ? 'Start by creating your first work assignment'
                    : 'No works match the selected filters'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add/Edit Work Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingWork ? 'Edit Work' : 'Add New Work'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service *</label>
                  <select
                    required
                    value={formData.service_id}
                    onChange={(e) => {
                      const serviceId = e.target.value;
                      const service = services.find(s => s.id === serviceId);
                      setFormData({ 
                        ...formData, 
                        service_id: serviceId,
                        due_date: service?.is_recurring ? calculateDueDate(serviceId) : formData.due_date,
                        billing_amount: service?.default_price?.toString() || formData.billing_amount
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} {service.is_recurring && '(Recurring)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign To
                  </label>
                  <select
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} - {staff.role}
                      </option>
                    ))}
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Hours</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Billing Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.billing_amount}
                    onChange={(e) => setFormData({ ...formData, billing_amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

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
                    <option value="overdue">Overdue</option>
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
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                  placeholder="Work description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={2}
                  placeholder="Additional notes"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  {editingWork ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedWork && (
        <WorkDetails
          workId={selectedWork}
          onClose={() => setSelectedWork(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}