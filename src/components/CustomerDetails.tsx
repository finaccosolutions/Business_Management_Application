// src/components/CustomerDetails.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  User,
  Briefcase,
  FileText,
  DollarSign,
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Edit2,
  TrendingUp,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import CustomerFormModal from './CustomerFormModal';

interface CustomerDetailsProps {
  customerId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  image_url: string;
  contact_person: string;
  designation: string;
  alternate_phone: string;
  website: string;
  gstin: string;
  pan_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc_code: string;
  bank_branch: string;
  notes: string;
  created_at: string;
}

interface CustomerService {
  id: string;
  service_id: string;
  price: number;
  start_date: string;
  end_date: string | null;
  status: string;
  services: { name: string; description: string };
}

interface Work {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
  created_at: string;
  services: { name: string };
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: string;
  paid_at: string | null;
}

type TabType = 'overview' | 'services' | 'works' | 'invoices' | 'communications' | 'documents';

export default function CustomerDetails({
  customerId,
  onClose,
  onUpdate,
}: CustomerDetailsProps) {
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [services, setServices] = useState<CustomerService[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);
  const [statistics, setStatistics] = useState({
    totalInvoiced: 0,
    totalPaid: 0,
    totalPending: 0,
    activeServices: 0,
    completedWorks: 0,
    pendingWorks: 0,
  });

  useEffect(() => {
    if (customerId) {
      fetchCustomerDetails();
    }
  }, [customerId]);

  const fetchCustomerDetails = async () => {
    try {
      const [customerRes, servicesRes, worksRes, invoicesRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single(),
        supabase
          .from('customer_services')
          .select('*, services(name, description)')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('works')
          .select('*, services(name)')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*')
          .eq('customer_id', customerId)
          .order('invoice_date', { ascending: false }),
      ]);

      if (customerRes.error) throw customerRes.error;
      if (servicesRes.error) throw servicesRes.error;
      if (worksRes.error) throw worksRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      setCustomer(customerRes.data);
      setServices(servicesRes.data || []);
      setWorks(worksRes.data || []);
      setInvoices(invoicesRes.data || []);

      // Calculate statistics
      const totalInvoiced = invoicesRes.data?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
      const totalPaid = invoicesRes.data?.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
      const totalPending = totalInvoiced - totalPaid;
      const activeServices = servicesRes.data?.filter(s => s.status === 'active').length || 0;
      const completedWorks = worksRes.data?.filter(w => w.status === 'completed').length || 0;
      const pendingWorks = worksRes.data?.filter(w => w.status !== 'completed').length || 0;

      setStatistics({
        totalInvoiced,
        totalPaid,
        totalPending,
        activeServices,
        completedWorks,
        pendingWorks,
      });
    } catch (error: any) {
      console.error('Error fetching customer details:', error.message);
      alert('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    fetchCustomerDetails();
    onUpdate();
  };

  const tabs: Array<{ id: TabType; label: string; icon: any }> = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'services', label: 'Services', icon: Briefcase },
    { id: 'works', label: 'Works', icon: Clock },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'communications', label: 'Communications', icon: MessageSquare },
    { id: 'documents', label: 'Documents', icon: FileText },
  ];

  if (loading || !customer) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-600 to-green-700">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center overflow-hidden">
              {customer.image_url ? (
                <img
                  src={customer.image_url}
                  alt={customer.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={32} className="text-green-600" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{customer.name}</h2>
              {customer.company_name && (
                <p className="text-green-100 flex items-center gap-1">
                  <Building2 size={14} />
                  {customer.company_name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
            >
              <Edit2 size={18} />
              Edit
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-6 bg-gray-50 border-b border-gray-200">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-blue-600" />
              <p className="text-xs font-medium text-gray-600">Total Invoiced</p>
            </div>
            <p className="text-xl font-bold text-blue-600">
              ₹{statistics.totalInvoiced.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-xs font-medium text-gray-600">Total Paid</p>
            </div>
            <p className="text-xl font-bold text-green-600">
              ₹{statistics.totalPaid.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-orange-600" />
              <p className="text-xs font-medium text-gray-600">Pending</p>
            </div>
            <p className="text-xl font-bold text-orange-600">
              ₹{statistics.totalPending.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={16} className="text-teal-600" />
              <p className="text-xs font-medium text-gray-600">Active Services</p>
            </div>
            <p className="text-xl font-bold text-teal-600">{statistics.activeServices}</p>
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
              <Clock size={16} className="text-yellow-600" />
              <p className="text-xs font-medium text-gray-600">Pending Works</p>
            </div>
            <p className="text-xl font-bold text-yellow-600">{statistics.pendingWorks}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600 bg-white'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab customer={customer} />
          )}

          {activeTab === 'services' && (
            <ServicesTab services={services} customerId={customerId} onUpdate={fetchCustomerDetails} />
          )}

          {activeTab === 'works' && (
            <WorksTab works={works} customerId={customerId} onUpdate={fetchCustomerDetails} />
          )}

          {activeTab === 'invoices' && (
            <InvoicesTab invoices={invoices} statistics={statistics} />
          )}

          {activeTab === 'communications' && (
            <CommunicationsTab customerId={customerId} />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab customerId={customerId} />
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <CustomerFormModal
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
          initialData={customer}
          mode="edit"
          customerId={customerId}
          title={`Edit Customer: ${customer.name}`}
        />
      )}
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ customer }: { customer: Customer }) {
  return (
    <div className="space-y-6">
      {/* Contact Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User size={20} className="text-green-600" />
          Contact Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customer.email && (
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{customer.email}</p>
              </div>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900">{customer.phone}</p>
              </div>
            </div>
          )}
          {customer.alternate_phone && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Alternate Phone</p>
                <p className="text-sm font-medium text-gray-900">{customer.alternate_phone}</p>
              </div>
            </div>
          )}
          {customer.website && (
            <div className="flex items-center gap-3">
              <Building2 size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Website</p>
                <a
                  href={customer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {customer.website}
                </a>
              </div>
            </div>
          )}
          {customer.contact_person && (
            <div className="flex items-center gap-3">
              <User size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Contact Person</p>
                <p className="text-sm font-medium text-gray-900">{customer.contact_person}</p>
              </div>
            </div>
          )}
          {customer.designation && (
            <div className="flex items-center gap-3">
              <Briefcase size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Designation</p>
                <p className="text-sm font-medium text-gray-900">{customer.designation}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Address Information */}
      {customer.address && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-green-600" />
            Address
          </h3>
          <p className="text-gray-700 mb-2">{customer.address}</p>
          <p className="text-gray-700">
            {[customer.city, customer.state, customer.pincode, customer.country]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      )}

      {/* Tax & Statutory Information */}
      {(customer.gstin || customer.pan_number) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-green-600" />
            Tax & Statutory Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customer.gstin && (
              <div>
                <p className="text-xs text-gray-500">GSTIN</p>
                <p className="text-sm font-medium text-gray-900">{customer.gstin}</p>
              </div>
            )}
            {customer.pan_number && (
              <div>
                <p className="text-xs text-gray-500">PAN Number</p>
                <p className="text-sm font-medium text-gray-900">{customer.pan_number}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bank Details */}
      {customer.bank_name && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard size={20} className="text-green-600" />
            Bank Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customer.bank_name && (
              <div>
                <p className="text-xs text-gray-500">Bank Name</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_name}</p>
              </div>
            )}
            {customer.bank_branch && (
              <div>
                <p className="text-xs text-gray-500">Branch</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_branch}</p>
              </div>
            )}
            {customer.bank_account_number && (
              <div>
                <p className="text-xs text-gray-500">Account Number</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_account_number}</p>
              </div>
            )}
            {customer.bank_ifsc_code && (
              <div>
                <p className="text-xs text-gray-500">IFSC Code</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_ifsc_code}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {customer.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-green-600" />
            Notes
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
        </div>
      )}

      {/* Customer Since */}
      <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200 p-6">
        <p className="text-sm text-green-700">
          Customer since {new Date(customer.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>
    </div>
  );
}

// Services Tab Component
function ServicesTab({
  services,
  customerId,
  onUpdate,
}: {
  services: CustomerService[];
  customerId: string;
  onUpdate: () => void;
}) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-700',
    expired: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          Services ({services.length})
        </h3>
        <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
          <Plus size={18} />
          Add Service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Briefcase size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No services assigned</h4>
          <p className="text-gray-600 mb-4">Assign services to this customer to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">{service.services.name}</h4>
                  {service.services.description && (
                    <p className="text-sm text-gray-600">{service.services.description}</p>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    statusColors[service.status] || statusColors.inactive
                  }`}
                >
                  {service.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price:</span>
                  <span className="font-semibold text-gray-900">
                    ₹{service.price.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Start Date:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(service.start_date).toLocaleDateString()}
                  </span>
                </div>
                {service.end_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">End Date:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(service.end_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Works Tab Component
function WorksTab({
  works,
  customerId,
  onUpdate,
}: {
  works: Work[];
  customerId: string;
  onUpdate: () => void;
}) {
  const [filterStatus, setFilterStatus] = useState('all');

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  const filteredWorks =
    filterStatus === 'all'
      ? works
      : works.filter((work) => work.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Works ({works.length})</h3>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Plus size={18} />
            Add Work
          </button>
        </div>
      </div>

      {filteredWorks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Clock size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            {filterStatus === 'all' ? 'No works yet' : 'No works match the filter'}
          </h4>
          <p className="text-gray-600 mb-4">
            {filterStatus === 'all'
              ? 'Create a work assignment for this customer to get started.'
              : 'Try adjusting your filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWorks.map((work) => (
            <div
              key={work.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">{work.title}</h4>
                  <p className="text-sm text-gray-600">{work.services.name}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${
                    statusColors[work.status] || statusColors.pending
                  }`}
                >
                  {work.status.replace('_', ' ')}
                </span>
              </div>

              {work.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{work.description}</p>
              )}

              <div className="flex items-center justify-between text-sm">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    priorityColors[work.priority] || priorityColors.medium
                  }`}
                >
                  {work.priority}
                </span>
                {work.due_date && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar size={14} />
                    <span>{new Date(work.due_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Invoices Tab Component
function InvoicesTab({
  invoices,
  statistics,
}: {
  invoices: Invoice[];
  statistics: any;
}) {
  const [filterStatus, setFilterStatus] = useState('all');

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const filteredInvoices =
    filterStatus === 'all'
      ? invoices
      : invoices.filter((invoice) => invoice.status === filterStatus);

  return (
    <div className="space-y-6">
      {/* Financial Summary */}
      <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl border border-green-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-green-600" />
          Financial Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Invoiced</p>
            <p className="text-2xl font-bold text-blue-600">
              ₹{statistics.totalInvoiced.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-green-600">
              ₹{statistics.totalPaid.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Outstanding Balance</p>
            <p className="text-2xl font-bold text-orange-600">
              ₹{statistics.totalPending.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Invoices ({invoices.length})
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Plus size={18} />
            Create Invoice
          </button>
        </div>
      </div>

      {/* Invoices List */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            {filterStatus === 'all' ? 'No invoices yet' : 'No invoices match the filter'}
          </h4>
          <p className="text-gray-600 mb-4">
            {filterStatus === 'all'
              ? 'Create an invoice for this customer to get started.'
              : 'Try adjusting your filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {invoice.invoice_number}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    statusColors[invoice.status] || statusColors.draft
                  }`}
                >
                  {invoice.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="text-lg font-bold text-green-600">
                    ₹{invoice.total_amount.toLocaleString('en-IN')}
                  </span>
                </div>
                {invoice.paid_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Paid On:</span>
                    <span className="font-medium text-green-700">
                      {new Date(invoice.paid_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <button className="w-full px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
                View Details
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Communications Tab Component
function CommunicationsTab({ customerId }: { customerId: string }) {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
      <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
      <h4 className="text-lg font-medium text-gray-900 mb-2">Communications</h4>
      <p className="text-gray-600">Track all communications with this customer.</p>
      <p className="text-sm text-gray-500 mt-2">Coming soon...</p>
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ customerId }: { customerId: string }) {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
      <FileText size={48} className="mx-auto text-gray-400 mb-4" />
      <h4 className="text-lg font-medium text-gray-900 mb-2">Documents</h4>
      <p className="text-gray-600">Store and manage customer-related documents.</p>
      <p className="text-sm text-gray-500 mt-2">Coming soon...</p>
    </div>
  );
}
