// src/components/AddLeadModal.tsx - Simplified Version
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, UserPlus, Plus } from 'lucide-react';

interface Service {
  id: string;
  name: string;
}

interface AddLeadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddLeadModal({ onClose, onSuccess }: AddLeadModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Minimal form data for quick lead capture
  const [formData, setFormData] = useState({
    name: '',           // Lead/Company Name (Required)
    phone: '',          // Primary Phone (Main contact)
    email: '',          // Email (Optional)
    source: '',         // Lead Source (Optional)
    notes: '',          // Brief Notes (Optional)
    status: 'new',      // Default status
  });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('user_id', user?.id)
        .order('name');

      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      console.error('Error fetching services:', error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Insert lead with minimal data
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert({
          ...formData,
          user_id: user?.id,
        })
        .select()
        .single();

      if (leadError) throw leadError;

      // Insert lead services if any selected
      if (selectedServices.length > 0) {
        const leadServices = selectedServices.map((serviceId) => ({
          lead_id: leadData.id,
          service_id: serviceId,
          user_id: user?.id,
        }));

        const { error: servicesError } = await supabase
          .from('lead_services')
          .insert(leadServices);

        if (servicesError) throw servicesError;
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error creating lead:', error.message);
      alert('Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <UserPlus size={28} />
            Add New Lead
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Lead Name - Required */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lead Name / Company Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ABC Company or John Doe"
              />
            </div>

            {/* Phone - Primary Contact */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+91 98765 43210"
              />
            </div>

            {/* Email - Optional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="email@example.com"
              />
            </div>

            {/* Source - Optional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lead Source
              </label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Website, Referral, Cold Call, etc."
              />
            </div>

            {/* Interested Services - Optional */}
            {services.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Interested Services (Optional)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-500 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedServices.includes(service.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedServices([...selectedServices, service.id]);
                          } else {
                            setSelectedServices(
                              selectedServices.filter((id) => id !== service.id)
                            );
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {service.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Notes - Optional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brief Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Any additional information..."
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
          >
            {loading ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
