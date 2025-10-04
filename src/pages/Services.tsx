// COMPLETE UPDATED Services.tsx with X import fix + Statistics

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, 
  X, // <- ADD THIS IMPORT
  CreditCard as Edit2, 
  Trash2, 
  Briefcase, 
  Calendar, 
  DollarSign, 
  Eye,
  TrendingUp,
  CheckCircle 
} from 'lucide-react';
import ServiceDetails from '../components/ServiceDetails';

interface Service {
  id: string;
  name: string;
  description: string | null;
  is_recurring: boolean;
  recurrence_type: string | null;
  default_price: number | null;
}

export default function Services() {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_recurring: false,
    recurrence_type: 'monthly',
    default_price: '',
  });

  useEffect(() => {
    if (user) {
      fetchServices();
    }
  }, [user]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const serviceData = {
        user_id: user!.id,
        name: formData.name,
        description: formData.description || null,
        is_recurring: formData.is_recurring,
        recurrence_type: formData.is_recurring ? formData.recurrence_type : null,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
        updated_at: new Date().toISOString(),
      };

      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert(serviceData);
        if (error) throw error;
      }

      setShowModal(false);
      setEditingService(null);
      resetForm();
      fetchServices();
    } catch (error) {
      console.error('Error saving service:', error);
    }
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || '',
      is_recurring: service.is_recurring,
      recurrence_type: service.recurrence_type || 'monthly',
      default_price: service.default_price?.toString() || '',
    });
    setShowModal(true);
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

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      is_recurring: false,
      recurrence_type: 'monthly',
      default_price: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingService(null);
    resetForm();
  };

  // Calculate statistics
  const stats = {
    total: services.length,
    recurring: services.filter(s => s.is_recurring).length,
    oneTime: services.filter(s => !s.is_recurring).length,
    avgPrice: services.length > 0 
      ? services.reduce((sum, s) => sum + (s.default_price || 0), 0) / services.length 
      : 0,
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
          <p className="text-gray-600 mt-1">Manage your business services and offerings</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Service</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">Total Services</p>
          </div>
          <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">Recurring</p>
          </div>
          <p className="text-3xl font-bold text-green-600">{stats.recurring}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">One-Time</p>
          </div>
          <p className="text-3xl font-bold text-orange-600">{stats.oneTime}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-teal-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-teal-600" />
            </div>
            <p className="text-sm font-medium text-gray-600">Avg Price</p>
          </div>
          <p className="text-3xl font-bold text-teal-600">₹{stats.avgPrice.toFixed(0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <div
            key={service.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.02] flex flex-col"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Briefcase className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{service.name}</h3>
                  {service.is_recurring && (
                    <span className="inline-flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full mt-1">
                      <Calendar className="w-3 h-3 mr-1" />
                      {service.recurrence_type}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Description - flex-grow */}
            <div className="flex-grow mb-4">
              {service.description && (
                <p className="text-sm text-gray-600 line-clamp-3 mb-3">{service.description}</p>
              )}

              {service.default_price && (
                <div className="flex items-center text-base font-semibold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                  <DollarSign className="w-5 h-5 mr-1" />
                  <span>₹{service.default_price.toLocaleString('en-IN')}</span>
                  {service.is_recurring && service.recurrence_type && (
                    <span className="text-xs text-blue-500 ml-1">/{service.recurrence_type}</span>
                  )}
                </div>
              )}
            </div>

            {/* Buttons - fixed at bottom */}
            <div className="flex space-x-2 pt-4 border-t border-gray-100 mt-auto">
              <button
                onClick={() => {
                  setSelectedServiceId(service.id);
                  setShowDetailsModal(true);
                }}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium"
              >
                <Eye className="w-4 h-4" />
                <span>View Details</span>
              </button>
              <button
                onClick={() => handleDelete(service.id)}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {services.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No services yet</h3>
            <p className="text-gray-600 mb-4">Get started by creating your first service</p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Service</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Briefcase size={28} />
                {editingService ? 'Edit Service' : 'Add New Service'}
              </h2>
              <button
                onClick={closeModal}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Service Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., VAT Filing, Bookkeeping"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Brief description of the service"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.default_price}
                  onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_recurring"
                  checked={formData.is_recurring}
                  onChange={(e) =>
                    setFormData({ ...formData, is_recurring: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_recurring" className="text-sm font-medium text-gray-700">
                  Recurring Service
                </label>
              </div>

              {formData.is_recurring && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recurrence Type
                  </label>
                  <select
                    value={formData.recurrence_type}
                    onChange={(e) =>
                      setFormData({ ...formData, recurrence_type: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half-yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              )}
            </form>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all font-medium shadow-lg"
              >
                {editingService ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
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
              handleEdit(serviceToEdit);
            }
          }}
        />
      )}
    </div>
  );
}
