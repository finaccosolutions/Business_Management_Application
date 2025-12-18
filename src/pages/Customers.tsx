// src/pages/Customers.tsx - FULL-WIDTH ROW DESIGN
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Users,
  DollarSign,
  Briefcase,
  Clock,
  AlertCircle,
  Eye,
  Edit2,
} from 'lucide-react';
import CustomerDetails from '../components/CustomerDetails';
import CustomerFilters, { FilterState } from '../components/CustomerFilters';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  gstin: string | null; // Added GSTIN
  pan_number: string | null; // Added PAN
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
  service_count?: number;
  total_revenue?: number;
  last_invoice_date?: string;
  active_services?: number;
  pending_works?: number; // Added pending works count
  overdue_invoices?: number; // Added overdue invoices count
}

interface CustomerStatistics {
  totalCustomers: number;
  activeCustomers: number;
  newThisMonth: number;
  totalRevenue: number;
  averageRevenue: number;
}

const getCustomerBorderColor = (customer: Customer) => {
  if (customer.overdue_invoices && customer.overdue_invoices > 0) {
    return 'border-l-red-500 hover:bg-red-50/30';
  }

  if (customer.pending_works && customer.pending_works > 0) {
    return 'border-l-amber-500 hover:bg-amber-50/30';
  }

  if (customer.active_services && customer.active_services >= 3) {
    return 'border-l-blue-500 hover:bg-blue-50/30';
  }

  return 'border-l-gray-400 hover:bg-gray-50/30';
};

interface CustomersProps {
  isDetailsView?: boolean;
  customerId?: string;
  onNavigate?: (page: string, params?: any) => void;
}

