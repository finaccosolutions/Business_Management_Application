// src/components/ConvertLeadModal.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import CustomerFormModal from './CustomerFormModal';
import { UserPlus, Briefcase, Users } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  image_url: string;
  contact_person: string;
  designation: string;
  alternate_phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  notes: string;
  lead_services?: { service_id: string; services: { id: string; name: string } }[];
}

interface ConvertLeadModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

interface Service {
  id: string;
  name: string;
}

interface Staff {
  id: string;
  name: string;
}

export default function ConvertLeadModal({
  lead,
  onClose,
  onSuccess,
}: ConvertLeadModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'customer' | 'work'>('customer');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [createWork, setCreateWork] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [workData, setWorkData] = useState({
    service_id: '',
    assigned_to: '',
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
  });

  useEffect(() => {
    fetchServices();
    fetchStaff();
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

      // Pre-select service if lead has one
      if (lead.lead_services && lead.lead_services.length > 0) {
        setWorkData({
          ...workData,
          service_id: lead.lead_services[0].service_id,
        });
      }
    } catch (error: any) {
      console.error('Error fetching services:', error.message);
    }
  };

  const fetchStaff = async () => {
    try {
      // Fetch from staff table or profiles
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setStaff(data || []);
    } catch (error: any) {
      console.error('Error fetching staff:', error.message);
    }
  };

    useEffect(() => {
      if (lead.lead_services && lead.lead_services.length > 0) {
        setWorkData({
          ...workData,
          service_id: lead.lead_services[0].service_id,
          title: `Work for ${lead.name} - ${lead.lead_services[0].services.name}`,
          description: lead.notes || '',
        });
      }
    }, [lead]);

    // Update the handleCustomerCreated function to NOT delete the lead
    const handleCustomerCreated = async (newCustomerId: string) => {
      setCustomerId(newCustomerId);
    
      try {
        // Mark lead as converted instead of deleting
        await supabase
          .from('leads')
          .update({
            converted_to_customer_id: newCustomerId,
            converted_at: new Date().toISOString(),
            status: 'converted',
          })
          .eq('id', lead.id);
    
        // Copy lead services to customer services
        if (lead.lead_services && lead.lead_services.length > 0) {
          const customerServices = lead.lead_services.map((ls: any) => ({
            customer_id: newCustomerId,
            service_id: ls.service_id,
            user_id: user?.id,
            status: 'active',
            price: 0,
          }));
    
          await supabase.from('customer_services').insert(customerServices);
        }
    
        if (createWork) {
          setStep('work');
        } else {
          toast.success('Lead successfully converted to customer!');
          onSuccess();
        }
      } catch (error: any) {
        console.error('Error converting lead:', error.message);
        toast.error(`Failed to convert lead: ${error.message}`);
      }
    };
    
    // Update handleWorkCreation to NOT delete lead
    const handleWorkCreation = async (e: React.FormEvent) => {
      e.preventDefault();
    
      if (!customerId) return;
    
      try {
        const { error } = await supabase.from('works').insert({
          user_id: user?.id,
          customer_id: customerId,
          service_id: workData.service_id,
          assigned_to: workData.assigned_to || null,
          title: workData.title,
          description: workData.description || null,
          priority: workData.priority,
          due_date: workData.due_date || null,
          status: 'pending',
        });
    
        if (error) throw error;
    
        // Don't delete the lead - it's already marked as converted
        toast.success('Lead converted to customer and work created successfully!');
        onSuccess();
      } catch (error: any) {
        console.error('Error creating work:', error.message);
        toast.error('Failed to create work');
      }
    };

  if (step === 'work') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-orange-700">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Briefcase size={28} />
              Create Work for {lead.name}
            </h2>
          </div>

          <form onSubmit={handleWorkCreation} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Work Title *
              </label>
              <input
                type="text"
                required
                value={workData.title}
                onChange={(e) => setWorkData({ ...workData, title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Enter work title"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Service *
                </label>
                <select
                  required
                  value={workData.service_id}
                  onChange={(e) => setWorkData({ ...workData, service_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">Select service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Staff
                </label>
                <div className="relative">
                  <Users
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <select
                    value={workData.assigned_to}
                    onChange={(e) => setWorkData({ ...workData, assigned_to: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Not assigned</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={workData.priority}
                  onChange={(e) => setWorkData({ ...workData, priority: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date
                </label>
                <input
                  type="date"
                  value={workData.due_date}
                  onChange={(e) => setWorkData({ ...workData, due_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={workData.description}
                onChange={(e) => setWorkData({ ...workData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Work description..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setStep('customer');
                  setCreateWork(false);
                }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Back
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all font-medium shadow-lg"
              >
                Create Work & Complete Conversion
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Customer creation step with option to create work
  const initialCustomerData = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company_name: lead.company_name,
    image_url: lead.image_url,
    contact_person: lead.contact_person,
    designation: lead.designation,
    alternate_phone: lead.alternate_phone,
    website: lead.website,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    pincode: lead.pincode,
    country: lead.country || 'IN',
    notes: lead.notes,
  };

  return (
    <div className="relative">
      {/* Work Creation Checkbox Overlay */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute top-24 right-8 bg-white rounded-lg shadow-lg p-4 border-2 border-orange-500 pointer-events-auto">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={createWork}
              onChange={(e) => setCreateWork(e.target.checked)}
              className="w-5 h-5 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex items-center gap-2">
              <Briefcase size={20} className="text-orange-600" />
              <span className="font-medium text-gray-900">
                Create work after conversion
              </span>
            </div>
          </label>
          <p className="text-xs text-gray-500 mt-2 ml-8">
            Automatically create a work assignment for this customer
          </p>
        </div>
      </div>

      <CustomerFormModal
        onClose={onClose}
        onSuccess={handleCustomerCreated}
        initialData={initialCustomerData}
        mode="create"
        title={`Convert Lead to Customer: ${lead.name}`}
      />
    </div>
  );
}