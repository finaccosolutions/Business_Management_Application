// src/components/ConvertLeadModal.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  X,
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Globe,
  CreditCard,
  FileText,
  Briefcase,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle,
  Upload,
  Plus,
} from 'lucide-react';

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

interface Service {
  id: string;
  name: string;
  description: string;
  base_price: number;
}

interface Staff {
  id: string;
  name: string;
  email: string;
  designation: string;
}

interface ConvertLeadModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConvertLeadModal({
  lead,
  onClose,
  onSuccess,
}: ConvertLeadModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [createWork, setCreateWork] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(lead.image_url);

  // Customer Form Data
  const [customerData, setCustomerData] = useState({
    name: lead.name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    company_name: lead.company_name || '',
    image_url: lead.image_url || '',
    contact_person: lead.contact_person || '',
    designation: lead.designation || '',
    alternate_phone: lead.alternate_phone || '',
    website: lead.website || '',
    address: lead.address || '',
    city: lead.city || '',
    state: lead.state || '',
    pincode: lead.pincode || '',
    country: lead.country || 'India',
    
    // Tax & Statutory
    gstin: '',
    pan_number: '',
    tax_registration_type: 'registered',
    msme_number: '',
    tan_number: '',
    
    // Bank Details
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_branch: '',
    
    // Other
    notes: lead.notes || '',
  });

  // Work Form Data
  const [workData, setWorkData] = useState({
    title: '',
    description: '',
    service_id: '',
    assigned_to: '',
    priority: 'medium',
    deadline: '',
    estimated_hours: '',
    budget: '',
    notes: '',
  });

  useEffect(() => {
    fetchServices();
    fetchStaff();
  }, []);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, description, base_price')
        .eq('user_id', user?.id)
        .order('name');

      if (error) throw error;
      setServices(data || []);

      // Pre-select service if lead has only one service
      if (lead.lead_services && lead.lead_services.length === 1) {
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
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, designation')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setStaff(data || []);
    } catch (error: any) {
      console.error('Error fetching staff:', error.message);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to supabase Storage
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('customer-images')
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('customer-images')
        .getPublicUrl(fileName);

      setCustomerData({ ...customerData, image_url: urlData.publicUrl });
    } catch (error: any) {
      console.error('Error uploading image:', error.message);
      alert('Failed to upload image');
    }
  };

  const handleConvert = async () => {
    setLoading(true);

    try {
      // 1. Create Customer
      const { data: customerRecord, error: customerError } = await supabase
        .from('customers')
        .insert({
          ...customerData,
          user_id: user?.id,
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // 2. Copy lead services to customer services
      if (lead.lead_services && lead.lead_services.length > 0) {
        const customerServices = lead.lead_services.map((ls: any) => ({
          customer_id: customerRecord.id,
          service_id: ls.service_id,
          user_id: user?.id,
          status: 'active',
        }));

        const { error: servicesError } = await supabase
          .from('customer_services')
          .insert(customerServices);

        if (servicesError) throw servicesError;
      }

      // 3. Create Work if requested
      if (createWork && workData.title && workData.service_id) {
        const { error: workError } = await supabase
          .from('works')
          .insert({
            user_id: user?.id,
            customer_id: customerRecord.id,
            service_id: workData.service_id,
            title: workData.title,
            description: workData.description,
            assigned_to: workData.assigned_to || null,
            priority: workData.priority,
            status: 'pending',
            deadline: workData.deadline || null,
            estimated_hours: workData.estimated_hours ? parseFloat(workData.estimated_hours) : null,
            budget: workData.budget ? parseFloat(workData.budget) : null,
            notes: workData.notes,
          });

        if (workError) throw workError;
      }

      // 4. Delete the lead
      const { error: deleteError } = await supabase
        .from('leads')
        .delete()
        .eq('id', lead.id);

      if (deleteError) throw deleteError;

      alert('Lead successfully converted to customer!');
      onSuccess();
    } catch (error: any) {
      console.error('Error converting lead:', error.message);
      alert(`Failed to convert lead: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
              currentStep >= step
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {currentStep > step ? <CheckCircle size={20} /> : step}
          </div>
          {step < 4 && (
            <div
              className={`w-16 h-1 mx-2 transition-all ${
                currentStep > step ? 'bg-green-600' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          General Information
        </h3>
        <p className="text-gray-600">Basic customer details and contact information</p>
      </div>

      {/* Image Upload */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white text-4xl font-bold overflow-hidden">
            {imagePreview || customerData.image_url ? (
              <img
                src={imagePreview || customerData.image_url}
                alt="Customer"
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={48} />
            )}
          </div>
          <label className="absolute bottom-0 right-0 bg-white rounded-full p-2 shadow-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <Upload size={20} className="text-green-600" />
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Customer Name / Company Name *
          </label>
          <input
            type="text"
            required
            value={customerData.name}
            onChange={(e) =>
              setCustomerData({ ...customerData, name: e.target.value })
            }
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Name
          </label>
          <div className="relative">
            <Building2
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              value={customerData.company_name}
              onChange={(e) =>
                setCustomerData({ ...customerData, company_name: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Contact Person
          </label>
          <input
            type="text"
            value={customerData.contact_person}
            onChange={(e) =>
              setCustomerData({ ...customerData, contact_person: e.target.value })
            }
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Designation
          </label>
          <input
            type="text"
            value={customerData.designation}
            onChange={(e) =>
              setCustomerData({ ...customerData, designation: e.target.value })
            }
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="email"
              value={customerData.email}
              onChange={(e) =>
                setCustomerData({ ...customerData, email: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number
          </label>
          <div className="relative">
            <Phone
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="tel"
              value={customerData.phone}
              onChange={(e) =>
                setCustomerData({ ...customerData, phone: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Alternate Phone
          </label>
          <div className="relative">
            <Phone
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="tel"
              value={customerData.alternate_phone}
              onChange={(e) =>
                setCustomerData({ ...customerData, alternate_phone: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Website
          </label>
          <div className="relative">
            <Globe
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="url"
              value={customerData.website}
              onChange={(e) =>
                setCustomerData({ ...customerData, website: e.target.value })
              }
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Address & Tax Details
        </h3>
        <p className="text-gray-600">Location and statutory information</p>
      </div>

      {/* Address */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin size={20} className="text-green-600" />
          Address Information
        </h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Street Address
            </label>
            <textarea
              value={customerData.address}
              onChange={(e) =>
                setCustomerData({ ...customerData, address: e.target.value })
              }
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Enter full address"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                value={customerData.city}
                onChange={(e) =>
                  setCustomerData({ ...customerData, city: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <input
                type="text"
                value={customerData.state}
                onChange={(e) =>
                  setCustomerData({ ...customerData, state: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PIN Code
              </label>
              <input
                type="text"
                value={customerData.pincode}
                onChange={(e) =>
                  setCustomerData({ ...customerData, pincode: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Country
              </label>
              <input
                type="text"
                value={customerData.country}
                onChange={(e) =>
                  setCustomerData({ ...customerData, country: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tax & Statutory */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText size={20} className="text-green-600" />
          Tax & Statutory Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tax Registration Type
            </label>
            <select
              value={customerData.tax_registration_type}
              onChange={(e) =>
                setCustomerData({
                  ...customerData,
                  tax_registration_type: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="registered">GST Registered</option>
              <option value="unregistered">Unregistered</option>
              <option value="composition">Composition Scheme</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              GSTIN
            </label>
            <input
              type="text"
              value={customerData.gstin}
              onChange={(e) =>
                setCustomerData({ ...customerData, gstin: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="22AAAAA0000A1Z5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PAN Number
            </label>
            <input
              type="text"
              value={customerData.pan_number}
              onChange={(e) =>
                setCustomerData({ ...customerData, pan_number: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="AAAAA0000A"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              TAN Number
            </label>
            <input
              type="text"
              value={customerData.tan_number}
              onChange={(e) =>
                setCustomerData({ ...customerData, tan_number: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="AAAA00000A"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              MSME/Udyam Number
            </label>
            <input
              type="text"
              value={customerData.msme_number}
              onChange={(e) =>
                setCustomerData({ ...customerData, msme_number: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="UDYAM-XX-00-0000000"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Bank Account Details
        </h3>
        <p className="text-gray-600">Banking information for payments and transactions</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Optional Information</p>
          <p>Bank details can be added later if not available now.</p>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard size={20} className="text-green-600" />
          Banking Information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bank Name
            </label>
            <input
              type="text"
              value={customerData.bank_name}
              onChange={(e) =>
                setCustomerData({ ...customerData, bank_name: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="State Bank of India"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Branch Name
            </label>
            <input
              type="text"
              value={customerData.bank_branch}
              onChange={(e) =>
                setCustomerData({ ...customerData, bank_branch: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Main Branch"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Number
            </label>
            <input
              type="text"
              value={customerData.bank_account_number}
              onChange={(e) =>
                setCustomerData({
                  ...customerData,
                  bank_account_number: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="00000000000000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              IFSC Code
            </label>
            <input
              type="text"
              value={customerData.bank_ifsc_code}
              onChange={(e) =>
                setCustomerData({ ...customerData, bank_ifsc_code: e.target.value })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="SBIN0000000"
            />
          </div>
        </div>
      </div>

      {/* Additional Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Additional Notes
        </label>
        <textarea
          value={customerData.notes}
          onChange={(e) =>
            setCustomerData({ ...customerData, notes: e.target.value })
          }
          rows={4}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          placeholder="Any additional information about the customer..."
        />
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Create Work (Optional)
        </h3>
        <p className="text-gray-600">Assign work to start serving your new customer</p>
      </div>

      {/* Create Work Toggle */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={createWork}
            onChange={(e) => setCreateWork(e.target.checked)}
            className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
          />
          <div>
            <p className="font-medium text-gray-900">
              Also create a work for this customer
            </p>
            <p className="text-sm text-gray-600">
              Start a new project or task immediately after conversion
            </p>
          </div>
        </label>
      </div>

      {createWork && (
        <div className="space-y-6 animate-fadeIn">
          {/* Work Details */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Briefcase size={20} className="text-green-600" />
              Work Details
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Title *
                </label>
                <input
                  type="text"
                  required={createWork}
                  value={workData.title}
                  onChange={(e) =>
                    setWorkData({ ...workData, title: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., GST Filing for Q1 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={workData.description}
                  onChange={(e) =>
                    setWorkData({ ...workData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Detailed description of the work..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service *
                  </label>
                  <select
                    required={createWork}
                    value={workData.service_id}
                    onChange={(e) =>
                      setWorkData({ ...workData, service_id: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Select a service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priority
                  </label>
                  <select
                    value={workData.priority}
                    onChange={(e) =>
                      setWorkData({ ...workData, priority: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Assignment & Timeline */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users size={20} className="text-green-600" />
              Assignment & Timeline
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign To
                </label>
                <select
                  value={workData.assigned_to}
                  onChange={(e) =>
                    setWorkData({ ...workData, assigned_to: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Unassigned</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} - {member.designation}
                    </option>
                  ))}
                </select>
                {staff.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No staff members available. Add staff in Settings.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Deadline
                </label>
                <div className="relative">
                  <Calendar
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    type="date"
                    value={workData.deadline}
                    onChange={(e) =>
                      setWorkData({ ...workData, deadline: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={workData.estimated_hours}
                  onChange={(e) =>
                    setWorkData({ ...workData, estimated_hours: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., 8"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Budget (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={workData.budget}
                  onChange={(e) =>
                    setWorkData({ ...workData, budget: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., 5000"
                />
              </div>
            </div>
          </div>

          {/* Work Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Work Notes
            </label>
            <textarea
              value={workData.notes}
              onChange={(e) => setWorkData({ ...workData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Any specific instructions or requirements for this work..."
            />
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-4">Conversion Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Customer Name:</span>
            <span className="font-medium text-gray-900">{customerData.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Email:</span>
            <span className="font-medium text-gray-900">{customerData.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Phone:</span>
            <span className="font-medium text-gray-900">{customerData.phone}</span>
          </div>
          {lead.lead_services && lead.lead_services.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Services:</span>
              <span className="font-medium text-gray-900">
                {lead.lead_services.length} service(s)
              </span>
            </div>
          )}
          {createWork && workData.title && (
            <div className="flex justify-between">
              <span className="text-gray-600">Work to Create:</span>
              <span className="font-medium text-gray-900">{workData.title}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-600 to-green-700">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <UserPlus size={28} />
              Convert Lead to Customer
            </h2>
            <p className="text-green-100 mt-1">
              Converting: {lead.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          {renderStepIndicator()}
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Step {currentStep} of 4
          </div>
          <div className="flex gap-3">
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Previous
              </button>
            )}
            {currentStep < 4 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all font-medium shadow-lg"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleConvert}
                disabled={loading || !customerData.name}
                className="px-8 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Converting...
                  </>
                ) : (
                  <>
                    <CheckCircle size={20} />
                    Convert to Customer
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
