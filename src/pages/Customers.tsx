// src/pages/Customers.tsx - FULL-WIDTH ROW DESIGN
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  Filter,
  UserCog,
  Mail,
  Phone,
  Building,
  MapPin,
  Trash2,
  TrendingUp,
  Users,
  DollarSign,
  Briefcase,
  Calendar,
  Globe,
  FileText,
  Clock,
  AlertCircle,
  Eye,
  Edit2,
} from 'lucide-react';
import CustomerDetails from '../components/CustomerDetails';
import CustomerFormModal from '../components/CustomerFormModal';
import CustomerFilters, { FilterState } from '../components/CustomerFilters';
import ServiceDetails from '../components/ServiceDetails';
import WorkDetails from '../components/works/WorkDetailsMain';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  gstin: string | null;
  pan_number: string | null;
  website: string | null;
  notes: string | null;
  image_url: string | null;
  entity_type: string | null;
  legal_form: string | null;
  created_at: string;
  service_count?: number;
  total_revenue?: number;
  last_invoice_date?: string;
  pending_works?: number;
  active_services?: number;
  overdue_invoices?: number;
}

interface CustomerStatistics {
  totalCustomers: number;
  activeCustomers: number;
  newThisMonth: number;
  totalRevenue: number;
  averageRevenue: number;
}

const getCustomerBorderColor = (customer: Customer, avgRevenue: number): string => {
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCreated <= 30) {
    return 'border-l-teal-500 hover:bg-teal-50/30';
  }

  if (customer.overdue_invoices && customer.overdue_invoices > 0) {
    return 'border-l-red-500 hover:bg-red-50/30';
  }

  if (customer.total_revenue && customer.total_revenue > avgRevenue && avgRevenue > 0) {
    return 'border-l-green-500 hover:bg-green-50/30';
  }

  if (customer.pending_works && customer.pending_works > 0) {
    return 'border-l-orange-500 hover:bg-orange-50/30';
  }

  if (customer.active_services && customer.active_services >= 3) {
    return 'border-l-blue-500 hover:bg-blue-50/30';
  }

  return 'border-l-gray-400 hover:bg-gray-50/30';
};

interface CustomersProps {
  onNavigate?: (page: string) => void;
}

