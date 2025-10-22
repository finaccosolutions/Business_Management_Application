// src/components/ConvertLeadModal.tsx - ENHANCED VERSION
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import CustomerFormModal from './CustomerFormModal';
import { UserPlus, Briefcase, Users, CheckCircle, AlertCircle } from 'lucide-react';

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

interface WorkToCreate {
  service_id: string;
  service_name: string;
  title: string;
  description: string;
  priority: string;
  due_date: string;
  assigned_to: string;
}

export default function ConvertLeadModal({
  lead,
  onClose,
  onSuccess,
}: ConvertLeadModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<'customer' | 'works' | 'summary'>('customer');
  const [customerId, setCustomerId] = useState<string | null>(null);
  
  // DEFAULT TO TRUE - Auto-create works for all services
  const [createWork, setCreateWork] = useState(true);
  
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [worksToCreate, setWorksToCreate] = useState<WorkToCreate[]>([]);
  const [createdWorks, setCreatedWorks] = useState<any[]>([]);
  const [isCreatingWorks, setIsCreatingWorks] = useState(false);

  useEffect(() => {
    fetchServices();
    fetchStaff();
    initializeWorks();
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

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_members')
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

  // Initialize works array based on lead services
  const initializeWorks = () => {
    if (lead.lead_services && lead.lead_services.length > 0) {
      const works = lead.lead_services.map((ls: any) => ({
        service_id: ls.service_id,
        service_name: ls.services.name,
        title: `${ls.services.name} for ${lead.name}`,
        description: lead.notes || `Work for ${ls.services.name} service`,
        priority: 'medium',
        due_date: '',
        assigned_to: '',
      }));
      setWorksToCreate(works);
    }
  };

  const handleCustomerCreated = async (newCustomerId: string) => {
    setCustomerId(newCustomerId);

    try {
      // Mark lead as converted
      const { error: leadError } = await supabase
        .from('leads')
        .update({
          converted_to_customer_id: newCustomerId,
          converted_at: new Date().toISOString(),
          status: 'converted',
        })
        .eq('id', lead.id);

      if (leadError) throw leadError;

      // Copy lead services to customer services
      if (lead.lead_services && lead.lead_services.length > 0) {
        const customerServices = lead.lead_services.map((ls: any) => ({
          customer_id: newCustomerId,
          service_id: ls.service_id,
          user_id: user?.id,
          status: 'active',
          price: 0,
        }));

        const { error: servicesError } = await supabase
          .from('customer_services')
          .insert(customerServices);

        if (servicesError) throw servicesError;
      }

      if (createWork && worksToCreate.length > 0) {
        toast.success('Customer created successfully! Now configure work details.');
        setStep('works');
      } else {
        toast.success('Lead successfully converted to customer!');
        onSuccess();
      }
    } catch (error: any) {
      console.error('Error converting lead:', error.message);
      toast.error(`Failed to convert lead: ${error.message}`);
    }
  };

  const handleBulkWorkCreation = async () => {
    if (!customerId) {
      toast.error('Customer ID is missing. Please try again.');
      return;
    }

    setIsCreatingWorks(true);
    const createdWorksList: any[] = [];
    const errors: string[] = [];

    try {
      // Create all works in a transaction-like manner
      for (const work of worksToCreate) {
        try {
          const { data, error } = await supabase.from('works').insert({
            user_id: user?.id,
            customer_id: customerId,
            service_id: work.service_id,
            assigned_to: work.assigned_to || null,
            title: work.title,
            description: work.description || null,
            priority: work.priority,
            due_date: work.due_date || null,
            status: 'pending',
          }).select().single();

          if (error) throw error;
          createdWorksList.push({ ...work, id: data.id, created: true });
        } catch (error: any) {
          console.error(`Error creating work for ${work.service_name}:`, error.message);
          errors.push(`${work.service_name}: ${error.message}`);
          createdWorksList.push({ ...work, created: false, error: error.message });
        }
      }

      setCreatedWorks(createdWorksList);

      if (errors.length === 0) {
        toast.success(`Successfully created ${createdWorksList.length} work assignments!`);
        setStep('summary');
      } else if (errors.length < worksToCreate.length) {
        toast.warning(`Created ${createdWorksList.length - errors.length} works. ${errors.length} failed.`);
        setStep('summary');
      } else {
        toast.error('Failed to create work assignments. Please try again.');
      }
    } catch (error: any) {
      console.error('Error in bulk work creation:', error.message);
      toast.error(`Failed to create works: ${error.message}`);
    } finally {
      setIsCreatingWorks(false);
    }
  };

  const updateWork = (index: number, field: keyof WorkToCreate, value: string) => {
    const updated = [...worksToCreate];
    updated[index] = { ...updated[index], [field]: value };
    setWorksToCreate(updated);
  };

  // Summary view after work creation
  if (step === 'summary') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-600 to-emerald-700">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <CheckCircle size={28} />
              Conversion Summary
            </h2>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="text-green-600" size={24} />
                <h3 className="text-lg font-semibold text-green-900">
                  Lead successfully converted to customer!
                </h3>
              </div>
              <p className="text-green-700 ml-9">
                Customer <span className="font-bold">{lead.name}</span> has been created with all associated services.
              </p>
            </div>

            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">
                Created Works ({createdWorks.filter(w => w.created).length}/{createdWorks.length})
              </h4>
              <div className="space-y-3">
                {createdWorks.map((work, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 ${
                      work.created
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {work.created ? (
                            <CheckCircle size={18} className="text-green-600" />
                          ) : (
                            <AlertCircle size={18} className="text-red-600" />
                          )}
                          <h5 className="font-semibold text-gray-900">{work.title}</h5>
                        </div>
                        <p className="text-sm text-gray-600 ml-6">
                          Service: {work.service_name}
                        </p>
                        {work.assigned_to && (
                          <p className="text-sm text-gray-600 ml-6">
                            Assigned to staff member
                          </p>
                        )}
                        {!work.created && work.error && (
                          <p className="text-sm text-red-600 ml-6 mt-1">
                            Error: {work.error}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          work.created
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {work.created ? 'Created' : 'Failed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {createdWorks.some(w => !w.created) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Some works failed to create. You can manually create them later from the Works page.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onSuccess}
              className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-lg hover:from-green-700 hover:to-emerald-800 transition-all font-medium shadow-lg"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Works configuration view
  if (step === 'works') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-orange-700">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Briefcase size={28} />
              Configure Works for {lead.name}
            </h2>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> Configure work details for all {worksToCreate.length} services below. 
                You can assign staff members, set priorities, and due dates for each work.
              </p>
            </div>

            <div className="space-y-6">
              {worksToCreate.map((work, index) => (
                <div key={index} className="bg-gray-50 rounded-xl border-2 border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {index + 1}. {work.service_name}
                    </h3>
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                      Work {index + 1} of {worksToCreate.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Work Title *
                      </label>
                      <input
                        type="text"
                        value={work.title}
                        onChange={(e) => updateWork(index, 'title', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Enter work title"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description
                      </label>
                      <textarea
                        value={work.description}
                        onChange={(e) => updateWork(index, 'description', e.target.value)}
                        rows={2}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Work description..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Priority
                      </label>
                      <select
                        value={work.priority}
                        onChange={(e) => updateWork(index, 'priority', e.target.value)}
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
                        value={work.due_date}
                        onChange={(e) => updateWork(index, 'due_date', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Assign to Staff
                      </label>
                      <div className="relative">
                        <Users
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                          size={18}
                        />
                        <select
                          value={work.assigned_to}
                          onChange={(e) => updateWork(index, 'assigned_to', e.target.value)}
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
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
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
              onClick={handleBulkWorkCreation}
              disabled={isCreatingWorks}
              className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg flex items-center gap-2"
            >
              {isCreatingWorks ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating {worksToCreate.length} Works...
                </>
              ) : (
                <>Create All {worksToCreate.length} Works</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Customer creation step with option to create work (DEFAULT CHECKED)
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
    <CustomerFormModal
      onClose={onClose}
      onSuccess={handleCustomerCreated}
      initialData={initialCustomerData}
      mode="create"
      title={`Convert Lead to Customer: ${lead.name}`}
      showCreateWorkOption={true}
      createWorkChecked={createWork} // DEFAULT TRUE
      onCreateWorkChange={setCreateWork}
    />
  );
}
