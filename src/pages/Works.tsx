import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Clock,
  Briefcase,
  Filter,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  Activity as ActivityIcon,
  Calendar as CalendarIcon,
  LayoutGrid
} from 'lucide-react';

import WorkDetails from '../components/works/WorkDetailsMain';
import WorkTile from '../components/works/WorkTile';
import CustomerDetails from '../components/CustomerDetails';
import ServiceDetails from '../components/ServiceDetails';
import WorkFilters from '../components/WorkFilters';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';
import { AssignStaffModal, ReassignReasonModal } from '../components/works/WorkDetailsModals';
import AdminWorkMonitoring from './AdminWorkMonitoring';
import AdminWorkBoard from '../components/works/AdminWorkBoard';
import WorkCalendar from './WorkCalendar';

interface Work {
  id: string;
  customer_id: string;
  service_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  is_recurring_instance: boolean;
  parent_service_id: string | null;
  instance_date: string | null;
  billing_status: string;
  billing_amount: number | null;
  estimated_hours: number | null;
  actual_duration_hours: number | null;
  customers: { name: string };
  services: { name: string; is_recurring: boolean };
  staff_members: { name: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  is_recurring: boolean;
  recurrence_type: string | null;
  recurrence_day: number | null;
  default_price: number | null;
  estimated_duration_value: number | null;
  estimated_duration_unit: string | null;
  recurrence_start_date: string | null;
  custom_fields: any;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

type ViewType = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue' | 'monitoring';
type ModuleTab = 'list' | 'monitor' | 'board' | 'schedule';

interface WorksProps {
  isDetailsView?: boolean;
  workId?: string;
  onNavigate?: (page: string, params?: any) => void;
}

export default function Works({ isDetailsView, workId, onNavigate }: WorksProps = {}) {
  const { user, permissions, role } = useAuth();

  // -- State Definitions --
  const [works, setWorks] = useState<Work[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filter States
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterBillingStatus, setFilterBillingStatus] = useState('');

  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);

  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  // Assignment Modal States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReassignReason, setShowReassignReason] = useState(false);
  const [selectedWorkForAssignment, setSelectedWorkForAssignment] = useState<Work | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const [selectedStaffForReassign, setSelectedStaffForReassign] = useState('');

  // Module Level Tabs
  const [moduleTab, setModuleTab] = useState<ModuleTab>('list');

  // Permissions Checks
  const canViewMonitor = role === 'admin' || permissions?.works?.view_monitor;
  const canViewBoard = role === 'admin' || permissions?.works?.view_board;
  const canViewSchedule = role === 'admin' || permissions?.works?.view_schedule;

  // -- Effects --

  useEffect(() => {
    // Handle props-based initialization
    if (isDetailsView && workId) {
      setSelectedWork(workId);
    }

    const navigationState = sessionStorage.getItem('searchNavigationState');
    if (navigationState) {
      try {
        const state = JSON.parse(navigationState);
        if (state.itemType === 'work' && state.shouldShowDetails) {
          setSelectedWork(state.selectedId);
          sessionStorage.removeItem('searchNavigationState');
        }
      } catch (error) {
        console.error('Error reading navigation state:', error);
      }
    }

    const filterStatus = sessionStorage.getItem('workFilterStatus');
    if (filterStatus) {
      setActiveView(filterStatus as ViewType);
      sessionStorage.removeItem('workFilterStatus');
    }
  }, [isDetailsView, workId]);


  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (filterCategory) {
      loadSubcategories(filterCategory);
    } else {
      setSubcategories([]);
      setFilterSubcategory('');
    }
  }, [filterCategory]);

  const loadSubcategories = async (categoryId: string) => {
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('*')
        .eq('parent_id', categoryId)
        .order('name');

      if (error) throw error;
      setSubcategories(data || []);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [worksResult, customersResult, servicesResult, staffResult, categoriesResult] = await Promise.all([
        supabase
          .from('works')
          .select(`
            *,
            customers(name),
            services!service_id(name, is_recurring),
            staff_members(name),
            work_recurring_instances(
              id,
              status,
              all_tasks_completed,
              recurring_period_tasks(id, title, status, due_date)
            ),
            work_tasks(id, title, status, due_date)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('services').select('*').order('name'),
        supabase.from('staff_members').select('id, name, role').eq('is_active', true).order('name'),
        supabase.from('service_categories').select('*').eq('level', 0).order('name'),
      ]);

      if (worksResult.error) throw worksResult.error;
      if (customersResult.error) throw customersResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (staffResult.error) throw staffResult.error;

      // Calculate aggregated status for recurring works based on periods
      const worksWithStatus = (worksResult.data || []).map((work: any) => {
        if (work.is_recurring && work.work_recurring_instances && work.work_recurring_instances.length > 0) {
          const periods = work.work_recurring_instances;
          const hasPending = periods.some((p: any) => p.status === 'pending');
          const hasInProgress = periods.some((p: any) => p.status === 'in_progress');
          const hasOverdue = periods.some((p: any) => p.status === 'overdue');
          const allCompleted = periods.every((p: any) => p.all_tasks_completed === true);

          // Determine overall work status based on periods
          let overallStatus = 'completed';
          if (hasOverdue) overallStatus = 'overdue';
          else if (hasInProgress) overallStatus = 'in_progress';
          else if (hasPending) overallStatus = 'pending';
          else if (!allCompleted) overallStatus = 'in_progress';

          // For recurring works, flatten all period tasks into work_tasks array for display
          const allPeriodTasks = periods.flatMap((p: any) => p.recurring_period_tasks || []);

          return { ...work, status: overallStatus, work_tasks: allPeriodTasks };
        }
        return work;
      });

      setWorks(worksWithStatus);
      setCustomers(customersResult.data || []);
      setServices(servicesResult.data || []);
      setStaffMembers(staffResult.data || []);
      setCategories(categoriesResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!permissions?.works?.delete) {
      toast.error("You don't have permission to delete works");
      return;
    }

    showConfirmation({
      title: 'Delete Work',
      message: 'Are you sure you want to delete this work? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('works').delete().eq('id', id);
          if (error) throw error;
          fetchData();
          toast.success('Work deleted successfully');
        } catch (error) {
          console.error('Error deleting work:', error);
          toast.error('Failed to delete work');
        }
      }
    });
  };

  const handleEdit = (work: Work) => {
    if (onNavigate) {
      onNavigate('create-work', { id: work.id });
    }
  };

  const handleAssignClick = (work: Work) => {
    setSelectedWorkForAssignment(work);
    setShowAssignModal(true);
  };

  const handleAssignStaff = async (staffId: string) => {
    if (!selectedWorkForAssignment) return;
    try {
      await supabase
        .from('work_assignments')
        .update({ is_current: false })
        .eq('work_id', selectedWorkForAssignment.id)
        .eq('is_current', true);

      const { error } = await supabase.from('work_assignments').insert({
        work_id: selectedWorkForAssignment.id,
        staff_member_id: staffId,
        assigned_by: user!.id,
        status: 'assigned',
        is_current: true,
      });

      if (error) throw error;

      await supabase
        .from('works')
        .update({
          assigned_to: staffId,
          assigned_date: new Date().toISOString(),
        })
        .eq('id', selectedWorkForAssignment.id);

      setShowAssignModal(false);
      setSelectedWorkForAssignment(null);
      fetchData();
      toast.success('Work assigned successfully!');
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast.error('Failed to assign staff');
    }
  };

  const handleReassignWithReason = async () => {
    if (!selectedStaffForReassign || !selectedWorkForAssignment) return;

    try {
      const currentStaffId = selectedWorkForAssignment.assigned_to;

      await supabase
        .from('work_assignments')
        .update({ is_current: false })
        .eq('work_id', selectedWorkForAssignment.id)
        .eq('is_current', true);

      const { error } = await supabase.from('work_assignments').insert({
        work_id: selectedWorkForAssignment.id,
        staff_member_id: selectedStaffForReassign,
        assigned_by: user!.id,
        reassigned_from: currentStaffId,
        reassignment_reason: reassignReason || null,
        status: 'assigned',
        is_current: true,
      });

      if (error) throw error;

      await supabase
        .from('works')
        .update({
          assigned_to: selectedStaffForReassign,
          assigned_date: new Date().toISOString(),
        })
        .eq('id', selectedWorkForAssignment.id);

      setShowReassignReason(false);
      setShowAssignModal(false);
      setReassignReason('');
      setSelectedStaffForReassign('');
      setSelectedWorkForAssignment(null);
      fetchData();
      toast.success('Work reassigned successfully!');
    } catch (error) {
      console.error('Error reassigning staff:', error);
      toast.error('Failed to reassign staff');
    }
  };

  // Calculate statistics
  const stats = {
    total: works.length,
    pending: works.filter((w) => w.status === 'pending').length,
    inProgress: works.filter((w) => w.status === 'in_progress').length,
    completed: works.filter((w) => w.status === 'completed').length,
    overdue: works.filter((w) => {
      if (w.status === 'completed') return false;
      return w.due_date && new Date(w.due_date) < new Date();
    }).length,
    totalRevenue: works.reduce((sum, w) => sum + (w.billing_amount || 0), 0),
    notBilled: works.filter((w) => w.billing_status === 'not_billed').length,
  };

  // Filter works based on active view and search
  const filteredWorks = works.filter((work) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        work.title.toLowerCase().includes(query) ||
        work.customers.name.toLowerCase().includes(query) ||
        work.services.name.toLowerCase().includes(query) ||
        (work.description && work.description.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Status filter
    if (activeView !== 'all' && activeView !== 'monitoring') {
      if (activeView === 'overdue') {
        if (work.status === 'completed' || !work.due_date || new Date(work.due_date) >= new Date()) {
          return false;
        }
      } else if (work.status !== activeView) {
        return false;
      }
    }

    // Customer filter
    if (filterCustomer && work.customer_id !== filterCustomer) return false;

    // Service filter
    if (filterService && work.service_id !== filterService) return false;

    // Category filter
    if (filterCategory) {
      const service = services.find(s => s.id === work.service_id);
      if (!service || service.category_id !== filterCategory) return false;
    }

    // Subcategory filter
    if (filterSubcategory) {
      const service = services.find(s => s.id === work.service_id);
      if (!service || service.subcategory_id !== filterSubcategory) return false;
    }

    // Priority filter
    if (filterPriority && work.priority !== filterPriority) return false;

    // Billing status filter
    if (filterBillingStatus && work.billing_status !== filterBillingStatus) return false;

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  // Detail Views
  if (selectedWork) {
    return (
      <WorkDetails
        workId={selectedWork}
        onBack={() => setSelectedWork(null)}
        onUpdate={fetchData}
        onEdit={() => {
          const work = works.find(w => w.id === selectedWork);
          if (work) {
            setSelectedWork(null);
            handleEdit(work);
          }
        }}
        onNavigateToCustomer={(customerId) => {
          setSelectedWork(null);
          setSelectedCustomerId(customerId);
        }}
        onNavigateToService={(serviceId) => {
          setSelectedWork(null);
          setSelectedServiceId(serviceId);
        }}
      />
    );
  }

  if (selectedCustomerId) {
    return (
      <CustomerDetails
        customerId={selectedCustomerId}
        onBack={() => setSelectedCustomerId(null)}
        onUpdate={fetchData}
        onNavigateToService={(serviceId) => {
          setSelectedCustomerId(null);
          setSelectedServiceId(serviceId);
        }}
        onNavigateToWork={(workId) => {
          setSelectedCustomerId(null);
          setSelectedWork(workId);
        }}
      />
    );
  }

  if (selectedServiceId) {
    return (
      <ServiceDetails
        serviceId={selectedServiceId}
        onBack={() => setSelectedServiceId(null)}
        onNavigateToCustomer={(customerId) => {
          setSelectedServiceId(null);
          setSelectedCustomerId(customerId);
        }}
        onNavigateToWork={(workId) => {
          setSelectedServiceId(null);
          setSelectedWork(workId);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">
      {/* Works Header & Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Works</h1>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">

            {/* Search & Filter - Only for List Module */}
            {moduleTab === 'list' && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent w-full sm:w-48"
                  />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center justify-center p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Filters"
                >
                  <Filter className="w-4 h-4" />
                  {(filterCustomer || filterService || filterCategory || filterPriority || filterBillingStatus) && (
                    <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                      {[filterCustomer, filterService, filterCategory, filterPriority, filterBillingStatus].filter(Boolean).length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Actions: Add Work */}
            {permissions?.works?.create !== false && (
              <button
                onClick={() => onNavigate?.('create-work')}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-medium text-sm w-full sm:w-auto justify-center"
              >
                <Plus size={18} />
              </button>
            )}

            {/* Module Tabs - Placed last as requested */}
            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setModuleTab('list')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap
                    ${moduleTab === 'list'
                    ? 'bg-white shadow text-orange-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
              >
                <Briefcase size={16} />
                List
              </button>

              {canViewMonitor && (
                <button
                  onClick={() => setModuleTab('monitor')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap
                        ${moduleTab === 'monitor'
                      ? 'bg-white shadow text-purple-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                  <ActivityIcon size={16} />
                  Monitor
                </button>
              )}
              {canViewBoard && (
                <button
                  onClick={() => setModuleTab('board')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap
                        ${moduleTab === 'board'
                      ? 'bg-white shadow text-blue-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                  <ClipboardList size={16} />
                  Board
                </button>
              )}
              {canViewSchedule && (
                <button
                  onClick={() => setModuleTab('schedule')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap
                        ${moduleTab === 'schedule'
                      ? 'bg-white shadow text-indigo-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                >
                  <CalendarIcon size={16} />
                  Schedule
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Content based on Module Tab */}
      {moduleTab === 'monitor' && canViewMonitor ? (
        <AdminWorkMonitoring />
      ) : moduleTab === 'board' && canViewBoard ? (
        <AdminWorkBoard />
      ) : moduleTab === 'schedule' && canViewSchedule ? (
        <WorkCalendar onNavigate={onNavigate} />
      ) : (
        /* LIST VIEW CONTENT */
        <>
          <div className="space-y-4">

            {/* Status Tabs and Filter Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex flex-col gap-3">
                {/* Status Tabs - Compact */}
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={() => setActiveView('all')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeView === 'all'
                      ? 'bg-blue-50 text-blue-600 border-2 border-blue-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <Briefcase size={16} />
                    <span className="hidden sm:inline">All</span>
                    <span className="sm:hidden">({stats.total})</span>
                    <span className="hidden sm:inline">({stats.total})</span>
                  </button>
                  <button
                    onClick={() => setActiveView('pending')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeView === 'pending'
                      ? 'bg-yellow-50 text-yellow-600 border-2 border-yellow-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <Clock size={16} />
                    <span>Pending</span>
                    <span className="hidden sm:inline">({stats.pending})</span>
                  </button>
                  <button
                    onClick={() => setActiveView('in_progress')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeView === 'in_progress'
                      ? 'bg-blue-50 text-blue-600 border-2 border-blue-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <Clock size={16} />
                    <span>In Progress</span>
                    <span className="hidden sm:inline">({stats.inProgress})</span>
                  </button>
                  <button
                    onClick={() => setActiveView('completed')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeView === 'completed'
                      ? 'bg-green-50 text-green-600 border-2 border-green-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <CheckCircle size={16} />
                    <span>Completed</span>
                    <span className="hidden sm:inline">({stats.completed})</span>
                  </button>
                  <button
                    onClick={() => setActiveView('overdue')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeView === 'overdue'
                      ? 'bg-red-50 text-red-600 border-2 border-red-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <AlertCircle size={16} />
                    <span>Overdue</span>
                    <span className="hidden sm:inline">({stats.overdue})</span>
                  </button>
                </div>

                {/* Collapsible Additional Filters */}
                {showFilters && (
                  <WorkFilters
                    filterCustomer={filterCustomer}
                    setFilterCustomer={setFilterCustomer}
                    filterCategory={filterCategory}
                    setFilterCategory={setFilterCategory}
                    filterService={filterService}
                    setFilterService={setFilterService}
                    filterPriority={filterPriority}
                    setFilterPriority={setFilterPriority}
                    filterBillingStatus={filterBillingStatus}
                    setFilterBillingStatus={setFilterBillingStatus}
                    customers={customers}
                    categories={categories}
                    allServices={services}
                  />
                )}
              </div>
            </div>

            {/* Works List / Empty State */}
            {filteredWorks.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No works found</h3>
                <p className="text-gray-600 mb-6">
                  {activeView === 'all' ? 'Get started by adding your first work' : 'No works match this filter'}
                </p>
                {activeView === 'all' && permissions?.works?.create !== false && (
                  <button
                    onClick={() => onNavigate?.('create-work')}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Plus size={20} />
                    Add Your First Work
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredWorks.map((work) => (
                  <WorkTile
                    key={work.id}
                    work={work}
                    onEdit={handleEdit}
                    onDelete={permissions?.works?.delete ? handleDelete : undefined}
                    onAssign={(permissions?.works?.edit || permissions?.works?.create) ? handleAssignClick : undefined}
                    onClick={() => setSelectedWork(work.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Assignment Modals */}
          {selectedWorkForAssignment && (
            <>
              <AssignStaffModal
                isOpen={showAssignModal && !showReassignReason}
                onClose={() => {
                  setShowAssignModal(false);
                  setSelectedWorkForAssignment(null);
                }}
                staff={staffMembers}
                work={selectedWorkForAssignment}
                onAssign={handleAssignStaff}
                onRequestReassign={(staffId) => {
                  setSelectedStaffForReassign(staffId);
                  setShowReassignReason(true);
                }}
              />

              <ReassignReasonModal
                isOpen={showReassignReason}
                onClose={() => {
                  setShowReassignReason(false);
                  setReassignReason('');
                  setSelectedStaffForReassign('');
                }}
                reason={reassignReason}
                setReason={setReassignReason}
                onConfirm={handleReassignWithReason}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
