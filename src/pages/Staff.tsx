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
  Search,
  Filter,
  Edit2,
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
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

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

  const handleEdit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStaffId(id);
  };

  const handleEditSuccess = () => {
    setEditingStaffId(null);
    fetchData();
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Staff Management</h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-48"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Filters"
          >
            <Filter className="w-4 h-4" />
            {Object.values(filters).some((v) => v && v !== 'all') && (
              <span className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                {Object.values(filters).filter((v) => v && v !== 'all').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all"
            title="Add Staff"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <select
                value={filters.department}
                onChange={(e) =>
                  setFilters({ ...filters, department: e.target.value })
                }
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
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
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
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
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Employment Type
              </label>
              <select
                value={filters.employmentType}
                onChange={(e) =>
                  setFilters({ ...filters, employmentType: e.target.value })
                }
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Types</option>
                <option value="full-time">Full Time</option>
                <option value="part-time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Availability
              </label>
              <select
                value={filters.availabilityStatus}
                onChange={(e) =>
                  setFilters({ ...filters, availabilityStatus: e.target.value })
                }
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="on-leave">On Leave</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.isActive}
                onChange={(e) =>
                  setFilters({ ...filters, isActive: e.target.value })
                }
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
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
                className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sm:hidden bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
      </div> 

      {filteredStaff.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
          <Users size={40} className="mx-auto text-gray-400 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No staff members found</h3>
          <p className="text-sm text-gray-600 mb-6">
            {searchQuery || Object.values(filters).some((v) => v && v !== 'all')
              ? 'Try adjusting your search or filter criteria'
              : 'Get started by adding your first staff member'}
          </p>
          {!searchQuery && !Object.values(filters).some((v) => v && v !== 'all') && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              Add Your First Staff Member
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredStaff.map((member) => {
            const tenure = calculateTenure(member.joining_date);

            return (
              <div
                key={member.id}
                onClick={() => {
                  setSelectedStaffId(member.id);
                  setShowDetailsModal(true);
                }}
                className={`bg-white rounded-lg shadow-sm border-l-4 ${
                  member.is_active ? 'border-l-emerald-500 hover:bg-emerald-50/30' : 'border-l-gray-400 hover:bg-gray-50/30'
                } border-t border-r border-b border-gray-200 transition-all cursor-pointer hover:shadow-md`}
              >
                <div className="p-2 sm:p-3">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 text-xs sm:text-sm font-bold ${
                        member.is_active ? 'bg-emerald-500' : 'bg-gray-400'
                      }`}>
                        {member.name?.charAt(0).toUpperCase() || 'S'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-xs sm:text-sm truncate flex-shrink-0" title={member.name}>
                            {member.name}
                          </h3>
                          {member.employee_id && (
                            <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded whitespace-nowrap">
                              {member.employee_id}
                            </span>
                          )}
                          {member.department && (
                            <span className="text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                              {member.department}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 text-xs rounded-full font-medium whitespace-nowrap ${
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {member.email && (
                            <a
                              href={`mailto:${member.email}`}
                              className="text-xs text-blue-600 hover:underline truncate min-w-0"
                              onClick={(e) => e.stopPropagation()}
                              title={member.email}
                            >
                              {member.email}
                            </a>
                          )}
                          {member.phone && (
                            <span className="text-xs text-gray-600 whitespace-nowrap" title={member.phone}>
                              {member.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                      {member.salary_amount && (
                        <div className="flex items-center gap-0.5 bg-emerald-50 rounded px-1 sm:px-1.5 py-0.5" title="Salary">
                          <DollarSign size={12} className="text-emerald-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                            ₹{((member.salary_amount || 0) / 1000).toFixed(0)}k
                          </span>
                        </div>
                      )}
                      {member.skills && member.skills.length > 0 && (
                        <div className="flex items-center gap-0.5 bg-purple-50 rounded px-1 sm:px-1.5 py-0.5" title="Skills">
                          <Award size={12} className="text-purple-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-purple-700">{member.skills.length}</span>
                        </div>
                      )}
                      {tenure && (
                        <div className="flex items-center gap-0.5 bg-orange-50 rounded px-1 sm:px-1.5 py-0.5" title="Tenure">
                          <span className="text-xs font-bold text-orange-700">{tenure}</span>
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStaffId(member.id);
                          setShowDetailsModal(true);
                        }}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors flex-shrink-0"
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={(e) => handleEdit(member.id, e)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors flex-shrink-0"
                        title="Edit Staff"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(member.id);
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                        title="Delete Staff"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <StaffFormModal
          onClose={() => {
            setShowModal(false);
          }}
          onSuccess={() => {
            fetchData();
          }}
          editingStaff={undefined}
        />
      )}

      {editingStaffId && (
        <StaffFormModal
          onClose={() => {
            setEditingStaffId(null);
          }}
          onSuccess={handleEditSuccess}
          editingStaff={staff.find((s) => s.id === editingStaffId)}
        />
      )}

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
              setEditingStaffId(selectedStaffId);
            }
          }}
        />
      )}

    </div>
  );
}
