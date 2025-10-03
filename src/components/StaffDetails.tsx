import { useState, useEffect } from 'react';
import { Bolt Database } from '../lib/Bolt Database';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  User,
  Briefcase,
  Clock,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Calendar,
  Award,
  Activity,
  FileText,
  Users,
  Target,
  BarChart3,
} from 'lucide-react';

interface StaffDetailsProps {
  staffId: string;
  onClose: () => void;
  onUpdate: () => void;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  employee_id: string;
  joining_date: string;
  department: string;
  expertise_areas: string[];
  hourly_rate: number;
  is_active: boolean;
  availability_status: string;
  employment_type: string;
  skills: string[];
  notes: string;
}

interface WorkStats {
  total_assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  in_progress: number;
  completed_on_time: number;
  average_completion_time: number;
  on_time_percentage: number;
}

interface Work {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  completed_at: string;
  customers: { name: string };
  services: { name: string };
  actual_duration_hours: number;
  started_at: string;
}

type TabType = 'overview' | 'works' | 'performance' | 'timeline' | 'delegated';

export default function StaffDetails({ staffId, onClose, onUpdate }: StaffDetailsProps) {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [workStats, setWorkStats] = useState<WorkStats>({
    total_assigned: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    in_progress: 0,
    completed_on_time: 0,
    average_completion_time: 0,
    on_time_percentage: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (staffId) {
      fetchStaffDetails();
    }
  }, [staffId]);

  const fetchStaffDetails = async () => {
    try {
      // Fetch staff member details
      const { data: staffData, error: staffError } = await Bolt Database
        .from('staff_members')
        .select('*')
        .eq('id', staffId)
        .single();

      if (staffError) throw staffError;

      // Fetch all works assigned to this staff member
      const { data: worksData, error: worksError } = await Bolt Database
        .from('works')
        .select('*, customers(name), services(name)')
        .eq('assigned_to', staffId)
        .order('created_at', { ascending: false });

      if (worksError) throw worksError;

      setStaff(staffData);
      setWorks(worksData || []);

      // Calculate statistics
      const stats = calculateWorkStats(worksData || []);
      setWorkStats(stats);
    } catch (error: any) {
      console.error('Error fetching staff details:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateWorkStats = (worksData: Work[]): WorkStats => {
    const total_assigned = worksData.length;
    const completed = worksData.filter(w => w.status === 'completed').length;
    const pending = worksData.filter(w => w.status === 'pending').length;
    const in_progress = worksData.filter(w => w.status === 'in_progress').length;
    const overdue = worksData.filter(w => w.status === 'overdue').length;

    // Calculate on-time completion
    const completedWorks = worksData.filter(w => w.status === 'completed');
    const completed_on_time = completedWorks.filter(w => {
      if (!w.due_date || !w.completed_at) return false;
      return new Date(w.completed_at) <= new Date(w.due_date);
    }).length;

    const on_time_percentage = completed > 0 ? (completed_on_time / completed) * 100 : 0;

    // Calculate average completion time
    const completedWithDuration = completedWorks.filter(w => w.actual_duration_hours > 0);
    const average_completion_time =
      completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum, w) => sum + w.actual_duration_hours, 0) /
          completedWithDuration.length
        : 0;

    return {
      total_assigned,
      completed,
      pending,
      overdue,
      in_progress,
      completed_on_time,
      average_completion_time,
      on_time_percentage,
    };
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'works', label: 'Works', icon: Briefcase },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'timeline', label: 'Timeline', icon: Calendar },
    { id: 'delegated', label: 'Delegated', icon: Users },
  ];

  if (loading || !staff) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-600 to-emerald-700">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
              <User size={32} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{staff.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-emerald-100">{staff.role}</span>
                {staff.employee_id && (
                  <>
                    <span className="text-emerald-200">•</span>
                    <span className="text-emerald-100">ID: {staff.employee_id}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-6 bg-gray-50 border-b border-gray-200">
          <StatCard
            icon={Briefcase}
            label="Total Works"
            value={workStats.total_assigned}
            color="blue"
          />
          <StatCard
            icon={CheckCircle}
            label="Completed"
            value={workStats.completed}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="In Progress"
            value={workStats.in_progress}
            color="yellow"
          />
          <StatCard
            icon={AlertCircle}
            label="Overdue"
            value={workStats.overdue}
            color="red"
          />
          <StatCard
            icon={Target}
            label="On-Time %"
            value={`${workStats.on_time_percentage.toFixed(0)}%`}
            color="teal"
          />
          <StatCard
            icon={Activity}
            label="Avg. Time"
            value={`${workStats.average_completion_time.toFixed(1)}h`}
            color="purple"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-emerald-600 text-emerald-600 bg-white'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && <OverviewTab staff={staff} />}
          {activeTab === 'works' && <WorksTab works={works} />}
          {activeTab === 'performance' && <PerformanceTab stats={workStats} works={works} />}
          {activeTab === 'timeline' && <TimelineTab works={works} />}
          {activeTab === 'delegated' && <DelegatedTab staffId={staffId} />}
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon: Icon, label, value, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50',
    teal: 'text-teal-600 bg-teal-50',
    purple: 'text-purple-600 bg-purple-50',
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={colorClasses[color]?.split(' ')[0] || 'text-gray-600'} />
        <p className="text-xs font-medium text-gray-600">{label}</p>
      </div>
      <p className={`text-xl font-bold ${colorClasses[color]?.split(' ')[0] || 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

// Overview Tab
function OverviewTab({ staff }: { staff: StaffMember }) {
  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staff.email && (
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm font-medium text-gray-900">{staff.email}</p>
            </div>
          )}
          {staff.phone && (
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="text-sm font-medium text-gray-900">{staff.phone}</p>
            </div>
          )}
          {staff.department && (
            <div>
              <p className="text-xs text-gray-500">Department</p>
              <p className="text-sm font-medium text-gray-900">{staff.department}</p>
            </div>
          )}
          {staff.employment_type && (
            <div>
              <p className="text-xs text-gray-500">Employment Type</p>
              <p className="text-sm font-medium text-gray-900 capitalize">{staff.employment_type}</p>
            </div>
          )}
          {staff.joining_date && (
            <div>
              <p className="text-xs text-gray-500">Joining Date</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(staff.joining_date).toLocaleDateString()}
              </p>
            </div>
          )}
          {staff.hourly_rate && (
            <div>
              <p className="text-xs text-gray-500">Hourly Rate</p>
              <p className="text-sm font-medium text-gray-900">₹{staff.hourly_rate}</p>
            </div>
          )}
        </div>
      </div>

      {/* Skills & Expertise */}
      {(staff.skills || staff.expertise_areas) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Award size={20} className="text-emerald-600" />
            Skills & Expertise
          </h3>
          <div className="flex flex-wrap gap-2">
            {[...(staff.skills || []), ...(staff.expertise_areas || [])].map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {staff.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notes</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{staff.notes}</p>
        </div>
      )}
    </div>
  );
}

// Works Tab
function WorksTab({ works }: { works: Work[] }) {
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredWorks = filterStatus === 'all' ? works : works.filter(w => w.status === filterStatus);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Assigned Works ({works.length})</h3>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredWorks.map((work) => (
          <div
            key={work.id}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 mb-1">{work.title}</h4>
                <p className="text-sm text-gray-600">{work.services.name}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  statusColors[work.status] || statusColors.pending
                }`}
              >
                {work.status.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium text-gray-900">{work.customers.name}</span>
              </div>
              {work.due_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(work.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {work.actual_duration_hours > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Time Spent:</span>
                  <span className="font-medium text-gray-900">
                    {work.actual_duration_hours.toFixed(1)}h
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Performance Tab
function PerformanceTab({ stats, works }: { stats: WorkStats; works: Work[] }) {
  return (
    <div className="space-y-6">
      {/* Performance Metrics */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-600" />
          Performance Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Completion Rate</p>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.total_assigned > 0
                ? ((stats.completed / stats.total_assigned) * 100).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">On-Time Delivery</p>
            <p className="text-2xl font-bold text-blue-600">{stats.on_time_percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Average Completion Time</p>
            <p className="text-2xl font-bold text-purple-600">
              {stats.average_completion_time.toFixed(1)}h
            </p>
          </div>
        </div>
      </div>

      {/* Work Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Distribution</h3>
        <div className="space-y-3">
          <ProgressBar
            label="Completed"
            value={stats.completed}
            total={stats.total_assigned}
            color="green"
          />
          <ProgressBar
            label="In Progress"
            value={stats.in_progress}
            total={stats.total_assigned}
            color="blue"
          />
          <ProgressBar
            label="Pending"
            value={stats.pending}
            total={stats.total_assigned}
            color="yellow"
          />
          <ProgressBar
            label="Overdue"
            value={stats.overdue}
            total={stats.total_assigned}
            color="red"
          />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, value, total, color }: any) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">
          {value} / {total}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

// Timeline Tab
function TimelineTab({ works }: { works: Work[] }) {
  const completedWorks = works
    .filter(w => w.status === 'completed' && w.completed_at)
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Work History</h3>
      <div className="space-y-4">
        {completedWorks.map((work, idx) => (
          <div key={work.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 bg-emerald-600 rounded-full"></div>
              {idx < completedWorks.length - 1 && (
                <div className="w-0.5 h-full bg-gray-300 mt-1"></div>
              )}
            </div>
            <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-semibold text-gray-900">{work.title}</h4>
                  <p className="text-sm text-gray-600">{work.customers.name}</p>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(work.completed_at).toLocaleDateString()}
                </span>
              </div>
              {work.actual_duration_hours > 0 && (
                <p className="text-sm text-gray-600">
                  Completed in {work.actual_duration_hours.toFixed(1)} hours
                </p>
              )}
            </div>
          </div>
        ))}
        {completedWorks.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No completed works yet
          </div>
        )}
      </div>
    </div>
  );
}

// Delegated Tab
function DelegatedTab({ staffId }: { staffId: string }) {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
      <Users size={48} className="mx-auto text-gray-400 mb-4" />
      <h4 className="text-lg font-medium text-gray-900 mb-2">Delegated Works</h4>
      <p className="text-gray-600">Works assigned by this staff member to others.</p>
      <p className="text-sm text-gray-500 mt-2">Coming soon...</p>
    </div>
  );
}
