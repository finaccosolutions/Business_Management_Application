import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Briefcase,
  Calendar,
  DollarSign,
  Eye,
  TrendingUp,
  CheckCircle,
  Clock,
  Tag
} from 'lucide-react';
import ServiceDetails from '../components/ServiceDetails';
import AddServiceModal from '../components/AddServiceModal';
import ServiceFilters from '../components/ServiceFilters';

interface Service {
  id: string;
  name: string;
  service_code: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  is_recurring: boolean;
  recurrence_type: string | null;
  default_price: number | null;
  status: string;
}

export default function Services() {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    is_recurring: '',
  });

  useEffect(() => {
    if (user) {
      fetchServices();
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [services, searchQuery, filters]);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...services];

    if (searchQuery) {
      filtered = filtered.filter(service =>
        service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.service_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.category?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filters.category) {
      filtered = filtered.filter(service => service.category === filters.category);
    }

    if (filters.status) {
      filtered = filtered.filter(service => service.status === filters.status);
    }

    if (filters.is_recurring) {
      const isRecurring = filters.is_recurring === 'true';
      filtered = filtered.filter(service => service.is_recurring === isRecurring);
    }

    setFilteredServices(filtered);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) throw error;
      fetchServices();
    } catch (error) {
      console.error('Error deleting service:', error);
    }
  };

  const stats = {
    total: services.length,
    recurring: services.filter(s => s.is_recurring).length,
    oneTime: services.filter(s => !s.is_recurring).length,
    active: services.filter(s => s.status === 'active').length,
    avgPrice: services.length > 0
      ? services.reduce((sum, s) => sum + (s.default_price || 0), 0) / services.length
      : 0,
  };

  const activeFilterCount = [filters.category, filters.status, filters.is_recurring].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Services</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">Manage your business services and offerings</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Service</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-blue-200 dark:border-blue-900 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Services</p>
          </div>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-green-200 dark:border-green-900 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
              <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Recurring</p>
          </div>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.recurring}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-orange-200 dark:border-orange-900 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">One-Time</p>
          </div>
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.oneTime}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-emerald-200 dark:border-emerald-900 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Active</p>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-teal-200 dark:border-teal-900 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-teal-50 dark:bg-teal-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Avg Price</p>
          </div>
          <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">₹{stats.avgPrice.toFixed(0)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search services by name, code, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
        </div>
        <button
          onClick={() => setShowFilters(true)}
          className="relative flex items-center space-x-2 px-6 py-3 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium"
        >
          <Filter className="w-5 h-5" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((service) => (
          <div
            key={service.id}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.02] flex flex-col"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3 flex-1">
                {service.image_url ? (
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-700">
                    <img
                      src={service.image_url}
                      alt={service.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center"><svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div>`;
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <Briefcase className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">{service.name}</h3>
                  {service.service_code && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Code: {service.service_code}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {service.is_recurring && (
                      <span className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                        <Calendar className="w-3 h-3 mr-1" />
                        {service.recurrence_type}
                      </span>
                    )}
                    {service.category && (
                      <span className="inline-flex items-center text-xs text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full">
                        <Tag className="w-3 h-3 mr-1" />
                        {service.category}
                      </span>
                    )}
                    <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                      service.status === 'active'
                        ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
                        : 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700'
                    }`}>
                      {service.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-grow mb-4">
              {service.description && (
                <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2 mb-3">{service.description}</p>
              )}

              {service.default_price && (
                <div className="flex items-center text-base font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-lg">
                  <DollarSign className="w-5 h-5 mr-1" />
                  <span>₹{service.default_price.toLocaleString('en-IN')}</span>
                  {service.is_recurring && service.recurrence_type && (
                    <span className="text-xs text-blue-500 dark:text-blue-400 ml-1">/{service.recurrence_type}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-slate-700 mt-auto">
              <button
                onClick={() => {
                  setSelectedServiceId(service.id);
                  setShowDetailsModal(true);
                }}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
              >
                <Eye className="w-4 h-4" />
                <span>View Details</span>
              </button>
              <button
                onClick={() => handleDelete(service.id)}
                className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {filteredServices.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Briefcase className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {searchQuery || activeFilterCount > 0 ? 'No services found' : 'No services yet'}
            </h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              {searchQuery || activeFilterCount > 0
                ? 'Try adjusting your search or filters'
                : 'Get started by creating your first service'}
            </p>
            {!searchQuery && activeFilterCount === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Service</span>
              </button>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <AddServiceModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            fetchServices();
            setShowModal(false);
          }}
        />
      )}

      {showDetailsModal && selectedServiceId && (
        <ServiceDetails
          serviceId={selectedServiceId}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedServiceId(null);
          }}
          onEdit={() => {
            const serviceToEdit = services.find(s => s.id === selectedServiceId);
            if (serviceToEdit) {
              setShowDetailsModal(false);
              setShowModal(true);
            }
          }}
        />
      )}

      {showFilters && (
        <ServiceFilters
          filters={filters}
          onFilterChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
