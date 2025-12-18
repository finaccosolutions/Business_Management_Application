import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getCountryConfig } from '../config/countryConfig';
import { useToast } from '../contexts/ToastContext';
import {
    User,
    Mail,
    Phone,
    Building2,
    MapPin,
    Globe,
    Upload,
    FileText,
    CreditCard,
    Briefcase,
    ArrowLeft,
} from 'lucide-react';

interface CreateCustomerProps {
    onNavigate: (page: string, params?: any) => void;
    editCustomerId?: string;
}

type TabType = 'basic' | 'address' | 'tax' | 'bank';

export default function CreateCustomer({ onNavigate, editCustomerId }: CreateCustomerProps) {
    const { user, userCountry } = useAuth();
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('basic');
    const [isEditing, setIsEditing] = useState(false);
    const { showToast } = useToast();

    // get country config
    const customerCountry = userCountry || 'IN';
    const countryConfig = getCountryConfig(customerCountry);

    const [formData, setFormData] = useState<any>({
        customer_id: '',
        name: '',
        email: '',
        phone: '',
        company_name: '',
        image_url: '',
        contact_person: '',
        designation: '',
        alternate_phone: '',
        website: '',
        entity_type: '',
        legal_form: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        country: customerCountry,
        gstin: '',
        vat_number: '',
        ein: '',
        pan_number: '',
        tax_registration_type: 'registered',
        msme_number: '',
        tan_number: '',
        trade_license: '',
        company_number: '',
        bank_name: '',
        bank_account_number: '',
        bank_ifsc_code: '',
        bank_branch: '',
        notes: '',
    });

    useEffect(() => {
        const init = async () => {
            if (user) {
                if (editCustomerId) {
                    setIsEditing(true);
                    await loadCustomerForEdit(editCustomerId);
                } else {
                    await generateAndSetId();
                }
            }
        };

        init();
    }, [user, editCustomerId]);

    const generateAndSetId = async () => {
        try {
            const { data, error } = await supabase.rpc('generate_next_id', {
                p_user_id: user!.id,
                p_id_type: 'customer_id'
            });

            if (error) {
                console.error('Error generating customer ID:', error);
                return;
            }

            if (data) {
                setFormData((prev: any) => ({ ...prev, customer_id: data }));
            }
        } catch (error) {
            console.error('Error in generateCustomerId:', error);
        }
    };

    const loadCustomerForEdit = async (id: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                // Merge data, ensuring country defaults if missing
                setFormData((prev: any) => ({
                    ...prev,
                    ...data,
                    // Handle fields that might be null in DB but we want '' for controlled inputs
                    email: data.email || '',
                    phone: data.phone || '',
                    company_name: data.company_name || '',
                    contact_person: data.contact_person || '',
                    designation: data.designation || '',
                    alternate_phone: data.alternate_phone || '',
                    website: data.website || '',
                    address: data.address || '',
                    city: data.city || '',
                    state: data.state || '',
                    pincode: data.pincode || '',
                    gstin: data.gstin || '',
                    vat_number: data.vat_number || '',
                    ein: data.ein || '',
                    pan_number: data.pan_number || '',
                    msme_number: data.msme_number || '',
                    tan_number: data.tan_number || '',
                    trade_license: data.trade_license || '',
                    company_number: data.company_number || '',
                    bank_name: data.bank_name || '',
                    bank_account_number: data.bank_account_number || '',
                    bank_ifsc_code: data.bank_ifsc_code || '',
                    bank_branch: data.bank_branch || '',
                    notes: data.notes || '',
                }));
                if (data.image_url) {
                    setImagePreview(data.image_url);
                }
            }
        } catch (error) {
            console.error('Error loading customer:', error);
            showToast('Failed to load customer details', 'error');
        } finally {
            setLoading(false);
        }
    };

    const tabs: Array<{ id: TabType; label: string; icon: any }> = [
        { id: 'basic', label: 'Basic Info', icon: User },
        { id: 'address', label: 'Address', icon: MapPin },
        { id: 'tax', label: 'Tax & Statutory', icon: FileText },
        { id: 'bank', label: 'Bank Details', icon: CreditCard },
    ];

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

            const { error } = await supabase.storage
                .from('customer-images')
                .upload(fileName, file);

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from('customer-images')
                .getPublicUrl(fileName);

            setFormData({ ...formData, image_url: urlData.publicUrl });
        } catch (error: any) {
            console.error('Error uploading image:', error.message);
            showToast('Failed to upload image', 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const customerData = {
                ...formData,
                user_id: user?.id,
                updated_at: new Date().toISOString(),
            };

            if (isEditing && editCustomerId) {
                const { error } = await supabase
                    .from('customers')
                    .update(customerData)
                    .eq('id', editCustomerId);

                if (error) throw error;
                showToast('Customer updated successfully', 'success');
            } else {
                const { error } = await supabase
                    .from('customers')
                    .insert(customerData);

                if (error) throw error;
                showToast('Customer created successfully', 'success');
            }

            onNavigate('customers');
        } catch (error: any) {
            console.error('Error saving customer:', error.message);
            showToast('Failed to save customer', 'error');
        } finally {
            setLoading(false);
        }
    };

    const renderTaxFields = () => {
        return (
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tax Registration Type
                    </label>
                    <select
                        value={formData.tax_registration_type}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                tax_registration_type: e.target.value,
                            })
                        }
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                        {countryConfig.registrationTypes.map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                </div>

                {countryConfig.taxFields.map((field) => (
                    <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                        </label>
                        <input
                            type="text"
                            value={(formData as any)[field.name] || ''}
                            onChange={(e) =>
                                setFormData({ ...formData, [field.name]: e.target.value })
                            }
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder={field.placeholder}
                            maxLength={field.maxLength}
                            pattern={field.pattern}
                        />
                    </div>
                ))}

                {countryConfig.otherStatutoryFields?.map((field) => (
                    <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                        </label>
                        <input
                            type="text"
                            value={(formData as any)[field.name] || ''}
                            onChange={(e) =>
                                setFormData({ ...formData, [field.name]: e.target.value })
                            }
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder={field.placeholder}
                            maxLength={field.maxLength}
                            pattern={field.pattern}
                        />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => onNavigate('customers')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <User className="w-8 h-8 text-green-600" />
                    {isEditing ? 'Edit Customer' : 'Add New Customer'}
                </h1>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 bg-gray-50 px-6 overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id
                                    ? 'border-green-600 text-green-600 bg-white'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6">
                    {/* Image Upload - Always visible */}
                    <div className="flex justify-center mb-6">
                        <div className="relative">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white text-4xl font-bold overflow-hidden">
                                {imagePreview || formData.image_url ? (
                                    <img
                                        src={imagePreview || formData.image_url}
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

                    {/* Tab Content */}
                    {activeTab === 'basic' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Customer ID
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.customer_id}
                                        readOnly
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50"
                                    />
                                    {!isEditing && <p className="text-xs text-gray-500 mt-1">Auto-generated</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Customer Name / Company Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="ABC Company"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                            value={formData.company_name}
                                            onChange={(e) =>
                                                setFormData({ ...formData, company_name: e.target.value })
                                            }
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            placeholder="Company Pvt Ltd"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Contact Person
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.contact_person}
                                        onChange={(e) =>
                                            setFormData({ ...formData, contact_person: e.target.value })
                                        }
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="John Doe"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Designation
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.designation}
                                        onChange={(e) =>
                                            setFormData({ ...formData, designation: e.target.value })
                                        }
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="Manager"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Entity Type / Legal Form
                                    </label>
                                    <select
                                        value={formData.entity_type}
                                        onChange={(e) =>
                                            setFormData({ ...formData, entity_type: e.target.value, legal_form: e.target.value })
                                        }
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    >
                                        <option value="">Select Entity Type</option>
                                        <option value="Individual">Individual</option>
                                        <option value="Sole Proprietor">Sole Proprietor</option>
                                        <option value="Partnership">Partnership</option>
                                        <option value="LLP">Limited Liability Partnership (LLP)</option>
                                        <option value="Private Limited">Private Limited Company</option>
                                        <option value="Public Limited">Public Limited Company</option>
                                        <option value="One Person Company">One Person Company (OPC)</option>
                                        <option value="Trust">Trust</option>
                                        <option value="Society">Society</option>
                                        <option value="NGO">Non-Governmental Organization (NGO)</option>
                                        <option value="Government">Government Entity</option>
                                        <option value="Other">Other</option>
                                    </select>
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
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            placeholder="email@example.com"
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
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            placeholder="+91 98765 43210"
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
                                            value={formData.alternate_phone}
                                            onChange={(e) =>
                                                setFormData({ ...formData, alternate_phone: e.target.value })
                                            }
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            placeholder="+91 98765 43210"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2">
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
                                            value={formData.website}
                                            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            placeholder="https://example.com"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'address' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Street Address
                                </label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    rows={2}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Enter full address"
                                />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                                    <input
                                        type="text"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="City"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                                    <input
                                        type="text"
                                        value={formData.state}
                                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="State"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        PIN Code
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.pincode}
                                        onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="123456"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Country
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.country}
                                        readOnly
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                                        placeholder="India"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'tax' && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <FileText size={20} className="text-green-600" />
                                {countryConfig.taxName} & Statutory Details
                            </h3>
                            {renderTaxFields()}
                        </div>
                    )}

                    {activeTab === 'bank' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Bank Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.bank_name}
                                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
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
                                        value={formData.bank_branch}
                                        onChange={(e) => setFormData({ ...formData, bank_branch: e.target.value })}
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
                                        value={formData.bank_account_number}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                bank_account_number: e.target.value,
                                            })
                                        }
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder="00000000000000"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        {formData.country === 'IN' ? 'IFSC Code' : 'Swift/Routing Code'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.bank_ifsc_code}
                                        onChange={(e) =>
                                            setFormData({ ...formData, bank_ifsc_code: e.target.value })
                                        }
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        placeholder={formData.country === 'IN' ? 'SBIN0000000' : 'Enter code'}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Additional Notes
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={4}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Any additional information about the customer..."
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => onNavigate('customers')}
                            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
                        >
                            {loading ? 'Saving...' : (isEditing ? 'Update Customer' : 'Create Customer')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