export default function Customers({ isDetailsView, customerId, onNavigate }: CustomersProps = {}) {
  const { user, permissions } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statistics, setStatistics] = useState<CustomerStatistics | null>(null);

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

  // Handle detailed view


  const fetchCustomers = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      const transformedData: Customer[] = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        company_name: item.company_name,
        gstin: item.gstin,
        pan_number: item.pan_number,
        address: item.address,
        city: item.city,
        state: item.state,
        pincode: item.pincode,
        country: item.country,
        website: item.website,
        notes: item.notes,
        created_at: item.created_at,
        service_count: 0, // Placeholder as view is removed
        total_revenue: 0, // Placeholder as view is removed
        last_invoice_date: undefined, // Placeholder as view is removed
        active_services: 0, // Placeholder as view is removed
        pending_works: 0, // Placeholder as view is removed
        overdue_invoices: 0, // Placeholder as view is removed
      }));

      // Calculate Statistics
      const totalCustomers = transformedData.length;
      const activeCustomers = transformedData.filter(
        (c) => (c.active_services && c.active_services > 0)
      ).length;

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newThisMonth = transformedData.filter((c) =>
        new Date(c.created_at) >= firstDayOfMonth
      ).length;

      const totalRevenue = transformedData.reduce(
        (sum, c) => sum + (c.total_revenue || 0),
        0
      );

      setStatistics({
        totalCustomers,
        activeCustomers,
        newThisMonth,
        totalRevenue,
        averageRevenue: totalCustomers > 0 ? totalRevenue / totalCustomers : 0,
      });


      setCustomers(transformedData);
      setFilteredCustomers(transformedData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.showToast('error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (user && !isDetailsView) {
      fetchCustomers();
    }
  }, [user, isDetailsView]);


  useEffect(() => {
    applyFilters();
  }, [customers, searchTerm, filters]);


  const applyFilters = () => {
    let result = customers;

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(
        (customer) =>
          customer.name.toLowerCase().includes(lowerSearch) ||
          customer.email?.toLowerCase().includes(lowerSearch) ||
          customer.phone?.includes(lowerSearch) ||
          customer.company_name?.toLowerCase().includes(lowerSearch) ||
          customer.city?.toLowerCase().includes(lowerSearch)
      );
    }

    if (filters.cities.length > 0) {
      result = result.filter(c => c.city && filters.cities.includes(c.city));
    }

    if (filters.states.length > 0) {
      result = result.filter(c => c.state && filters.states.includes(c.state));
    }

    if (filters.gstStatus !== 'all') {
      if (filters.gstStatus === 'has_gst') {
        result = result.filter(c => !!c.gstin);
      } else {
        result = result.filter(c => !c.gstin);
      }
    }
    // Date ranges logic if needed...

    setFilteredCustomers(result);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!permissions?.customers?.delete) {
      toast.showToast('error', "You don't have permission to delete customers");
      return;
    }

    confirmation.showConfirmation({
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('customers').delete().eq('id', id);
          if (error) throw error;
          toast.showToast('success', 'Customer deleted successfully');
          fetchCustomers();
        } catch (error) {
          console.error('Error deleting customer:', error);
          toast.showToast('error', 'Failed to delete customer');
        }
      },
    });
  };

  const handleEdit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate?.('create-customer', { id });
  };

  // Handle detailed view
  if (isDetailsView && customerId) {
    return (
      <CustomerDetails
        customerId={customerId}
        onBack={() => onNavigate?.('customers')}
        onUpdate={() => {
          fetchCustomers(); // Refresh list when coming back or updating
        }}
      />
    );
  }

  if (loading && !isDetailsView) { // Only show loading spinner if NOT in details view
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
      {/* Header and Statistics (Top Component) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Customer Management
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Manage your client relationships and history
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64 pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 border rounded-lg hover:bg-gray-50 transition-colors ${showFilters
                  ? 'border-green-500 text-green-600 bg-green-50'
                  : 'border-gray-300 text-gray-600'
                  }`}
                title="Filter"
              >
                <Filter size={20} />
              </button>
              {permissions?.customers?.create && (
                <button
                  onClick={() => onNavigate?.('create-customer')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <CustomerFilters
            activeFilters={filters}
            onFilterChange={setFilters}
            cities={Array.from(new Set(customers.map((c) => c.city).filter(Boolean))) as string[]}
            states={Array.from(new Set(customers.map((c) => c.state).filter(Boolean))) as string[]}
            uniqueSources={[]} // Pass empty or actual sources if available
            uniqueServiceTypes={[]} // Pass empty or actual service types if available
          />
        </div>
      )}


      {/* Customer List */}
      <div className="grid grid-cols-1 gap-3">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || showFilters
                ? 'Try adjusting your search or filters'
                : 'Get started by adding your first customer'}
            </p>
            {!searchTerm && !showFilters && permissions?.customers?.create && (
              <button
                onClick={() => onNavigate?.('create-customer')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <Plus size={18} />
                Add Customer
              </button>
            )}
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              onClick={() => onNavigate?.('customer-details', { id: customer.id })}
              className={`group bg-white rounded-lg border-t border-b border-r border-gray-200 border-l-[3px] shadow-sm hover:shadow-md transition-all cursor-pointer ${getCustomerBorderColor(
                customer
              )}`}
            >
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  {/* Left Section: Avatar + Basic Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="hidden sm:flex h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 items-center justify-center text-gray-600 font-bold text-sm shrink-0 uppercase border border-gray-300">
                      {customer.name.substring(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate group-hover:text-green-700 transition-colors">
                          {customer.name}
                        </h3>
                        {customer.company_name && (
                          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[150px]">
                            <Briefcase size={10} className="mr-1" />
                            {customer.company_name}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-500">
                        {customer.city && (
                          <span className="flex items-center truncate">
                            {customer.city}, {customer.state}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="hidden sm:flex items-center truncate">
                            {customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Metrics + Actions */}
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="hidden md:flex items-center gap-6">
                      {customer.pending_works !== undefined && customer.pending_works > 0 && (
                        <div className="flex flex-col items-end text-right" title="Pending Works">
                          <span className="text-xs text-gray-500 uppercase font-semibold">Pending</span>
                          <span className="text-sm font-bold text-amber-600 flex items-center gap-1">
                            <Clock size={14} />
                            {customer.pending_works}
                          </span>
                        </div>
                      )}

                      {customer.overdue_invoices !== undefined && customer.overdue_invoices > 0 && (
                        <div className="flex flex-col items-end text-right" title="Overdue Invoices">
                          <span className="text-xs text-gray-500 uppercase font-semibold">Overdue</span>
                          <span className="text-sm font-bold text-red-600 flex items-center gap-1">
                            <AlertCircle size={14} />
                            {customer.overdue_invoices}
                          </span>
                        </div>
                      )}

                      {(customer.total_revenue || 0) > 0 && (
                        <div className="flex flex-col items-end text-right min-w-[80px]">
                          <span className="text-xs text-gray-500 uppercase font-semibold">Revenue</span>
                          <span className="text-sm font-bold text-gray-900 flex items-center justify-end gap-1">
                            <DollarSign size={12} className="text-gray-400" />
                            {(customer.total_revenue! / 1000).toFixed(1)}k
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 pl-4 border-l border-gray-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate?.('customer-details', { id: customer.id });
                        }}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={(e) => handleEdit(customer.id, e)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      {permissions?.customers?.delete && (
                        <button
                          onClick={(e) => handleDelete(customer.id, e)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
