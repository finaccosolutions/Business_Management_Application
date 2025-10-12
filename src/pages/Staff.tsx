// src/pages/Staff.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Users,
  Trash2,
  Mail,
  Phone,
  DollarSign,
  Award,
  Eye,
  X,
  Search,
  Filter,
  CheckCircle,
  Calendar,
  UserCheck,
  Briefcase,
} from 'lucide-react';
import StaffDetails from '../components/StaffDetails';
import StaffFormModal from '../components/StaffFormModal';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';


interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  role: string;
  department: string | null;
  joining_date: string | null;
  employment_type: string;
  salary_method: string;
  salary_amount: number | null;
  hourly_rate: number | null;
  is_active: boolean;
  availability_status: string;
  skills: string[] | null;
  expertise_areas: string[] | null;
  education: any;
  emergency_contact: any;
  certifications: any[] | null;
  notes: string | null;
  created_at: string;
}


export default function Staff() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  
  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    department: '',
    role: '',
    employmentType: '',
    availabilityStatus: '',
    isActive: 'all',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const staffRes = await supabase
        .from('staff_members')
        .select('*')
        .order('created_at', { ascending: false });

      if (staffRes.error) throw staffRes.error;

      setStaff(staffRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    showConfirmation({
      title: 'Delete Staff Member',
      message: 'Are you sure you want to delete this staff member? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('staff_members').delete().eq('id', id);
          if (error) throw error;
          fetchData();
          toast.success('Staff member deleted successfully');
        } catch (error) {
          console.error('Error deleting staff member:', error);
          toast.error('Failed to delete staff member');
        }
      }
    });
  };

  const handleEdit = (staffMember: StaffMember) => {
    setEditingStaff(staffMember);
    setShowModal(true);
  };

  // Statistics
  const stats = {
    total: staff.length,
    active: staff.filter((s) => s.is_active).length,
    onLeave: staff.filter((s) => s.availability_status === 'on-leave').length,
    available: staff.filter(
      (s) => s.availability_status === 'available' && s.is_active
    ).length,
  };

  // Get unique values for filters
  const departments = Array.from(
    new Set(staff.map((s) => s.department).filter(Boolean))
  ) as string[];
  const roles = Array.from(new Set(staff.map((s) => s.role)));

  const filteredStaff = staff.filter((member) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        member.name.toLowerCase().includes(query) ||
        member.email?.toLowerCase().includes(query) ||
        member.employee_id?.toLowerCase().includes(query) ||
        member.department?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Department filter
    if (filters.department && member.department !== filters.department) return false;

    // Role filter
    if (filters.role && member.role !== filters.role) return false;

    // Employment type filter
    if (filters.employmentType && member.employment_type !== filters.employmentType)
      return false;

    // Availability filter
    if (
      filters.availabilityStatus &&
      member.availability_status !== filters.availabilityStatus
    )
      return false;

    // Active status filter
    if (filters.isActive !== 'all') {
      const isActive = filters.isActive === 'active';
      if (member.is_active !== isActive) return false;
    }

    return true;
  });


  const calculateTenure = (joiningDate: string | null) => {
    if (!joiningDate) return null;
    const start = new Date(joiningDate);
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    
    if (years > 0) {
      return `${years}y ${remainingMonths}m`;
    }
    return `${months}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your team members, assignments, and tasks
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Staff</span>
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.total}</p>
            </div>
            <Users className="w-12 h-12 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.active}</p>
            </div>
            <CheckCircle className="w-12 h-12 text-emerald-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border-2 border-yellow-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">On Leave</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.onLeave}</p>
            </div>
            <Calendar className="w-12 h-12 text-yellow-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border-2 border-teal-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available</p>
              <p className="text-3xl font-bold text-teal-600 mt-2">{stats.available}</p>
            </div>
            <UserCheck className="w-12 h-12 text-teal-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search Bar */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, employee ID, or department..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-5 h-5" />
            <span>Filters</span>
            {Object.values(filters).some((v) => v && v !== 'all') && (
              <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full">
                {Object.values(filters).filter((v) => v && v !== 'all').length}
              </span>
            )}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <select
                value={filters.department}
                onChange={(e) =>
                  setFilters({ ...filters, department: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Roles</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employment Type
              </label>
              <select
                value={filters.employmentType}
                onChange={(e) =>
                  setFilters({ ...filters, employmentType: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Types</option>
                <option value="full-time">Full Time</option>
                <option value="part-time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Availability
              </label>
              <select
                value={filters.availabilityStatus}
                onChange={(e) =>
                  setFilters({ ...filters, availabilityStatus: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="on-leave">On Leave</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.isActive}
                onChange={(e) =>
                  setFilters({ ...filters, isActive: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Staff</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <div className="md:col-span-5 flex justify-end">
              <button
                onClick={() =>
                  setFilters({
                    department: '',
                    role: '',
                    employmentType: '',
                    availabilityStatus: '',
                    isActive: 'all',
                  })
                }
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </div> 

      {/* Staff Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredStaff.map((member) => {
          const tenure = calculateTenure(member.joining_date);

          return (
            <div
              key={member.id}
              className={`bg-white rounded-xl shadow-sm border-2 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.01] flex flex-col ${
                member.is_active ? 'border-emerald-200' : 'border-gray-200 opacity-75'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-3 rounded-lg ${
                      member.is_active ? 'bg-emerald-50' : 'bg-gray-50'
                    }`}
                  >
                    <Users
                      className={`w-7 h-7 ${
                        member.is_active ? 'text-emerald-600' : 'text-gray-400'
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">
                      {member.name}
                    </h3>
                    {member.employee_id && (
                      <p className="text-xs text-gray-500">{member.employee_id}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs text-gray-500 uppercase font-semibold bg-gray-100 px-2 py-1 rounded">
                  {member.role}
                </span>
                {member.department && (
                  <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded font-medium">
                    {member.department}
                  </span>
                )}
                <span
                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                    member.is_active
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {member.is_active ? 'Active' : 'Inactive'}
                </span>
                <span
                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                    member.availability_status === 'available'
                      ? 'bg-green-100 text-green-700'
                      : member.availability_status === 'busy'
                      ? 'bg-orange-100 text-orange-700'
                      : member.availability_status === 'on-leave'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {member.availability_status.replace('-', ' ')}
                </span>
              </div>

              {/* Contact Info */}
              <div className="space-y-2 mb-4 flex-grow">
                {member.email && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </div>
                )}
                {member.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                    <span>{member.phone}</span>
                  </div>
                )}
                
                {/* Employment Info */}
                {member.employment_type && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Briefcase className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                    <span className="capitalize">{member.employment_type.replace('_', ' ')}</span>
                    {tenure && <span className="ml-2 text-xs text-gray-500">({tenure})</span>}
                  </div>
                )}

                {/* Salary Info */}
                {member.salary_amount && (
                  <div className="flex items-center text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg mt-3">
                    <DollarSign className="w-5 h-5 mr-1" />
                    <span className="text-base">
                      ₹{member.salary_amount}
                      {member.salary_method === 'hourly' && '/hr'}
                      {member.salary_method === 'monthly' && '/mo'}
                      {member.salary_method === 'commission' && '%'}
                    </span>
                  </div>
                )}

                {/* Skills */}
                {member.skills && member.skills.length > 0 && (
                  <div className="flex items-start text-sm text-gray-600 mt-3">
                    <Award className="w-4 h-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex flex-wrap gap-1">
                      {member.skills.slice(0, 3).map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                      {member.skills.length > 3 && (
                        <span className="text-xs text-gray-500 px-2 py-1">
                          +{member.skills.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Buttons - fixed at bottom */}
              <div className="flex space-x-2 pt-4 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => {
                    setSelectedStaffId(member.id);
                    setShowDetailsModal(true);
                  }}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors font-medium"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Details</span>
                </button>
                <button
                  onClick={() => handleDelete(member.id)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  title="Delete staff member"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredStaff.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No staff members found
            </h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || Object.values(filters).some((v) => v && v !== 'all')
                ? 'Try adjusting your search or filters'
                : 'Add your first team member to start managing work assignments'}
            </p>
            {!searchQuery && !Object.values(filters).some((v) => v && v !== 'all') && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Staff Member</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Staff Form Modal */}
      {showModal && (
        <StaffFormModal
          onClose={() => {
            setShowModal(false);
            setEditingStaff(null);
          }}
          onSuccess={() => {
            fetchData();
          }}
          editingStaff={editingStaff}
        />
      )}

      {/* Staff Details Modal */}
      {showDetailsModal && selectedStaffId && (
        <StaffDetails
          staffId={selectedStaffId}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedStaffId(null);
          }}
          onEdit={() => {
            const staffToEdit = staff.find((s) => s.id === selectedStaffId);
            if (staffToEdit) {
              setShowDetailsModal(false);
              handleEdit(staffToEdit);
            }
          }}
        />
      )}

    </div>
  );
}
