import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Briefcase,
  Users,
  Clock,
  DollarSign,
  TrendingUp,
  Calendar,
  Edit2,
  User,
  CheckCircle,
  CheckSquare,
  Plus,
  Trash2,
} from 'lucide-react';

interface ServiceDetailsProps {
  serviceId: string;
  onClose: () => void;
  onEdit: () => void;
}

interface Service {
  id: string;
  name: string;
  description: string;
  is_recurring: boolean;
  recurrence_type: string;
  default_price: number;
  created_at: string;
}

interface CustomerService {
  id: string;
  customer_id: string;
  price: number;
  start_date: string;
  end_date: string;
  status: string;
  customers: { id: string; name: string; email: string };
}

interface Work {
  id: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string;
  customers: { name: string };
}

interface ServiceTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  estimated_hours: number | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
}

type TabType = 'overview' | 'customers' | 'works' | 'revenue' | 'history' | 'tasks';

export default function ServiceDetails({ serviceId, onClose, onEdit }: ServiceDetailsProps) {
  const { user } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [customerServices, setCustomerServices] = useState<CustomerService[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [serviceTasks, setServiceTasks] = useState<ServiceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<ServiceTask | null>(null);
  const [statistics, setStatistics] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    totalWorks: 0,
    completedWorks: 0,
    totalRevenue: 0,
    averagePrice: 0,
  });

  useEffect(() => {
    if (serviceId) {
      fetchServiceDetails();
    }
  }, [serviceId]);

  const fetchServiceDetails = async () => {
    try {
      const [serviceRes, customerServicesRes, worksRes, tasksRes] = await Promise.all([
        supabase
          .from('services')
          .select('*')
          .eq('id', serviceId)
          .single(),
        supabase
          .from('customer_services')
          .select('*, customers(id, name, email)')
          .eq('service_id', serviceId)
          .order('created_at', { ascending: false }),
        supabase
          .from('works')
          .select('*, customers(name)')
          .eq('service_id', serviceId)
          .order('created_at', { ascending: false }),
        supabase
          .from('service_tasks')
          .select('*')
          .eq('service_id', serviceId)
          .order('sort_order'),
      ]);

      if (serviceRes.error) throw serviceRes.error;
      if (customerServicesRes.error) throw customerServicesRes.error;
      if (worksRes.error) throw worksRes.error;
      if (tasksRes.error) throw tasksRes.error;

      setService(serviceRes.data);
      setCustomerServices(customerServicesRes.data || []);
      setWorks(worksRes.data || []);
      setServiceTasks(tasksRes.data || []);

      const allCustomerServices = customerServicesRes.data || [];
      const activeCS = allCustomerServices.filter((cs) => cs.status === 'active');
      const totalRevenue = allCustomerServices.reduce((sum, cs) => sum + (cs.price || 0), 0);
      const avgPrice = allCustomerServices.length > 0 ? totalRevenue / allCustomerServices.length : 0;

      const allWorks = worksRes.data || [];
      const completed = allWorks.filter((w) => w.status === 'completed');

      setStatistics({
        totalCustomers: allCustomerServices.length,
        activeCustomers: activeCS.length,
        totalWorks: allWorks.length,
        completedWorks: completed.length,
        totalRevenue,
        averagePrice: avgPrice,
      });
    } catch (error: any) {
      console.error('Error fetching service details:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !service) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  const tabs: Array<{ id: TabType; label: string; icon: any; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: Briefcase },
    { id: 'tasks', label: 'Task Templates', icon: CheckSquare, count: serviceTasks.length },
    { id: 'customers', label: 'Customers', icon: Users, count: statistics.totalCustomers },
    { id: 'works', label: 'Works', icon: Clock, count: statistics.totalWorks },
    { id: 'revenue', label: 'Revenue', icon: DollarSign },
    { id: 'history', label: 'History', icon: Calendar },
  ];

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    inactive: 'bg-gray-100 text-gray-700 border-gray-200',
    expired: 'bg-red-100 text-red-700 border-red-200',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Briefcase size={28} />
              Service Details
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              Created on {new Date(service.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
            >
              <Edit2 size={18} />
              Edit
            </button>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Service Info Badge */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            {service.is_recurring && (
              <span className="px-4 py-2 rounded-lg text-sm font-semibold border-2 bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-2">
                <Calendar size={16} />
                Recurring: {service.recurrence_type}
              </span>
            )}
            {service.default_price && (
              <span className="px-4 py-2 rounded-lg text-sm font-semibold border-2 bg-green-100 text-green-700 border-green-200 flex items-center gap-2">
                <DollarSign size={16} />
                Default Price: ₹{service.default_price.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200 flex-shrink-0">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-blue-600" />
              <p className="text-xs font-medium text-gray-600">Total Customers</p>
            </div>
            <p className="text-xl font-bold text-blue-600">{statistics.totalCustomers}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-xs font-medium text-gray-600">Active</p>
            </div>
            <p className="text-xl font-bold text-green-600">{statistics.activeCustomers}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-orange-600" />
              <p className="text-xs font-medium text-gray-600">Total Works</p>
            </div>
            <p className="text-xl font-bold text-orange-600">{statistics.totalWorks}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-emerald-600" />
              <p className="text-xs font-medium text-gray-600">Completed</p>
            </div>
            <p className="text-xl font-bold text-emerald-600">{statistics.completedWorks}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-teal-600" />
              <p className="text-xs font-medium text-gray-600">Total Revenue</p>
            </div>
            <p className="text-xl font-bold text-teal-600">
              ₹{statistics.totalRevenue.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-purple-600" />
              <p className="text-xs font-medium text-gray-600">Avg Price</p>
            </div>
            <p className="text-xl font-bold text-purple-600">
              ₹{statistics.averagePrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex-shrink-0 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 font-medium rounded-t-lg transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700 shadow-sm border-t-2 border-blue-600'
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <Icon size={18} className="text-blue-600" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Service Information */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase size={20} className="text-blue-600" />
                  Service Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Service Name</label>
                    <p className="text-gray-900 font-medium mt-1 text-lg">{service.name}</p>
                  </div>
                  {service.description && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Description</label>
                      <p className="text-gray-700 mt-1">{service.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Service Type</label>
                      <p className="text-gray-900 mt-1">
                        {service.is_recurring ? 'Recurring Service' : 'One-time Service'}
                      </p>
                    </div>
                    {service.is_recurring && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Recurrence</label>
                        <p className="text-gray-900 mt-1 capitalize">{service.recurrence_type}</p>
                      </div>
                    )}
                    {service.default_price && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Default Price</label>
                        <p className="text-gray-900 mt-1 font-semibold">
                          ₹{service.default_price.toLocaleString('en-IN')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Customers Using</p>
                    <p className="text-2xl font-bold text-blue-600">{statistics.totalCustomers}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Works Generated</p>
                    <p className="text-2xl font-bold text-orange-600">{statistics.totalWorks}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₹{statistics.totalRevenue.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'customers' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Customers Using This Service ({customerServices.length})
              </h3>
              {customerServices.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Users size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No customers using this service yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customerServices.map((cs) => (
                    <div
                      key={cs.id}
                      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                            {cs.customers?.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{cs.customers?.name}</h4>
                            {cs.customers?.email && (
                              <p className="text-sm text-gray-600">{cs.customers.email}</p>
                            )}
                          </div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${
                            statusColors[cs.status] || statusColors.inactive
                          }`}
                        >
                          {cs.status}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Price:</span>
                          <span className="font-semibold text-gray-900">
                            ₹{cs.price.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Start Date:</span>
                          <span className="font-medium text-gray-900">
                            {new Date(cs.start_date).toLocaleDateString()}
                          </span>
                        </div>
                        {cs.end_date && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">End Date:</span>
                            <span className="font-medium text-gray-900">
                              {new Date(cs.end_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'works' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Works for This Service ({works.length})
              </h3>
              {works.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Clock size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No works created for this service yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {works.map((work) => (
                    <div
                      key={work.id}
                      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">{work.title}</h4>
                          <p className="text-sm text-gray-600">{work.customers?.name}</p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            work.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : work.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {work.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar size={12} />
                        <span>Created: {new Date(work.created_at).toLocaleDateString()}</span>
                      </div>
                      {work.completed_at && (
                        <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                          <CheckCircle size={12} />
                          <span>Completed: {new Date(work.completed_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'revenue' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl border border-green-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp size={20} className="text-green-600" />
                  Revenue Analytics
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Revenue Generated</p>
                    <p className="text-3xl font-bold text-green-600">
                      ₹{statistics.totalRevenue.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Average Price per Customer</p>
                    <p className="text-3xl font-bold text-blue-600">
                      ₹{statistics.averagePrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Active Subscriptions</p>
                    <p className="text-3xl font-bold text-teal-600">{statistics.activeCustomers}</p>
                  </div>
                </div>
              </div>

              {/* Revenue by Customer */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Customer</h3>
                <div className="space-y-3">
                  {customerServices
                    .sort((a, b) => b.price - a.price)
                    .slice(0, 10)
                    .map((cs) => (
                      <div key={cs.id} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 flex-1 truncate">
                          {cs.customers?.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            cs.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {cs.status}
                        </span>
                        <span className="text-sm font-bold text-green-600 w-32 text-right">
                          ₹{cs.price.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Service Task Templates</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Define tasks that will be automatically added when creating work for this service
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingTask(null);
                    setShowTaskModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={18} />
                  Add Task
                </button>
              </div>

              {serviceTasks.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <CheckSquare size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No task templates defined yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Add tasks to create a standard workflow for this service
                  </p>
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setShowTaskModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={18} />
                    Add First Task
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {serviceTasks.map((task, index) => (
                    <div
                      key={task.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                              {index + 1}
                            </span>
                            <h4 className="font-medium text-gray-900">{task.title}</h4>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                task.priority === 'urgent'
                                  ? 'bg-red-100 text-red-700'
                                  : task.priority === 'high'
                                  ? 'bg-orange-100 text-orange-700'
                                  : task.priority === 'low'
                                  ? 'bg-gray-100 text-gray-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-sm text-gray-600 ml-11">{task.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 ml-11 text-sm text-gray-500">
                            {task.estimated_hours && (
                              <span className="flex items-center gap-1">
                                <Clock size={14} />
                                Est: {task.estimated_hours}h
                              </span>
                            )}
                            {!task.is_active && (
                              <span className="text-red-600 font-medium">Inactive</span>
                            )}
                          </div>
                          {task.notes && (
                            <p className="text-xs text-gray-500 mt-2 ml-11 italic">{task.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingTask(task);
                              setShowTaskModal(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit task"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              if (
                                !confirm('Are you sure you want to delete this task template?')
                              )
                                return;
                              try {
                                const { error } = await supabase
                                  .from('service_tasks')
                                  .delete()
                                  .eq('id', task.id);
                                if (error) throw error;
                                fetchServiceDetails();
                              } catch (error) {
                                console.error('Error deleting task:', error);
                              }
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete task"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Service History</h3>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Service Created</p>
                      <p className="text-xs text-gray-500">
                        {new Date(service.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {customerServices.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          First Customer Added
                        </p>
                        <p className="text-xs text-gray-500">
                          {customerServices[customerServices.length - 1]?.customers?.name}
                        </p>
                      </div>
                    </div>
                  )}
                  {statistics.totalCustomers > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-teal-600 rounded-full mt-2"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Total Customers Served
                        </p>
                        <p className="text-xs text-gray-500">{statistics.totalCustomers} customers</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h3 className="text-xl font-bold text-white">
                {editingTask ? 'Edit Task Template' : 'Add Task Template'}
              </h3>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const taskData = {
                  service_id: serviceId,
                  title: formData.get('title') as string,
                  description: (formData.get('description') as string) || null,
                  priority: formData.get('priority') as string,
                  estimated_hours: formData.get('estimated_hours')
                    ? parseFloat(formData.get('estimated_hours') as string)
                    : null,
                  notes: (formData.get('notes') as string) || null,
                  is_active: true,
                  sort_order: serviceTasks.length,
                };

                try {
                  if (editingTask) {
                    const { error } = await supabase
                      .from('service_tasks')
                      .update(taskData)
                      .eq('id', editingTask.id);
                    if (error) throw error;
                  } else {
                    const { error } = await supabase.from('service_tasks').insert(taskData);
                    if (error) throw error;
                  }
                  setShowTaskModal(false);
                  setEditingTask(null);
                  fetchServiceDetails();
                } catch (error) {
                  console.error('Error saving task:', error);
                  alert('Failed to save task template');
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  defaultValue={editingTask?.title || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Collect purchase & sales data"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  name="description"
                  defaultValue={editingTask?.description || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Detailed description of this task..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    name="priority"
                    defaultValue={editingTask?.priority || 'medium'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estimated Hours
                  </label>
                  <input
                    type="number"
                    name="estimated_hours"
                    step="0.5"
                    defaultValue={editingTask?.estimated_hours || ''}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  name="notes"
                  defaultValue={editingTask?.notes || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Any additional notes or instructions..."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTaskModal(false);
                    setEditingTask(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingTask ? 'Update Task' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
