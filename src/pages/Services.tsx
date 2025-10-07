// src/pages/Services.tsx (Enhanced Version)
import { useEffect, useState } from 'react';
import { Bolt Database } from '../lib/Bolt Database';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  DollarSign,
  Calendar,
  Clock,
  Tag,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import AddServiceModal from '../components/AddServiceModal';
import ServiceDetails from '../components/ServiceDetails';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../contexts/ToastContext';

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  tax_percentage: number;
  is_recurring: boolean;
  recurring_interval: string | null;
  is_active: boolean;
  created_at: string;
}

export default function Services() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  useEffect(() => {
    if (user) {
      fetchServices();
    }
  }, [user]);

  useEffect(() => {
    filterServices();
  }, [searchTerm, services]);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const { data, error } = await Bolt Database
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      showToast('Failed to fetch services', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filterServices = () => {
    if (!searchTerm.trim()) {
      setFilteredServices(services);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = services.filter(
      (service) =>
        service.name.toLowerCase().includes(term) ||
        (service.description && service.description.toLowerCase().includes(term))
    );
    setFilteredServices(filtered);
  };

  const handleDelete = async () => {
    if (!serviceToDelete) return;

    try {
      const { error } = await Bolt Database
        .from('services')
        .delete()
        .eq('id', serviceToDelete.id);

      if (error) throw error;

      showToast('Service deleted successfully', 'success');
      fetchServices();
      setShowDeleteModal(false);
      setServiceToDelete(null);
    } catch (error) {
      console.error('Error deleting service:', error);
      showToast('Failed to delete service', 'error');
    }
  };

  const handleEdit = (service: Service, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedService(service);
    setShowFormModal(true);
  };

  const handleViewDetails = (service: Service) => {
    setSelectedService(service);
    setShowDetailsModal(true);
  };

  const handleCardClick = (service: Service) => {
    handleViewDetails(service);
  };

  const confirmDelete = (service: Service, e: React.MouseEvent) => {
    e.stopPropagation();
    setServiceToDelete(service);
    setShowDeleteModal(true);
  };

  const getRecurringLabel = (interval: string | null) => {
    if (!interval) return '';
    const labels: { [key: string]: string } = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
    };
    return labels[interval] || interval;
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Services</h1>
          <p className="text-gray-600 mt-1">Manage your service offerings</p>
        </div>
        <button
          onClick={() => {
            setSelectedService(null);
            setShowFormModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Service
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search services by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((service) => (
          <div
            key={service.id}
            onClick={() => handleCardClick(service)}
            className="bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-xl transition-all cursor-pointer overflow-hidden group"
          >
            {/* Header with Service Name */}
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-4 text-white">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate">{service.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {service.is_recurring ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
                        <RefreshCw className="w-3 h-3" />
                        {getRecurringLabel(service.recurring_interval)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
                        <Clock className="w-3 h-3" />
                        One-time
                      </span>
                    )}
                  </div>
                </div>
                {service.is_active ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 flex-shrink-0" />
                )}
              </div>
            </div>

            {/* Service Details */}
            <div className="p-4 space-y-3">
              {/* Description */}
              {service.description && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Description</p>
                  <p className="text-sm text-gray-700 line-clamp-2">{service.description}</p>
                </div>
              )}

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <p className="text-xs text-gray-600 font-medium">Price</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    ₹{service.price.toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-blue-600" />
                    <p className="text-xs text-gray-600 font-medium">Tax</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{service.tax_percentage}%</p>
                </div>
              </div>

              {/* Total with Tax */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-600 font-medium mb-1">Total (with tax)</p>
                <p className="text-xl font-bold text-gray-900">
                  ₹{(service.price + (service.price * service.tax_percentage) / 100).toLocaleString('en-IN')}
                </p>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                    service.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {service.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Created Date */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar className="w-3 h-3" />
                Created: {new Date(service.created_at).toLocaleDateString()}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-gray-200 p-3 bg-gray-50">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => handleEdit(service, e)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={(e) => confirmDelete(service, e)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredServices.length === 0 && (
        <div className="text-center py-12">
          <Tag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            {searchTerm ? 'No services found matching your search' : 'No services yet'}
          </p>
        </div>
      )}

      {showFormModal && (
        <AddServiceModal
          service={selectedService}
          onClose={() => {
            setShowFormModal(false);
            setSelectedService(null);
          }}
          onSuccess={() => {
            fetchServices();
            setShowFormModal(false);
            setSelectedService(null);
          }}
        />
      )}

      {showDetailsModal && selectedService && (
        <ServiceDetails
          serviceId={selectedService.id}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedService(null);
          }}
          onEdit={() => {
            setShowDetailsModal(false);
            setShowFormModal(true);
          }}
        />
      )}

      {showDeleteModal && (
        <ConfirmationModal
          title="Delete Service"
          message={`Are you sure you want to delete "${serviceToDelete?.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          confirmStyle="danger"
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDeleteModal(false);
            setServiceToDelete(null);
          }}
        />
      )}
    </div>
  );
}
