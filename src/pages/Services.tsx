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
  Tag,
  Edit2
} from 'lucide-react';
import ServiceDetails from '../components/ServiceDetails';
import AddServiceModal from '../components/AddServiceModal';
import ServiceFilters from '../components/ServiceFilters';
import ServiceCategoryManager from '../components/ServiceCategoryManager';
import CustomerDetails from '../components/CustomerDetails';
import WorkDetails from '../components/works/WorkDetailsMain';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';


interface Service {
  id: string;
  name: string;
  service_code: string | null;
  category: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  description: string | null;
  image_url: string | null;
  is_recurring: boolean;
  recurrence_type: string | null;
  default_price: number | null;
  estimated_duration_value: number | null;
  estimated_duration_unit: string | null;
  recurrence_start_date: string | null;
  custom_fields: any;
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
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  const [filters, setFilters] = useState({
    category_id: '',
    subcategory_id: '',
    status: '',
    is_recurring: '',
  });

useEffect(() => {
  const navigationState = sessionStorage.getItem('searchNavigationState');
  if (navigationState) {
    try {
      const state = JSON.parse(navigationState);
      if (state.itemType === 'service' && state.shouldShowDetails) {
        setSelectedServiceId(state.selectedId);
        setShowDetailsModal(true);
        sessionStorage.removeItem('searchNavigationState');
      }
    } catch (error) {
      console.error('Error reading navigation state:', error);
    }
  }
}, []);


  useEffect(() => {
    if (user) {
      fetchServices();
    }

    const prefilledCustomerId = sessionStorage.getItem('prefilledCustomerId');
    if (prefilledCustomerId) {
      setSelectedCustomerId(prefilledCustomerId);
      setShowModal(true);
      sessionStorage.removeItem('prefilledCustomerId');
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

    if (filters.category_id) {
      filtered = filtered.filter(service => service.category_id === filters.category_id);
    }

    if (filters.subcategory_id) {
      filtered = filtered.filter(service => service.subcategory_id === filters.subcategory_id);
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
      showConfirmation({
        title: 'Delete Service',
        message: 'Are you sure you want to delete this service? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'red',
        onConfirm: async () => {
          try {
            const { error } = await supabase.from('services').delete().eq('id', id);
            if (error) throw error;
            fetchServices();
            toast.success('Service deleted successfully');
          } catch (error) {
            console.error('Error deleting service:', error);
            toast.error('Failed to delete service');
          }
        }
      });
    };

  const activeFilterCount = [filters.category_id, filters.status, filters.is_recurring].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Services</h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            title="Filters"
          >
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowCategoryManager(true)}
            className="flex items-center justify-center p-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all"
            title="Manage Categories"
          >
            <Tag className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
            title="Add Service"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-3 sm:p-4">
          <ServiceFilters
            filters={filters}
            onFilterChange={setFilters}
            onClose={() => setShowFilters(false)}
          />
        </div>
      )}

      <div className="sm:hidden bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {filteredServices.map((service) => (
          <div
            key={service.id}
            onClick={() => {
              setSelectedServiceId(service.id);
              setShowDetailsModal(true);
            }}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all cursor-pointer hover:shadow-md"
          >
            <div className="p-3 sm:p-4">
              <div className="flex items-center gap-3 justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {service.image_url ? (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-700">
                      <img
                        src={service.image_url}
                        alt={service.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center"><svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div>`;
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base truncate" title={service.name}>
                        {service.name}
                      </h3>
                      {service.category && (
                        <span className="text-xs text-gray-600 dark:text-slate-400 px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded whitespace-nowrap">
                          {service.category}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                        service.status === 'active'
                          ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
                          : 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700'
                      }`}>
                        {service.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {service.is_recurring && (
                        <span className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 gap-1">
                          <Calendar className="w-3 h-3" />
                          {service.recurrence_type}
                        </span>
                      )}
                      {service.default_price && (
                        <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400 gap-1 font-medium">
                          <DollarSign className="w-3 h-3" />
                          ₹{service.default_price.toLocaleString('en-IN')}
                          {service.is_recurring && service.recurrence_type && (
                            <span className="text-xs text-gray-500">/{service.recurrence_type}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 line-clamp-1">{service.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingService(service);
                      setShowModal(true);
                    }}
                    className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors flex-shrink-0"
                    title="Edit service"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(service.id);
                    }}
                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                    title="Delete service"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
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
          service={editingService}
          onClose={() => {
            setShowModal(false);
            setEditingService(null);
          }}
          onSuccess={() => {
            fetchServices();
            setShowModal(false);
            setEditingService(null);
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
              setEditingService(serviceToEdit);
              setShowDetailsModal(false);
              setShowModal(true);
            }
          }}
          onNavigateToCustomer={(customerId) => {
            setShowDetailsModal(false);
            setSelectedServiceId(null);
            setSelectedCustomerId(customerId);
          }}
          onNavigateToWork={(workId) => {
            setShowDetailsModal(false);
            setSelectedServiceId(null);
            setSelectedWorkId(workId);
          }}
        />
      )}

      {selectedCustomerId && (
        <CustomerDetails
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={fetchServices}
          onNavigateToService={(serviceId) => {
            setSelectedCustomerId(null);
            setSelectedServiceId(serviceId);
            setShowDetailsModal(true);
          }}
          onNavigateToWork={(workId) => {
            setSelectedCustomerId(null);
            setSelectedWorkId(workId);
          }}
        />
      )}

      {selectedWorkId && (
        <WorkDetails
          workId={selectedWorkId}
          onClose={() => setSelectedWorkId(null)}
          onUpdate={fetchServices}
        />
      )}

      {showCategoryManager && (
        <ServiceCategoryManager
          onClose={() => setShowCategoryManager(false)}
          onCategoryUpdate={fetchServices}
        />
      )}

    </div>
  );
}
