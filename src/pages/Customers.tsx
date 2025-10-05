// src/pages/Customers.tsx - ENHANCED VERSION WITH STATISTICS & FILTERS
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  UserCog,
  Mail,
  Phone,
  Building,
  MapPin,
  Trash2,
  Filter,
  X,
  TrendingUp,
  Users,
  DollarSign,
  Briefcase,
  CheckCircle,
  Activity,
  Calendar,
  Download,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import CustomerDetails from '../components/CustomerDetails';
import CustomerFormModal from '../components/CustomerFormModal';
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
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

interface CustomerStatistics {
  totalCustomers: number;
  activeCustomers: number;
  totalRevenue: number;
  averageRevenue: number;
  newThisMonth: number;
  topCustomers: Array<{
    id: string;
    name: string;
    revenue: number;
  }>;
  servicesDistribution: Array<{
    service_name: string;
    count: number;
  }>;
  cityDistribution: Array<{
    city: string;
    count: number;
  }>;
  revenueGrowth: number;
  workCompletionRate: number;
}

interface Filters {
  services: string[];
  cities: string[];
  states: string[];
  hasGST: boolean | null;
  minRevenue: string;
  maxRevenue: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statistics, setStatistics] = useState<CustomerStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const confirmation = useConfirmation();
  const toast = useToast();

  // Filter states
  const [filters, setFilters] = useState<Filters>({
    services: [],
    cities: [],
    states: [],
    hasGST: null,
    minRevenue: '',
    maxRevenue: '',
    dateFrom: '',
    dateTo: '',
    status: 'all',
  });

  // Available filter options
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      fetchCustomers();
      fetchStatistics();
      fetchFilterOptions();
    }
  }, [user]);

  useEffect(() => {
    // Save filters to localStorage
    localStorage.setItem('customerFilters', JSON.stringify(filters));
  }, [filters]);

  const fetchCustomers = async () => {
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.cities.length > 0) {
        query = query.in('city', filters.cities);
      }
      if (filters.states.length > 0) {
        query = query.in('state', filters.states);
      }
      if (filters.hasGST === true) {
        query = query.not('gstin', 'is', null);
      } else if (filters.hasGST === false) {
        query = query.is('gstin', null);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCustomers(data || []);
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

      // Fetch all required data
      const [customersRes, invoicesRes, worksRes, servicesRes] = await Promise.all([
        supabase.from('customers').select('id, created_at, city'),
        supabase.from('invoices').select('customer_id, total_amount, status'),
        supabase.from('works').select('customer_id, status'),
        supabase
          .from('customer_services')
          .select('customer_id, services(name)')
          .eq('status', 'active'),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (worksRes.error) throw worksRes.error;
      if (servicesRes.error) throw servicesRes.error;

      const customers = customersRes.data || [];
      const invoices = invoicesRes.data || [];
      const works = worksRes.data || [];
      const services = servicesRes.data || [];

      // Calculate statistics
      const totalRevenue = invoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const averageRevenue = customers.length > 0 ? totalRevenue / customers.length : 0;

      // New customers this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newThisMonth = customers.filter(
        (c) => new Date(c.created_at) >= startOfMonth
      ).length;

      // Top 5 customers by revenue
      const customerRevenue = new Map<string, number>();
      invoices
        .filter((inv) => inv.status === 'paid')
        .forEach((inv) => {
          const current = customerRevenue.get(inv.customer_id) || 0;
          customerRevenue.set(inv.customer_id, current + (inv.total_amount || 0));
        });

      const topCustomers = Array.from(customerRevenue.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, revenue]) => {
          const customer = customers.find((c) => c.id === id);
          return {
            id,
            name: customer ? customer.name : 'Unknown',
            revenue,
          };
        });

      // Services distribution
      const serviceCount = new Map<string, number>();
      services.forEach((s: any) => {
        const serviceName = s.services?.name || 'Unknown';
        serviceCount.set(serviceName, (serviceCount.get(serviceName) || 0) + 1);
      });

      const servicesDistribution = Array.from(serviceCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([service_name, count]) => ({ service_name, count }));

      // City distribution
      const cityCount = new Map<string, number>();
      customers.forEach((c: any) => {
        if (c.city) {
          cityCount.set(c.city, (cityCount.get(c.city) || 0) + 1);
        }
      });

      const cityDistribution = Array.from(cityCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([city, count]) => ({ city, count }));

      // Work completion rate
      const totalWorks = works.length;
      const completedWorks = works.filter((w) => w.status === 'completed').length;
      const workCompletionRate = totalWorks > 0 ? (completedWorks / totalWorks) * 100 : 0;

      // Calculate revenue growth (compare this month vs last month)
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const lastMonthRevenue = invoices
        .filter((inv) => {
          const invDate = new Date(inv.created_at);
          return invDate >= startOfLastMonth && invDate <= endOfLastMonth && inv.status === 'paid';
        })
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const thisMonthRevenue = invoices
        .filter((inv) => {
          const invDate = new Date(inv.created_at);
          return invDate >= startOfMonth && inv.status === 'paid';
        })
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const revenueGrowth =
        lastMonthRevenue > 0
          ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
          : 0;

      const stats: CustomerStatistics = {
        totalCustomers: customers.length,
        activeCustomers: customers.length, // You can add logic for active customers
        totalRevenue,
        averageRevenue,
        newThisMonth,
        topCustomers,
        servicesDistribution,
        cityDistribution,
        revenueGrowth,
        workCompletionRate,
      };

      setStatistics(stats);
    } catch (error) {
      console.error('Error fetching statistics:', error);
      toast.error('Failed to fetch statistics');
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      // Fetch available services
      const { data: servicesData } = await supabase
        .from('services')
        .select('id, name')
        .eq('user_id', user?.id)
        .order('name');

      setAvailableServices(servicesData || []);

      // Fetch unique cities and states
      const { data: customersData } = await supabase
        .from('customers')
        .select('city, state')
        .eq('user_id', user?.id);

      const cities = new Set<string>();
      const states = new Set<string>();

      customersData?.forEach((c) => {
        if (c.city) cities.add(c.city);
        if (c.state) states.add(c.state);
      });

      setAvailableCities(Array.from(cities).sort());
      setAvailableStates(Array.from(states).sort());
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
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

  const clearAllFilters = () => {
    setFilters({
      services: [],
      cities: [],
      states: [],
      hasGST: null,
      minRevenue: '',
      maxRevenue: '',
      dateFrom: '',
      dateTo: '',
      status: 'all',
    });
    fetchCustomers();
  };

const activeFilterCount = 
  filters.services.length +
  filters.cities.length +
  filters.states.length +
  (filters.hasGST !== null ? 1 : 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
              <p className="text-gray-600 mt-1">Manage your customer relationships</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                  showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700'
                }`}
              >
                <Filter size={18} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
              >
                <Plus size={20} />
                Add Customer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      {!loadingStats && statistics && (
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Customers</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.totalCustomers}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <Users className="text-blue-600" size={24} />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp size={16} className="text-green-500" />
                <span className="text-sm text-green-600">{statistics.newThisMonth} new this month</span>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{statistics.totalRevenue.toLocaleString()}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <DollarSign className="text-green-600" size={24} />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Activity size={16} className={statistics.revenueGrowth >= 0 ? "text-green-500" : "text-red-500"} />
                <span className={`text-sm ${statistics.revenueGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {statistics.revenueGrowth >= 0 ? "+" : ""}{statistics.revenueGrowth.toFixed(1)}% from last month
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg. Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{statistics.averageRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="bg-purple-100 p-3 rounded-full">
                  <Briefcase className="text-purple-600" size={24} />
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">Per customer</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statistics.workCompletionRate.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-orange-100 p-3 rounded-full">
                  <CheckCircle className="text-orange-600" size={24} />
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">Work completion</p>
            </div>
          </div>

          {/* Top Customers & Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Customers */}
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <h3 className="font-semibold text-gray-900 mb-4">Top Customers</h3>
              <div className="space-y-3">
                {statistics.topCustomers.map((customer, index) => (
                  <div key={customer.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-blue-600">{index + 1}</span>
                      </div>
                      <span className="font-medium text-gray-900">{customer.name}</span>
                    </div>
                    <span className="font-semibold text-green-600">
                      ₹{customer.revenue.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Services Distribution */}
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <h3 className="font-semibold text-gray-900 mb-4">Popular Services</h3>
              <div className="space-y-3">
                {statistics.servicesDistribution.map((service, index) => (
                  <div key={service.service_name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Tag size={16} className="text-gray-400" />
                      <span className="text-gray-700">{service.service_name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{service.count} customers</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      {showFilters && (
        <div className="bg-white border-b shadow-sm px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Filters</h3>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setShowFilters(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Services Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Services</label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {availableServices.map((service) => (
                  <div key={service.id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`service-${service.id}`}
                      checked={filters.services.includes(service.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            services: [...prev.services, service.id]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            services: prev.services.filter(id => id !== service.id)
                          }));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`service-${service.id}`} className="ml-2 text-sm text-gray-700">
                      {service.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Cities Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cities</label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {availableCities.map((city) => (
                  <div key={city} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`city-${city}`}
                      checked={filters.cities.includes(city)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            cities: [...prev.cities, city]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            cities: prev.cities.filter(c => c !== city)
                          }));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`city-${city}`} className="ml-2 text-sm text-gray-700">
                      {city}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* GST Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST Status</label>
              <div className="space-y-2">
                {[
                  { value: true, label: 'Has GST' },
                  { value: false, label: 'No GST' },
                ].map((option) => (
                  <div key={String(option.value)} className="flex items-center">
                    <input
                      type="radio"
                      id={`gst-${option.value}`}
                      name="gstStatus"
                      checked={filters.hasGST === option.value}
                      onChange={() => setFilters(prev => ({
                        ...prev,
                        hasGST: option.value
                      }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`gst-${option.value}`} className="ml-2 text-sm text-gray-700">
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  placeholder="From date"
                />
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  placeholder="To date"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={fetchCustomers}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search customers by name, email, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Customers List */}
      <div className="px-6 pb-6">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto text-gray-400" size={48} />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No customers found</h3>
            <p className="mt-2 text-gray-600">Get started by adding your first customer.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Add Customer
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {customers
              .filter(customer =>
                customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {customer.image_url ? (
                          <img
                            src={customer.image_url}
                            alt={customer.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <UserCog className="text-blue-600" size={24} />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                          <div className="flex items-center gap-4 mt-1">
                            {customer.email && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Mail size={14} />
                                <span>{customer.email}</span>
                              </div>
                            )}
                            {customer.phone && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Phone size={14} />
                                <span>{customer.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {customer.gstin && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            GST Registered
                          </span>
                        )}
                        <button
                          onClick={(e) => handleDelete(customer.id, e)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    {(customer.company_name || customer.city) && (
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                        {customer.company_name && (
                          <div className="flex items-center gap-1">
                            <Building size={14} />
                            <span>{customer.company_name}</span>
                          </div>
                        )}
                        {customer.city && (
                          <div className="flex items-center gap-1">
                            <MapPin size={14} />
                            <span>
                              {customer.city}
                              {customer.state && `, ${customer.state}`}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <CustomerFormModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {selectedCustomerId && (
        <CustomerDetails
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={fetchCustomers}
        />
      )}
    </div>
  );
}