import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Users, Briefcase, DollarSign, Award, BookOpen, Phone as PhoneIcon, ArrowLeft, Trash2, Plus } from 'lucide-react';

interface CreateStaffProps {
    onNavigate: (page: string, params?: any) => void;
    editStaffId?: string;
}

export default function CreateStaff({ onNavigate, editStaffId }: CreateStaffProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        email: '',
        phone: '',
        employee_id: '',

        // Employment Details
        role: 'staff',
        department: '',
        joining_date: '',
        employment_type: 'full_time',

        // Salary Configuration
        salary_method: 'hourly',
        salary_amount: '',
        hourly_rate: '', // backward compatibility

        // Skills & Expertise
        skills: '',
        expertise_areas: '',

        // Status
        is_active: true,
        availability_status: 'available',

        // Address Info
        address: '',
        city: '',
        state: '',
        pincode: '',

        // Additional Info
        notes: '',

        // Complex fields
        education: {
            degree: '',
            institution: '',
            year: ''
        },
        emergency_contact: {
            name: '',
            relationship: '',
            phone: ''
        },
        certifications: [] as Array<{ name: string; issued_by: string; year: string }>
    });

    const [newCert, setNewCert] = useState({ name: '', issued_by: '', year: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user) {
            if (editStaffId) {
                setIsEditing(true);
                loadStaffForEdit(editStaffId);
            } else {
                generateAndSetId();
            }
        }
    }, [user, editStaffId]);

    const generateAndSetId = async () => {
        try {
            const { data, error } = await supabase.rpc('generate_next_id', {
                p_user_id: user!.id,
                p_id_type: 'employee_id'
            });

            if (error) {
                console.error('Error generating employee ID:', error);
                return;
            }

            if (data) {
                setFormData(prev => ({ ...prev, employee_id: data }));
            }
        } catch (error) {
            console.error('Error in generateEmployeeId:', error);
        }
    };

    const loadStaffForEdit = async (id: string) => {
        setLoading(true);
        try {
            const { data: staff, error } = await supabase
                .from('staff_members')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            if (staff) {
                setFormData({
                    name: staff.name,
                    email: staff.email || '',
                    phone: staff.phone || '',
                    employee_id: staff.employee_id || '',
                    role: staff.role || 'staff',
                    department: staff.department || '',
                    joining_date: staff.joining_date || '',
                    employment_type: staff.employment_type || 'full_time',
                    salary_method: staff.salary_method || 'hourly',
                    salary_amount: staff.salary_amount?.toString() || '',
                    hourly_rate: '',
                    skills: staff.skills ? staff.skills.join(', ') : '',
                    expertise_areas: staff.expertise_areas ? staff.expertise_areas.join(', ') : '',
                    is_active: staff.is_active,
                    availability_status: staff.availability_status || 'available',
                    address: staff.address || '',
                    city: staff.city || '',
                    state: staff.state || '',
                    pincode: staff.pincode || '',
                    notes: staff.notes || '',
                    education: staff.education || { degree: '', institution: '', year: '' },
                    emergency_contact: staff.emergency_contact || { name: '', relationship: '', phone: '' },
                    certifications: staff.certifications || []
                });
            }
        } catch (error) {
            console.error('Error loading staff details:', error);
            showToast('Failed to load staff details', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const staffData = {
                user_id: user!.id,
                name: formData.name,
                email: formData.email ? formData.email.toLowerCase().trim() : null,
                phone: formData.phone || null,
                employee_id: formData.employee_id || null,
                role: formData.role,
                department: formData.department || null,
                joining_date: formData.joining_date || null,
                employment_type: formData.employment_type,
                salary_method: formData.salary_method,
                salary_amount: formData.salary_amount ? parseFloat(formData.salary_amount) : null,
                hourly_rate: formData.salary_method === 'hourly' && formData.salary_amount
                    ? parseFloat(formData.salary_amount)
                    : null,
                skills: formData.skills ? formData.skills.split(',').map(s => s.trim()) : null,
                expertise_areas: formData.expertise_areas ? formData.expertise_areas.split(',').map(s => s.trim()) : null,
                is_active: formData.is_active,
                availability_status: formData.availability_status,
                address: formData.address || null,
                city: formData.city || null,
                state: formData.state || null,
                pincode: formData.pincode || null,
                notes: formData.notes || null,
                education: formData.education.degree ? formData.education : null,
                emergency_contact: formData.emergency_contact.name ? formData.emergency_contact : null,
                certifications: formData.certifications.length > 0 ? formData.certifications : null,
                updated_at: new Date().toISOString()
            };

            if (isEditing && editStaffId) {
                const { error } = await supabase
                    .from('staff_members')
                    .update(staffData)
                    .eq('id', editStaffId);

                if (error) throw error;
                showToast('Staff member updated successfully', 'success');
            } else {
                const { error } = await supabase
                    .from('staff_members')
                    .insert(staffData);

                if (error) throw error;
                showToast('Staff member created successfully', 'success');
            }

            onNavigate('staff');
        } catch (error) {
            console.error('Error saving staff member:', error);
            showToast('Failed to save staff member', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addCertification = () => {
        if (newCert.name && newCert.issued_by) {
            setFormData({
                ...formData,
                certifications: [...formData.certifications, { ...newCert }]
            });
            setNewCert({ name: '', issued_by: '', year: '' });
        }
    };

    const removeCertification = (index: number) => {
        setFormData({
            ...formData,
            certifications: formData.certifications.filter((_, i) => i !== index)
        });
    };

    const getSalaryLabel = () => {
        switch (formData.salary_method) {
            case 'hourly': return 'Hourly Rate (₹)';
            case 'monthly': return 'Monthly Salary (₹)';
            case 'fixed': return 'Fixed Amount (₹)';
            case 'commission': return 'Commission Rate (%)';
            default: return 'Amount';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => onNavigate('staff')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <Users className="w-8 h-8 text-emerald-600" />
                    {isEditing ? 'Edit Staff Member' : 'Add New Staff Member'}
                </h1>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* Basic Information */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Users size={20} className="text-emerald-600" />
                            Basic Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Staff member name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Employee ID</label>
                                <input
                                    type="text"
                                    value={formData.employee_id}
                                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-gray-50"
                                    placeholder="Auto-generated"
                                    readOnly={!editStaffId} // Can potentially edit if necessary or keep readOnly
                                />
                                {!editStaffId && <p className="text-xs text-gray-500 mt-1">Auto-generated based on settings</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="email@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="+91 1234567890"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Employment Details */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Briefcase size={20} className="text-emerald-600" />
                            Employment Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="staff">Staff</option>
                                    <option value="senior">Senior</option>
                                    <option value="team-lead">Team Lead</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="e.g., Accounts, Tax, Audit"
                                    list="departments"
                                />
                                <datalist id="departments">
                                    <option value="Accounts" />
                                    <option value="Tax" />
                                    <option value="Audit" />
                                    <option value="Legal" />
                                    <option value="Consulting" />
                                </datalist>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Joining Date</label>
                                <input
                                    type="date"
                                    value={formData.joining_date}
                                    onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Employment Type</label>
                                <select
                                    value={formData.employment_type}
                                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="full_time">Full Time</option>
                                    <option value="part_time">Part Time</option>
                                    <option value="contract">Contract</option>
                                    <option value="intern">Intern</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Availability</label>
                                <select
                                    value={formData.availability_status}
                                    onChange={(e) => setFormData({ ...formData, availability_status: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="available">Available</option>
                                    <option value="busy">Busy</option>
                                    <option value="on-leave">On Leave</option>
                                    <option value="unavailable">Unavailable</option>
                                </select>
                            </div>

                            <div className="flex items-center pt-6">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                        className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Active Status</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Salary Configuration */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <DollarSign size={20} className="text-emerald-600" />
                            Compensation Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Salary Method</label>
                                <select
                                    value={formData.salary_method}
                                    onChange={(e) => setFormData({ ...formData, salary_method: e.target.value, salary_amount: '' })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="hourly">Hourly Rate</option>
                                    <option value="monthly">Monthly Salary</option>
                                    <option value="fixed">Fixed Project-based</option>
                                    <option value="commission">Commission-based</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{getSalaryLabel()}</label>
                                <input
                                    type="number"
                                    step={formData.salary_method === 'commission' ? '0.01' : '0.01'}
                                    value={formData.salary_amount}
                                    onChange={(e) => setFormData({ ...formData, salary_amount: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder={formData.salary_method === 'commission' ? '10.00' : '0.00'}
                                />
                                {formData.salary_method === 'commission' && (
                                    <p className="text-xs text-gray-500 mt-1">Enter percentage (e.g., 10 for 10%)</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Skills & Expertise */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Award size={20} className="text-emerald-600" />
                            Skills & Expertise
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Skills (comma-separated)
                                </label>
                                <input
                                    type="text"
                                    value={formData.skills}
                                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Accounting, Tax Filing, GST, Financial Analysis"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Expertise Areas (comma-separated)
                                </label>
                                <input
                                    type="text"
                                    value={formData.expertise_areas}
                                    onChange={(e) => setFormData({ ...formData, expertise_areas: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Corporate Tax, Auditing, Financial Planning"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Certifications */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Award size={20} className="text-emerald-600" />
                            Certifications
                        </h3>
                        <div className="space-y-3">
                            {formData.certifications.map((cert, index) => (
                                <div key={index} className="flex items-center space-x-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                                    <div className="flex-1">
                                        <span className="text-sm font-medium text-gray-900">{cert.name}</span>
                                        <span className="text-sm text-gray-600"> - {cert.issued_by}</span>
                                        {cert.year && <span className="text-sm text-gray-500"> ({cert.year})</span>}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeCertification(index)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <input
                                    type="text"
                                    value={newCert.name}
                                    onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
                                    className="md:col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Certification name"
                                />
                                <input
                                    type="text"
                                    value={newCert.issued_by}
                                    onChange={(e) => setNewCert({ ...newCert, issued_by: e.target.value })}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Issued by"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newCert.year}
                                        onChange={(e) => setNewCert({ ...newCert, year: e.target.value })}
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        placeholder="Year"
                                    />
                                    <button
                                        type="button"
                                        onClick={addCertification}
                                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center"
                                        title="Add certification"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Education */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <BookOpen size={20} className="text-emerald-600" />
                            Education
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Degree</label>
                                <input
                                    type="text"
                                    value={formData.education.degree}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        education: { ...formData.education, degree: e.target.value }
                                    })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="B.Com, CA, MBA"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Institution</label>
                                <input
                                    type="text"
                                    value={formData.education.institution}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        education: { ...formData.education, institution: e.target.value }
                                    })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="University/Institute name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                                <input
                                    type="text"
                                    value={formData.education.year}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        education: { ...formData.education, year: e.target.value }
                                    })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="2020"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Address Information */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <PhoneIcon size={20} className="text-emerald-600" />
                            Address Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Street address"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                                <input
                                    type="text"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="City"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                                <input
                                    type="text"
                                    value={formData.state}
                                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="State"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Pincode</label>
                                <input
                                    type="text"
                                    value={formData.pincode}
                                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Pincode"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Emergency Contact */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <PhoneIcon size={20} className="text-emerald-600" />
                            Emergency Contact
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                <input
                                    type="text"
                                    value={formData.emergency_contact.name}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        emergency_contact: { ...formData.emergency_contact, name: e.target.value }
                                    })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Contact person name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Relationship</label>
                                <input
                                    type="text"
                                    value={formData.emergency_contact.relationship}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        emergency_contact: { ...formData.emergency_contact, relationship: e.target.value }
                                    })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="Father, Spouse, etc."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.emergency_contact.phone}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        emergency_contact: { ...formData.emergency_contact, phone: e.target.value }
                                    })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    placeholder="+91 1234567890"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            rows={3}
                            placeholder="Additional notes about the staff member"
                        />
                    </div>

                    <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
                        <button
                            type="button"
                            onClick={() => onNavigate('staff')}
                            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSubmitting ? 'Saving...' : (isEditing ? 'Update Staff Member' : 'Create Staff Member')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
