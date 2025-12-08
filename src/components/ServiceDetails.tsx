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
  FileText,
  History,
  Upload,
  Repeat,
  Landmark,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface ServiceDetailsProps {
  serviceId: string;
  onClose: () => void;
  onEdit: () => void;
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToWork?: (workId: string) => void;
}

interface Service {
  id: string;
  name: string;
  description: string;
  is_recurring: boolean;
  recurrence_type: string;
  default_price: number;
  created_at: string;
  income_account_id: string | null;
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
  default_assigned_to: string | null;
  task_recurrence_type: string | null;
  due_offset_type: string | null;
  due_offset_value: number | null;
  exact_due_date: string | null;
  specific_period_dates: Record<string, string> | null;
  staff?: { name: string } | null;
}

interface ServiceDocument {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

type TabType = 'overview' | 'customers' | 'works' | 'revenue' | 'activity' | 'tasks' | 'documents';

export default function ServiceDetails({ serviceId, onClose, onEdit, onNavigateToCustomer, onNavigateToWork }: ServiceDetailsProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [service, setService] = useState<Service | null>(null);
  const [customerServices, setCustomerServices] = useState<CustomerService[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [serviceTasks, setServiceTasks] = useState<ServiceTask[]>([]);
  const [serviceDocuments, setServiceDocuments] = useState<ServiceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [editingTask, setEditingTask] = useState<ServiceTask | null>(null);
  const [editingDocument, setEditingDocument] = useState<ServiceDocument | null>(null);
  const [ledgers, setLedgers] = useState<Array<{id: string; account_code: string; account_name: string;}>>([]);
  const [staffList, setStaffList] = useState<Array<{id: string; name: string}>>([]);
  const [savingLedgerMap, setSavingLedgerMap] = useState(false);
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
      fetchLedgers();
      fetchStaff();
    }
  }, [serviceId]);

  const fetchLedgers = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_groups(account_type)')
        .eq('is_active', true)
        .order('account_name');

      if (error) throw error;
      setLedgers(data || []);
    } catch (error: any) {
      console.error('Error fetching ledgers:', error);
    }
  };

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setStaffList(data || []);
    } catch (error: any) {
      console.error('Error fetching staff:', error);
    }
  };

  const handleUpdateIncomeLedger = async (ledgerId: string | null) => {
    setSavingLedgerMap(true);
    try {
      const { error } = await supabase
        .from('services')
        .update({ income_account_id: ledgerId })
        .eq('id', serviceId);

      if (error) throw error;

      setService(service ? { ...service, income_account_id: ledgerId } : null);
      toast.success('Income ledger mapping updated successfully');
    } catch (error: any) {
      console.error('Error updating income ledger:', error);
      toast.error('Failed to update income ledger mapping');
    } finally {
      setSavingLedgerMap(false);
    }
  };

  const fetchServiceDetails = async () => {
    try {
      const [serviceRes, worksRes, tasksRes, documentsRes] = await Promise.all([
        supabase
          .from('services')
          .select('*')
          .eq('id', serviceId)
          .single(),
        supabase
          .from('works')
          .select('*, customers(id, name, email)')
          .eq('service_id', serviceId)
          .order('created_at', { ascending: false }),
        supabase
          .from('service_tasks')
          .select('*, staff:default_assigned_to(name)')
          .eq('service_id', serviceId)
          .order('sort_order'),
        supabase
          .from('service_documents')
          .select('*')
          .eq('service_id', serviceId)
          .order('sort_order'),
      ]);

      if (serviceRes.error) throw serviceRes.error;
      if (worksRes.error) throw worksRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (documentsRes.error) throw documentsRes.error;

      setService(serviceRes.data);
      setWorks(worksRes.data || []);
      setServiceTasks(tasksRes.data || []);
      setServiceDocuments(documentsRes.data || []);

      const uniqueCustomers = new Map();
      worksRes.data?.forEach((work: any) => {
        if (work.customers && work.customer_id) {
          if (!uniqueCustomers.has(work.customer_id)) {
            uniqueCustomers.set(work.customer_id, {
              id: work.customer_id,
              customer_id: work.customer_id,
              price: 0,
              start_date: work.created_at,
              end_date: null,
              status: 'active',
              customers: {
                id: work.customer_id,
                name: work.customers.name,
                email: work.customers.email || ''
              }
            });
          }
        }
      });

      const customerServicesList = Array.from(uniqueCustomers.values());
      setCustomerServices(customerServicesList);

      const totalRevenue = 0;
      const avgPrice = 0;

      const allWorks = worksRes.data || [];
      const completed = allWorks.filter((w) => w.status === 'completed');

      setStatistics({
        totalCustomers: uniqueCustomers.size,
        activeCustomers: uniqueCustomers.size,
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
    { id: 'documents', label: 'Documents', icon: FileText, count: serviceDocuments.length },
    { id: 'customers', label: 'Customers', icon: Users, count: statistics.totalCustomers },
    { id: 'works', label: 'Works', icon: Clock, count: statistics.totalWorks },
    { id: 'revenue', label: 'Revenue', icon: DollarSign },
    { id: 'activity', label: 'Activity Timeline', icon: History },
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
              {service.name}
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
          <div className="flex items-center gap-4 flex-wrap">
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

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 pb-0 bg-white flex-shrink-0 overflow-x-auto border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 font-medium rounded-t-lg transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border-t-2 border-l border-r border-blue-300'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={18} className={activeTab === tab.id ? 'text-blue-600' : 'text-gray-500'} />
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
              {/* Statistics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <button
                  onClick={() => setActiveTab('customers')}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={16} className="text-blue-600" />
                    <p className="text-xs font-medium text-gray-600">Total Customers</p>
                  </div>
                  <p className="text-xl font-bold text-blue-600">{statistics.totalCustomers}</p>
                </button>

                <button
                  onClick={() => setActiveTab('customers')}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={16} className="text-green-600" />
                    <p className="text-xs font-medium text-gray-600">Active</p>
                  </div>
                  <p className="text-xl font-bold text-green-600">{statistics.activeCustomers}</p>
                </button>

                <button
                  onClick={() => setActiveTab('works')}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={16} className="text-orange-600" />
                    <p className="text-xs font-medium text-gray-600">Total Works</p>
                  </div>
                  <p className="text-xl font-bold text-orange-600">{statistics.totalWorks}</p>
                </button>

                <button
                  onClick={() => setActiveTab('works')}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={16} className="text-emerald-600" />
                    <p className="text-xs font-medium text-gray-600">Completed</p>
                  </div>
                  <p className="text-xl font-bold text-emerald-600">{statistics.completedWorks}</p>
                </button>

                <button
                  onClick={() => setActiveTab('revenue')}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign size={16} className="text-teal-600" />
                    <p className="text-xs font-medium text-gray-600">Total Revenue</p>
                  </div>
                  <p className="text-xl font-bold text-teal-600">
                    ₹{statistics.totalRevenue.toLocaleString('en-IN')}
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('revenue')}
                  className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={16} className="text-gray-600" />
                    <p className="text-xs font-medium text-gray-600">Avg Price</p>
                  </div>
                  <p className="text-xl font-bold text-gray-600">
                    ₹{statistics.averagePrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </button>
              </div>

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
                  {service.income_account_id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <label className="text-sm font-medium text-gray-500">Income Ledger Mapping</label>
                      <p className="text-gray-900 mt-1">
                        Custom ledger configured (overrides company default)
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Income from this service will be credited to the configured ledger
                      </p>
                    </div>
                  )}
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
                    <button
                      key={cs.id}
                      onClick={() => {
                        if (onNavigateToCustomer) {
                          onClose();
                          onNavigateToCustomer(cs.customer_id);
                        }
                      }}
                      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow text-left cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                            {cs.customers?.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 hover:text-blue-600 transition-colors">{cs.customers?.name}</h4>
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
                    </button>
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
                    <button
                      key={work.id}
                      onClick={() => {
                        if (onNavigateToWork) {
                          onClose();
                          onNavigateToWork(work.id);
                        }
                      }}
                      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow text-left cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1 hover:text-blue-600 transition-colors">{work.title}</h4>
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
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'revenue' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Landmark size={20} className="text-blue-600" />
                  Income Ledger Mapping
                </h3>
                <p className="text-sm text-gray-700 mb-4">
                  Map this service to a specific income ledger for accurate accounting. If not set, the company's default income ledger will be used.
                </p>
                <div className="bg-white border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Income Ledger for this Service
                  </label>
                  <select
                    value={service?.income_account_id || ''}
                    onChange={(e) => handleUpdateIncomeLedger(e.target.value || null)}
                    disabled={savingLedgerMap}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">-- Use Company Default Income Ledger --</option>
                    {ledgers
                      .filter((l: any) => l.account_groups?.account_type === 'income')
                      .map((ledger) => (
                        <option key={ledger.id} value={ledger.id}>
                          {ledger.account_code} - {ledger.account_name}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    When auto-creating invoices, this ledger will be credited (if set). Otherwise, the company's default income ledger will be used.
                  </p>
                </div>
              </div>

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
              {service.is_recurring && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Repeat size={20} className="text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-1">Recurring Service - Multi-Task Management</h4>
                      <p className="text-sm text-gray-700 mb-2">
                        This service supports multiple tasks per period, each with its own due date.
                      </p>
                      <div className="bg-white border border-orange-200 rounded-lg p-3 text-xs">
                        <p className="font-medium text-gray-900 mb-1">How it works:</p>
                        <ul className="list-disc list-inside space-y-0.5 text-gray-700 ml-2">
                          <li>Add multiple task templates below (e.g., GSTR-1, GSTR-3B)</li>
                          <li>Set individual due dates for each task (e.g., 10th, 20th of month)</li>
                          <li>When a new period is created, all tasks are automatically copied</li>
                          <li>Each task can be tracked, assigned, and completed independently</li>
                          <li>Period completes only when all tasks are done</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Service Task Templates</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {service.is_recurring
                      ? 'Define tasks with individual due dates for each recurring period'
                      : 'Define tasks that will be automatically added when creating work for this service'}
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
                <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-dashed border-blue-300">
                  <CheckSquare size={56} className="mx-auto text-blue-400 mb-4" />
                  <p className="text-gray-900 font-semibold text-lg mb-2">No Task Templates Defined Yet</p>
                  <div className="max-w-2xl mx-auto space-y-3 text-sm text-gray-700">
                    <p>
                      Task templates define the standard workflow for this service.
                    </p>
                    {service?.is_recurring && (
                      <div className="bg-white border border-blue-200 rounded-lg p-4 text-left">
                        <p className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <Repeat size={18} />
                          Recurring Service - Multi-Task Support
                        </p>
                        <p className="text-gray-700 mb-2 text-xs">
                          For recurring services, you can define multiple tasks with individual due dates.
                        </p>
                        <p className="text-gray-800 font-medium text-xs mb-1">Example: GST Filing Service</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2 text-xs">
                          <li><strong>Task 1:</strong> GSTR-1 Filing - Due on 10th of each month</li>
                          <li><strong>Task 2:</strong> GSTR-3B Filing - Due on 20th of each month</li>
                        </ul>
                        <p className="text-gray-600 mt-2 text-xs">
                          Each period will automatically get both tasks with their respective due dates.
                        </p>
                      </div>
                    )}
                    {!service?.is_recurring && (
                      <p className="text-gray-600">
                        Break down this service into smaller tasks for better tracking and management.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setShowTaskModal(true);
                    }}
                    className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg font-medium"
                  >
                    <Plus size={20} />
                    Add First Task Template
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
                            {task.staff && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <User size={14} />
                                {task.staff.name}
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
                          {/* Reorder buttons */}
                          <div className="flex flex-col gap-1 border-r pr-2">
                            <button
                              onClick={async () => {
                                if (index === 0) return;
                                try {
                                  const { error } = await supabase.rpc('reorder_tasks', {
                                    p_table_name: 'service_tasks',
                                    p_task_id: task.id,
                                    p_new_sort_order: task.sort_order - 1,
                                    p_parent_id_column: 'service_id',
                                    p_parent_id: serviceId
                                  });
                                  if (error) throw error;
                                  fetchServiceDetails();
                                  toast.success('Task order updated');
                                } catch (error) {
                                  console.error('Error reordering task:', error);
                                  toast.error('Failed to reorder task');
                                }
                              }}
                              disabled={index === 0}
                              className={`p-1 rounded transition-colors ${
                                index === 0
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              title="Move up"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={async () => {
                                if (index === serviceTasks.length - 1) return;
                                try {
                                  const { error } = await supabase.rpc('reorder_tasks', {
                                    p_table_name: 'service_tasks',
                                    p_task_id: task.id,
                                    p_new_sort_order: task.sort_order + 1,
                                    p_parent_id_column: 'service_id',
                                    p_parent_id: serviceId
                                  });
                                  if (error) throw error;
                                  fetchServiceDetails();
                                  toast.success('Task order updated');
                                } catch (error) {
                                  console.error('Error reordering task:', error);
                                  toast.error('Failed to reorder task');
                                }
                              }}
                              disabled={index === serviceTasks.length - 1}
                              className={`p-1 rounded transition-colors ${
                                index === serviceTasks.length - 1
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              title="Move down"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
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
                                toast.success('Task deleted successfully');
                              } catch (error) {
                                console.error('Error deleting task:', error);
                                toast.error('Failed to delete task');
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

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Required Documents</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Define documents required when creating work for this service
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingDocument(null);
                    setShowDocumentModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={18} />
                  Add Document
                </button>
              </div>

              {serviceDocuments.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No documents defined yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Add documents that will be required when creating work
                  </p>
                  <button
                    onClick={() => {
                      setEditingDocument(null);
                      setShowDocumentModal(true);
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={18} />
                    Add First Document
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {serviceDocuments.map((doc, index) => (
                    <div
                      key={doc.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                              {index + 1}
                            </span>
                            <h4 className="font-medium text-gray-900">{doc.name}</h4>
                            {doc.is_required && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                Required
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {doc.category}
                            </span>
                          </div>
                          {doc.description && (
                            <p className="text-sm text-gray-600 ml-11">{doc.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingDocument(doc);
                              setShowDocumentModal(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit document"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              if (
                                !confirm('Are you sure you want to delete this document requirement?')
                              )
                                return;
                              try {
                                const { error } = await supabase
                                  .from('service_documents')
                                  .delete()
                                  .eq('id', doc.id);
                                if (error) throw error;
                                fetchServiceDetails();
                                toast.success('Document deleted successfully');
                              } catch (error) {
                                console.error('Error deleting document:', error);
                                toast.error('Failed to delete document');
                              }
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete document"
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

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                <p className="text-sm text-gray-600">Complete history of service activities</p>
              </div>
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                <div className="space-y-6">
                  <div className="relative flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center z-10">
                      <CheckCircle size={20} />
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                      <h4 className="font-semibold text-gray-900">Service Created</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(service.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {customerServices.length > 0 && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center z-10">
                        <Users size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">First Customer Added</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {customerServices[customerServices.length - 1]?.customers?.name}
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.totalWorks > 0 && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center z-10">
                        <Clock size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">Works Generated</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Total {statistics.totalWorks} works, {statistics.completedWorks} completed
                        </p>
                      </div>
                    </div>
                  )}

                  {statistics.totalRevenue > 0 && (
                    <div className="relative flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center z-10">
                        <DollarSign size={20} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="font-semibold text-gray-900">Revenue Milestone</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Total revenue: ₹{statistics.totalRevenue.toLocaleString('en-IN')}
                        </p>
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
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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
                  task_recurrence_type: (formData.get('task_recurrence_type') as string) || null,
                  due_offset_type: (formData.get('due_offset_type') as string) || 'days',
                  due_offset_value: formData.get('due_offset_value')
                    ? parseInt(formData.get('due_offset_value') as string)
                    : 10,
                  exact_due_date: (formData.get('exact_due_date') as string) || null,
                  specific_period_dates: editingTask?.specific_period_dates || {},
                  default_assigned_to: (formData.get('default_assigned_to') as string) || null,
                  is_active: true,
                  sort_order: editingTask?.sort_order ?? serviceTasks.length,
                };

                try {
                  if (editingTask) {
                    const { error } = await supabase
                      .from('service_tasks')
                      .update(taskData)
                      .eq('id', editingTask.id);
                    if (error) throw error;
                    toast.success('Task template updated successfully');
                  } else {
                    const { error } = await supabase.from('service_tasks').insert(taskData);
                    if (error) throw error;
                    toast.success('Task template added successfully');
                  }
                  setShowTaskModal(false);
                  setEditingTask(null);
                  fetchServiceDetails();
                } catch (error) {
                  console.error('Error saving task:', error);
                  toast.error('Failed to save task template');
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
                  placeholder="e.g., Collect client documents"
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

              <div className="grid grid-cols-3 gap-4">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Assignee
                  </label>
                  <select
                    name="default_assigned_to"
                    defaultValue={editingTask?.default_assigned_to || ''}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                  </select>
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


              {service.is_recurring && (
                <div className="border-t border-gray-200 pt-4 mt-4 space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Repeat size={16} className="text-blue-600" />
                      Task Frequency & Due Date
                    </h4>
                    <p className="text-xs text-gray-600 mb-3">
                      Service recurrence: <strong>{service.recurrence_type}</strong>. Task frequency cannot exceed service recurrence.
                    </p>

                    <div className="space-y-4">
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    How Often Should This Task Be Due?
  </label>

  {/* compute allowed options based on service.recurrence_type */}
  {(() => {
    const levels = ['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'] as const;
    const svcType = service?.recurrence_type;

    // If service recurrence type is not in the known list, show only "Same as Service"
    const currentIndex = svcType && levels.includes(svcType as any) ? levels.indexOf(svcType as any) : -1;
    const allowedOptions = currentIndex > 0 ? levels.slice(0, currentIndex) : [];

    const pretty = (s: string) =>
      s.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase()); // "half-yearly" -> "Half Yearly"

    return (
      <select
        name="task_recurrence_type"
        defaultValue={editingTask?.task_recurrence_type || service?.recurrence_type || ''}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Same as Service ({service?.recurrence_type || 'unknown'})</option>

        {/* map allowedOptions (will be empty for 'daily' or unknown service type) */}
        {allowedOptions.map((opt) => (
          <option key={opt} value={opt}>
            {pretty(opt)}
          </option>
        ))}
      </select>
    );
  })()}

  <p className="text-xs text-gray-500 mt-1">
    Example: For quarterly GST, GSTR-3B might be monthly while GSTR-1 is quarterly
  </p>
</div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Offset Type
                          </label>
                          <select
                            name="due_offset_type"
                            defaultValue={editingTask?.due_offset_type || 'days'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="days">Days</option>
                            <option value="months">Months</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Offset from Period End
                          </label>
                          <input
                            type="number"
                            name="due_offset_value"
                            min="0"
                            defaultValue={editingTask?.due_offset_value || 10}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., 10, 20"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Examples: 10 days = 10 days after period end, 1 month = 1 month + 10 days after period end
                      </p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Calendar size={16} className="text-green-600" />
                      Exact Due Date (Applies to All Works)
                    </h4>
                    <p className="text-xs text-gray-600 mb-3">
                      Set a fixed due date for this task. This will apply to ALL works using this service.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Exact Due Date (Optional)
                      </label>
                      <input
                        type="date"
                        name="exact_due_date"
                        defaultValue={editingTask?.exact_due_date || ''}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        If set, this overrides the offset calculation. Leave empty to use offset-based calculation.
                      </p>
                    </div>
                    <div className="bg-white border border-green-200 rounded-lg p-3 text-xs text-gray-700 mt-3">
                      <p className="font-medium mb-1">Example:</p>
                      <p>Set "2025-03-15" to make this task due on 15th March 2025 for all works.</p>
                    </div>
                  </div>
                </div>
              )}

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

      {/* Document Modal */}
      {showDocumentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h3 className="text-xl font-bold text-white">
                {editingDocument ? 'Edit Document' : 'Add Document'}
              </h3>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const docData = {
                  service_id: serviceId,
                  user_id: user?.id,
                  name: formData.get('name') as string,
                  description: (formData.get('description') as string) || null,
                  category: formData.get('category') as string,
                  is_required: formData.get('is_required') === 'on',
                  sort_order: serviceDocuments.length,
                };

                try {
                  if (editingDocument) {
                    const { error } = await supabase
                      .from('service_documents')
                      .update(docData)
                      .eq('id', editingDocument.id);
                    if (error) throw error;
                    toast.success('Document updated successfully');
                  } else {
                    const { error } = await supabase.from('service_documents').insert(docData);
                    if (error) throw error;
                    toast.success('Document added successfully');
                  }
                  setShowDocumentModal(false);
                  setEditingDocument(null);
                  fetchServiceDetails();
                } catch (error) {
                  console.error('Error saving document:', error);
                  toast.error('Failed to save document');
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingDocument?.name || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., GST Certificate"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  name="description"
                  defaultValue={editingDocument?.description || ''}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Brief description of this document..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  name="category"
                  defaultValue={editingDocument?.category || 'general'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="general">General</option>
                  <option value="tax">Tax Documents</option>
                  <option value="financial">Financial</option>
                  <option value="legal">Legal</option>
                  <option value="compliance">Compliance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_required"
                  id="is_required"
                  defaultChecked={editingDocument?.is_required || false}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_required" className="text-sm font-medium text-gray-700">
                  Mark as required document
                </label>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDocumentModal(false);
                    setEditingDocument(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingDocument ? 'Update Document' : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
