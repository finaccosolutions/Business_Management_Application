// src/components/StaffFormModal.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Trash2, Users, Briefcase, DollarSign, Award, BookOpen, Phone as PhoneIcon, Shield, Lock, FileText, PieChart, Coins } from 'lucide-react';

interface StaffFormModalProps {
  onClose: () => void;
  onSuccess: () => void;
  editingStaff?: any;
  title?: string;
  mode?: string; // 'full', 'permissions'
  initialData?: any;
  staffId?: string;
}

// Configuration for Granular Permissions
const PERMISSION_CONFIG = {
  works: {
    label: "Works Management",
    icon: Briefcase,
    actions: [
      { key: 'create', label: 'Create Works' },
      { key: 'edit', label: 'Edit Works' },
      { key: 'delete', label: 'Delete Works' },
      { key: 'view_all', label: 'View All Works (Team)' },
      { key: 'view_revenue', label: 'View Revenue & Pricing' },
      { key: 'view_monitor', label: 'View Monitor Tab' },
      { key: 'view_board', label: 'View Kanban Board' },
      { key: 'view_schedule', label: 'View Schedule Calendar' },
    ]
  },
  staff: {
    label: "Staff Management",
    icon: Users,
    actions: [
      { key: 'create', label: 'Create New Staff' },
      { key: 'edit', label: 'Edit Staff Details' },
      { key: 'delete', label: 'Delete Staff' },
      { key: 'view_monitor', label: 'View Workload Monitor' },
      { key: 'view_timesheets', label: 'View Time Logs' },
    ]
  },
  customers: {
    label: "Customer Data",
    icon: Users,
    actions: [
      { key: 'create', label: 'Add Customers' },
      { key: 'edit', label: 'Edit Customers' },
      { key: 'delete', label: 'Delete Customers' },
      { key: 'view_contact', label: 'View Phone/Email' },
      { key: 'export', label: 'Export Customer List' },
    ]
  },
  leads: {
    label: "Lead Management",
    icon: PhoneIcon,
    actions: [
      { key: 'create', label: 'Add Leads' },
      { key: 'edit', label: 'Edit Leads' },
      { key: 'delete', label: 'Delete Leads' },
      { key: 'convert', label: 'Convert to Customer' },
    ]
  },
  services: {
    label: "Services",
    icon: BookOpen,
    actions: [
      { key: 'create', label: 'Add Services' },
      { key: 'edit', label: 'Edit Services' },
      { key: 'delete', label: 'Delete Services' },
      { key: 'view_pricing', label: 'View Service Pricing' },
      { key: 'view_monitor', label: 'View Analytics Tab' },
    ]
  },
  accounting: {
    label: "Accounting & Finance",
    icon: Coins,
    actions: [
      { key: 'view_dashboard', label: 'Access Overview' },
      { key: 'create_voucher', label: 'Create Vouchers' },
      { key: 'edit_voucher', label: 'Edit Vouchers' },
      { key: 'delete_voucher', label: 'Delete Vouchers' },
      { key: 'view_ledger', label: 'View Ledgers' },
      { key: 'view_reports', label: 'View Financial Reports' },
    ]
  },
  reports: {
    label: "Reports & Analytics",
    icon: PieChart,
    actions: [
      { key: 'view_revenue', label: 'View Revenue Reports' },
      { key: 'view_staff_performance', label: 'View Staff Performance' },
      { key: 'export', label: 'Export Reports' },
    ]
  },
  invoices: {
    label: "Invoicing",
    icon: FileText,
    actions: [
      { key: 'create', label: 'Create Invoices' },
      { key: 'edit', label: 'Edit Invoices' },
      { key: 'delete', label: 'Delete Invoices' },
      { key: 'view_all', label: 'View All Invoices' },
    ]
  }
};

