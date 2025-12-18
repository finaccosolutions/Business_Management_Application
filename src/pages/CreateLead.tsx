import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface Service {
    id: string;
    name: string;
}

interface CreateLeadProps {
    onNavigate: (page: string, params?: any) => void;
    editLeadId?: string;
}

export default function CreateLead({ onNavigate, editLeadId }: CreateLeadProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const { showToast } = useToast();

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        source: '',
        referred_by: '',
        notes: '',
        status: 'new',
        company_name: '',
    });

    useEffect(() => {
        fetchServices();
        if (editLeadId) {
            setIsEditing(true);
            loadLeadForEdit(editLeadId);
        }
    }, [editLeadId]);

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

    const loadLeadForEdit = async (id: string) => {
        setLoading(true);
        try {
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select(`
                    *,
                    lead_services (
                        service_id
                    )
                `)
                .eq('id', id)
                .single();

            if (leadError) throw leadError;

            if (lead) {
                setFormData({
                    name: lead.name,
                    phone: lead.phone || '',
                    email: lead.email || '',
                    source: lead.source || '',
                    referred_by: lead.referred_by || '',
                    notes: lead.notes || '',
                    status: lead.status || 'new',
                    company_name: lead.company_name || '',
                });

                if (lead.lead_services) {
                    setSelectedServices(lead.lead_services.map((ls: any) => ls.service_id));
                }
            }
        } catch (error) {
            console.error('Error loading lead:', error);
            showToast('Failed to load lead details', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let leadId = editLeadId;

            if (isEditing && editLeadId) {
                // Update existing lead
                const { error: updateError } = await supabase
                    .from('leads')
                    .update({
                        ...formData,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', editLeadId);

                if (updateError) throw updateError;
                showToast('Lead updated successfully', 'success');

                // Update services - First delete existing, then re-insert
                const { error: deleteServicesError } = await supabase
                    .from('lead_services')
                    .delete()
                    .eq('lead_id', editLeadId);

                if (deleteServicesError) throw deleteServicesError;

            } else {
                // Create new lead
                const { data: leadData, error: leadError } = await supabase
                    .from('leads')
                    .insert({
                        ...formData,
                        user_id: user?.id,
                    })
                    .select()
                    .single();

                if (leadError) throw leadError;
                leadId = leadData.id;
                showToast('Lead created successfully', 'success');
            }

            // Insert services (for both create and update)
            if (leadId && selectedServices.length > 0) {
                const leadServices = selectedServices.map((serviceId) => ({
                    lead_id: leadId,
                    service_id: serviceId,
                    user_id: user?.id,
                }));

                const { error: servicesError } = await supabase
                    .from('lead_services')
                    .insert(leadServices);

                if (servicesError) throw servicesError;
            }

            onNavigate('leads');
        } catch (error: any) {
            console.error('Error saving lead:', error.message);
            showToast('Failed to save lead', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => onNavigate('leads')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <UserPlus className="w-8 h-8 text-blue-600" />
                    {isEditing ? 'Edit Lead' : 'Add New Lead'}
                </h1>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Lead Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="John Doe"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Company Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.company_name}
                                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="ABC Company"
                                />
                            </div>

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
                        </div>

                        <div className="space-y-6">
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

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Referred By
                                </label>
                                <input
                                    type="text"
                                    value={formData.referred_by}
                                    onChange={(e) => setFormData({ ...formData, referred_by: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Name of person who referred this lead"
                                />
                            </div>

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

                            {isEditing && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="new">New</option>
                                        <option value="contacted">Contacted</option>
                                        <option value="qualified">Qualified</option>
                                        <option value="proposal">Proposal</option>
                                        <option value="negotiation">Negotiation</option>
                                        <option value="lost">Lost</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {services.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-gray-100">
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Interested Services (Optional)
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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

                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => onNavigate('leads')}
                            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
                        >
                            {loading ? 'Saving...' : (isEditing ? 'Update Lead' : 'Create Lead')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