export default function Customers({ onNavigate }: CustomersProps = {}) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statistics, setStatistics] = useState<CustomerStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [prefilledCustomerId, setPrefilledCustomerId] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<'service' | 'work' | 'invoice' | null>(null);
  const confirmation = useConfirmation();
  const toast = useToast();

  const [filters, setFilters] = useState<FilterState>({
    sources: [],
    serviceTypes: [],
    cities: [],
    states: [],
    gstStatus: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
  const navigationState = sessionStorage.getItem('searchNavigationState');
  if (navigationState) {
    try {
      const state = JSON.parse(navigationState);
      if (state.itemType === 'customer' && state.shouldShowDetails) {
        // Set the selected customer to show detail view
        setSelectedCustomerId(state.selectedId);
        setShowCustomerDetails(true);
        sessionStorage.removeItem('searchNavigationState');
      }
    } catch (error) {
      console.error('Error reading navigation state:', error);
    }
  }
}, []);


  useEffect(() => {
    if (user) {
      fetchCustomers();
      fetchStatistics();
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [customers, filters, searchTerm]);

  useEffect(() => {
    if (navigationTarget && prefilledCustomerId && onNavigate) {
      sessionStorage.setItem('prefilledCustomerId', prefilledCustomerId);

      if (navigationTarget === 'service') {
        onNavigate('services');
      } else if (navigationTarget === 'work') {
        onNavigate('works');
      } else if (navigationTarget === 'invoice') {
        onNavigate('invoices');
      }

      setNavigationTarget(null);
      setPrefilledCustomerId(null);
    }
  }, [navigationTarget, prefilledCustomerId, onNavigate]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enrichedCustomers = await Promise.all(
        (data || []).map(async (customer) => {
          const { data: servicesData } = await supabase
            .from('customer_services')
            .select('id')
            .eq('customer_id', customer.id)
            .eq('status', 'active');

          const { data: invoicesData } = await supabase
            .from('invoices')
            .select('total_amount, invoice_date, status, due_date')
            .eq('customer_id', customer.id)
            .order('invoice_date', { ascending: false });

          const totalRevenue =
            invoicesData
              ?.filter((inv) => inv.status === 'paid')
              .reduce((sum, inv) => sum + inv.total_amount, 0) || 0;

          const lastInvoiceDate = invoicesData?.[0]?.invoice_date || null;

          const now = new Date();
          const overdueCount = invoicesData?.filter(
            (inv) => inv.status !== 'paid' && new Date(inv.due_date) < now
          ).length || 0;

          const { data: worksData } = await supabase
            .from('works')
            .select('id')
            .eq('customer_id', customer.id)
            .neq('status', 'completed');

          return {
            ...customer,
            service_count: servicesData?.length || 0,
            active_services: servicesData?.length || 0,
            total_revenue: totalRevenue,
            last_invoice_date: lastInvoiceDate,
            pending_works: worksData?.length || 0,
            overdue_invoices: overdueCount,
          };
        })
      );

      setCustomers(enrichedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      setLoadingStats(true);

      const [customersRes, invoicesRes] = await Promise.all([
        supabase.from('customers').select('id, created_at').eq('user_id', user?.id),
        supabase.from('invoices').select('customer_id, total_amount, status').eq('user_id', user?.id),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      const customers = customersRes.data || [];
      const invoices = invoicesRes.data || [];

      const totalRevenue = invoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const averageRevenue = customers.length > 0 ? totalRevenue / customers.length : 0;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newThisMonth = customers.filter((c) => new Date(c.created_at) >= startOfMonth).length;

      const stats: CustomerStatistics = {
        totalCustomers: customers.length,
        activeCustomers: customers.length,
        newThisMonth,
        totalRevenue,
        averageRevenue,
      };

      setStatistics(stats);
    } catch (error: any) {
      console.error('Error fetching statistics:', error);
      toast.error('Failed to fetch statistics');
    } finally {
      setLoadingStats(false);
    }
  };

  const applyFilters = () => {
    let filtered = customers;

    if (filters.cities.length > 0) {
      filtered = filtered.filter((c) => c.city && filters.cities.includes(c.city));
    }

    if (filters.states.length > 0) {
      filtered = filtered.filter((c) => c.state && filters.states.includes(c.state));
    }

    if (filters.gstStatus === 'has_gst') {
      filtered = filtered.filter((c) => c.gstin);
    } else if (filters.gstStatus === 'no_gst') {
      filtered = filtered.filter((c) => !c.gstin);
    }

    if (filters.dateFrom) {
      filtered = filtered.filter((c) => new Date(c.created_at) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      filtered = filtered.filter((c) => new Date(c.created_at) <= new Date(filters.dateTo));
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone?.includes(searchTerm) ||
          c.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredCustomers(filtered);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    confirmation.showConfirmation({
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone.',
      confirmText: 'Delete',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('customers').delete().eq('id', id);
          if (error) throw error;
          toast.success('Customer deleted successfully');
          fetchCustomers();
          fetchStatistics();
        } catch (error) {
          console.error('Error deleting customer:', error);
          toast.error('Failed to delete customer');
        }
      },
    });
  };

  const handleAddSuccess = (customerId: string) => {
    setShowAddModal(false);
    fetchCustomers();
    fetchStatistics();
    setSelectedCustomerId(customerId);
  };

  const handleEditSuccess = () => {
    setEditingCustomerId(null);
    fetchCustomers();
    fetchStatistics();
  };

  const handleEdit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomerId(id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const editingCustomer = editingCustomerId ? customers.find(c => c.id === editingCustomerId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Customers</h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Filters"
          >
            <Filter className="w-4 h-4" />
            {(filters.sources.length > 0 ||
              filters.serviceTypes.length > 0 ||
              filters.cities.length > 0 ||
              filters.states.length > 0 ||
              filters.gstStatus !== 'all' ||
              filters.dateFrom ||
              filters.dateTo) && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1 text-xs">
                {[
                  filters.sources.length,
                  filters.serviceTypes.length,
                  filters.cities.length,
                  filters.states.length,
                  filters.gstStatus !== 'all' ? 1 : 0,
                  filters.dateFrom ? 1 : 0,
                  filters.dateTo ? 1 : 0,
                ].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
            title="Add Customer"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <CustomerFilters onFilterChange={setFilters} activeFilters={filters} />
        </div>
      )}

      <div className="sm:hidden bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
          <Users size={40} className="mx-auto text-gray-400 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No customers found</h3>
          <p className="text-sm text-gray-600 mb-6">
            {searchTerm || filters.cities.length > 0
              ? 'Try adjusting your search or filter criteria'
              : 'Get started by adding your first customer'}
          </p>
          {!searchTerm && filters.cities.length === 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              Add Your First Customer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredCustomers.map((customer) => {
            const borderColor = getCustomerBorderColor(customer, statistics?.averageRevenue || 0);

            return (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className={`bg-white rounded-lg shadow-sm border-l-4 ${borderColor} border-t border-r border-b border-gray-200 transition-all cursor-pointer hover:shadow-md`}
              >
                <div className="p-2 sm:p-3">
                  <div className="flex items-center gap-2 justify-between">
                    {/* Left: Avatar + Name + Details on one line */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0 overflow-hidden text-xs sm:text-sm font-bold">
                        {customer.image_url ? (
                          <img
                            src={customer.image_url}
                            alt={customer.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                const initials = document.createElement('span');
                                initials.className = 'text-xs sm:text-sm font-bold';
                                initials.textContent = customer.name?.charAt(0).toUpperCase() || 'C';
                                parent.appendChild(initials);
                              }
                            }}
                          />
                        ) : (
                          <span>{customer.name?.charAt(0).toUpperCase() || 'C'}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-xs sm:text-sm truncate flex-shrink-0" title={customer.name}>
                            {customer.name}
                          </h3>
                          {customer.entity_type && (
                            <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded whitespace-nowrap">
                              {customer.entity_type}
                            </span>
                          )}
                          {customer.email && (
                            <a
                              href={`mailto:${customer.email}`}
                              className="text-xs text-blue-600 hover:underline truncate min-w-0"
                              onClick={(e) => e.stopPropagation()}
                              title={customer.email}
                            >
                              {customer.email}
                            </a>
                          )}
                          {customer.phone && (
                            <span className="text-xs text-gray-600 whitespace-nowrap" title={customer.phone}>
                              {customer.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Stats + Actions */}
                    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                      {(customer.total_revenue || 0) > 0 && (
                        <div className="flex items-center gap-0.5 bg-green-50 rounded px-1 sm:px-1.5 py-0.5" title="Total Revenue">
                          <DollarSign size={12} className="text-green-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-green-700 whitespace-nowrap">
                            ₹{((customer.total_revenue || 0) / 1000).toFixed(0)}k
                          </span>
                        </div>
                      )}
                      {(customer.active_services || 0) > 0 && (
                        <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 sm:px-1.5 py-0.5" title="Active Services">
                          <Briefcase size={12} className="text-blue-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-blue-700">{customer.active_services}</span>
                        </div>
                      )}
                      {(customer.pending_works || 0) > 0 && (
                        <div className="flex items-center gap-0.5 bg-orange-50 rounded px-1 sm:px-1.5 py-0.5" title="Pending Works">
                          <Clock size={12} className="text-orange-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-orange-700">{customer.pending_works}</span>
                        </div>
                      )}
                      {(customer.overdue_invoices || 0) > 0 && (
                        <div className="flex items-center gap-0.5 bg-red-50 rounded px-1 sm:px-1.5 py-0.5" title="Overdue Invoices">
                          <AlertCircle size={12} className="text-red-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-red-700">{customer.overdue_invoices}</span>
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomerId(customer.id);
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={(e) => handleEdit(customer.id, e)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors flex-shrink-0"
                        title="Edit Customer"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(customer.id, e)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                        title="Delete Customer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <CustomerFormModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
          mode="create"
        />
      )}

      {editingCustomerId && editingCustomer && (
        <CustomerFormModal
          onClose={() => setEditingCustomerId(null)}
          onSuccess={handleEditSuccess}
          initialData={editingCustomer}
          mode="edit"
          customerId={editingCustomerId}
          title={`Edit Customer: ${editingCustomer.name}`}
        />
      )}

      {selectedCustomerId && (
        <CustomerDetails
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={fetchCustomers}
          onNavigateToService={(serviceId) => {
            setSelectedCustomerId(null);
            setSelectedServiceId(serviceId);
          }}
          onNavigateToWork={(workId) => {
            setSelectedCustomerId(null);
            setSelectedWorkId(workId);
          }}
          onNavigateToCreateService={(customerId) => {
            setPrefilledCustomerId(customerId);
            setNavigationTarget('service');
          }}
          onNavigateToCreateWork={(customerId) => {
            setPrefilledCustomerId(customerId);
            setNavigationTarget('work');
          }}
          onNavigateToCreateInvoice={(customerId) => {
            setPrefilledCustomerId(customerId);
            setNavigationTarget('invoice');
          }}
        />
      )}

      {selectedServiceId && (
        <ServiceDetails
          serviceId={selectedServiceId}
          onClose={() => setSelectedServiceId(null)}
          onEdit={() => {}}
          onNavigateToCustomer={(customerId) => {
            setSelectedServiceId(null);
            setSelectedCustomerId(customerId);
          }}
          onNavigateToWork={(workId) => {
            setSelectedServiceId(null);
            setSelectedWorkId(workId);
          }}
        />
      )}

      {selectedWorkId && (
        <WorkDetails
          workId={selectedWorkId}
          onClose={() => setSelectedWorkId(null)}
          onUpdate={fetchCustomers}
        />
      )}
    </div>
  );
}