export default function StaffFormModal({ onClose, onSuccess, editingStaff, initialData, mode }: StaffFormModalProps) {
  const { user } = useAuth();
  const staffToEdit = editingStaff || initialData;
  const showAll = mode !== 'permissions';

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
    hourly_rate: '',

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
    certifications: [] as Array<{ name: string; issued_by: string; year: string }>,
    allowed_modules: ['staff-dashboard', 'works', 'customers', 'services', 'leads'] as string[],
    detailed_permissions: {} as any // Will be initialized in useEffect
  });

  const [newCert, setNewCert] = useState({ name: '', issued_by: '', year: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const generateAndSetId = async () => {
      if (!staffToEdit && user && showAll) { // Only generate if full mode and new
        try {
          const { data, error } = await supabase.rpc('generate_next_id', {
            p_user_id: user.id,
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
      }
    };

    generateAndSetId();
  }, [staffToEdit, user, showAll]);

  useEffect(() => {
    if (staffToEdit) {
      setFormData({
        name: staffToEdit.name || '',
        email: staffToEdit.email || '',
        phone: staffToEdit.phone || '',
        employee_id: staffToEdit.employee_id || '',
        role: staffToEdit.role || 'staff',
        department: staffToEdit.department || '',
        joining_date: staffToEdit.joining_date || '',
        employment_type: staffToEdit.employment_type || 'full-time',
        salary_method: staffToEdit.salary_method || 'hourly',
        salary_amount: staffToEdit.salary_amount?.toString() || '',
        hourly_rate: staffToEdit.hourly_rate?.toString() || '',
        skills: staffToEdit.skills?.join(', ') || '',
        expertise_areas: staffToEdit.expertise_areas?.join(', ') || '',
        is_active: staffToEdit.is_active !== false,
        availability_status: staffToEdit.availability_status || 'available',
        address: staffToEdit.address || '',
        city: staffToEdit.city || '',
        state: staffToEdit.state || '',
        pincode: staffToEdit.pincode || '',
        notes: staffToEdit.notes || '',
        education: staffToEdit.education || { degree: '', institution: '', year: '' },
        emergency_contact: staffToEdit.emergency_contact || { name: '', relationship: '', phone: '' },
        certifications: staffToEdit.certifications || [],
        allowed_modules: staffToEdit.allowed_modules || ['staff-dashboard', 'works', 'customers', 'services', 'leads'],
        detailed_permissions: staffToEdit.detailed_permissions || {}
      });
    } else {
      // Initialize default permissions for new staff
      const defaults: any = {};
      Object.keys(PERMISSION_CONFIG).forEach(key => {
        defaults[key] = {};
        // Default to stricter permissions? Or allow 'create' but not 'delete'?
        // Let's set some sensible defaults
        if (key === 'works') defaults[key] = { create: true, view_revenue: true };
        if (key === 'customers') defaults[key] = { create: true, view_contact: true };
      });
      setFormData(prev => ({ ...prev, detailed_permissions: defaults }));
    }
  }, [staffToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const staffData = {
        user_id: user!.id,
        name: formData.name,
        email: formData.email || null,
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
        allowed_modules: formData.allowed_modules,
        detailed_permissions: formData.detailed_permissions,
        updated_at: new Date().toISOString()
      };

      if (staffToEdit) {
        const { error } = await supabase
          .from('staff_members')
          .update(staffData)
          .eq('id', staffToEdit.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('staff_members').insert(staffData);
        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving staff member:', error);
      alert('Failed to save staff member');
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

  const togglePermission = (module: string, action: string) => {
    setFormData(prev => {
      const currentModulePerms = prev.detailed_permissions?.[module] || {};
      // Toggle boolean. If undefined, assume false (so toggle to true).
      const newValue = !currentModulePerms[action];

      return {
        ...prev,
        detailed_permissions: {
          ...prev.detailed_permissions,
          [module]: {
            ...currentModulePerms,
            [action]: newValue
          }
        }
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 p-6 border-b border-gray-200 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users size={28} />
            {staffToEdit ? (mode === 'permissions' ? `Permissions: ${staffToEdit.name}` : 'Edit Staff Member') : 'Add New Staff Member'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {showAll && (
            <>
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
                      readOnly={!staffToEdit}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {staffToEdit ? 'Employee identifier' : 'Auto-generated based on settings'}
                    </p>
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
            </>
          )}

          {/* Access Permissions - Always visible in all modes, but if mode=full, it's just one section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Shield size={20} className="text-emerald-600" />
              Permissions & Access Control
            </h3>

            <div className="space-y-4">
              {/* Module Access */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Allowed Modules</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['leads', 'customers', 'services', 'works', 'accounting', 'reminders', 'reports', 'invoices'].map(moduleId => (
                    <label key={moduleId} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowed_modules?.includes(moduleId)}
                        onChange={(e) => {
                          const current = formData.allowed_modules || [];
                          const updated = e.target.checked
                            ? [...current, moduleId]
                            : current.filter(m => m !== moduleId);
                          setFormData({ ...formData, allowed_modules: updated });
                        }}
                        className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {moduleId}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Granular Permissions */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Granular Restrictions</h4>
                <div className="space-y-6">
                  {/* Dynamic Rendering of Permissions */}
                  {Object.entries(PERMISSION_CONFIG).map(([moduleKey, config]) => {
                    const ModuleIcon = config.icon || Lock;
                    return (
                      <div key={moduleKey} className="border-b border-gray-100 pb-3 last:border-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                          <ModuleIcon size={12} className="text-indigo-500" />
                          {config.label}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {config.actions.map(action => (
                            <label key={action.key} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox"
                                checked={formData.detailed_permissions?.[moduleKey]?.[action.key] === true}
                                onChange={() => togglePermission(moduleKey, action.key)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 w-4 h-4"
                              />
                              <span className="text-sm text-gray-700">{action.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {showAll && (
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
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
