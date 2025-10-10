import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  User,
  Briefcase,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  Award,
  TrendingUp,
  Edit2,
} from 'lucide-react';

interface StaffDetailsProps {
  staffId: string;
  onClose: () => void;
  onEdit: () => void;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  hourly_rate: number;
  is_active: boolean;
  skills: string[];
  notes: string;
  created_at: string;
}

interface Work {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
  created_at: string;
  completed_at: string;
  estimated_hours: number;
  actual_hours: number;
  customers: { name: string };
  services: { name: string };
}

type TabType = 'overview' | 'current' | 'completed' | 'pending' | 'overdue' | 'performance';

export default function StaffDetails({ staffId, onClose, onEdit }: StaffDetailsProps) {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [statistics, setStatistics] = useState({
    totalWorks: 0,
    completedWorks: 0,
    pendingWorks: 0,
    overdueWorks: 0,
    totalHoursWorked: 0,
    averageCompletionTime: 0,
    onTimeCompletionRate: 0,
  });

  useEffect(() => {
    if (staffId) {
      fetchStaffDetails();
    }
  }, [staffId]);

  const fetchStaffDetails = async () => {
    try {
      const [staffRes, worksRes] = await Promise.all([
        supabase
          .from('staff_members')
          .select('*')
          .eq('id', staffId)
          .single(),
        supabase
          .from('works')
          .select('*, customers(name), services!service_id(name)')
          .eq('assigned_to', staffId)
          .order('created_at', { ascending: false }),
      ]);

      if (staffRes.error) throw staffRes.error;
      if (worksRes.error) throw worksRes.error;

      setStaff(staffRes.data);
      setWorks(worksRes.data || []);

      const allWorks = worksRes.data || [];
      const completed = allWorks.filter((w) => w.status === 'completed');
      const pending = allWorks.filter((w) => w.status === 'in_progress' || w.status === 'pending');
      const overdue = allWorks.filter((w) => {
        if (w.status === 'completed') return false;
        return new Date(w.due_date) < new Date();
      });

      const totalHours = completed.reduce((sum, w) => sum + (w.actual_hours || 0), 0);
      
      const onTimeCompleted = completed.filter((w) => {
        return new Date(w.completed_at) <= new Date(w.due_date);
      });

      setStatistics({
        totalWorks: allWorks.length,
        completedWorks: completed.length,
        pendingWorks: pending.length,
        overdueWorks: overdue.length,
        totalHoursWorked: totalHours,
        averageCompletionTime: completed.length > 0 ? totalHours / completed.length : 0,
        onTimeCompletionRate: completed.length > 0 ? (onTimeCompleted.length / completed.length) * 100 : 0,
      });
    } catch (error: any) {
      console.error('Error fetching staff details:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !staff) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  const tabs: Array<{ id: TabType; label: string; icon: any; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'current', label: 'Current Works', icon: Clock, count: statistics.pendingWorks },
    { id: 'completed', label: 'Completed', icon: CheckCircle, count: statistics.completedWorks },
    { id: 'pending', label: 'Pending', icon: AlertCircle, count: statistics.pendingWorks },
    { id: 'overdue', label: 'Overdue', icon: AlertCircle, count: statistics.overdueWorks },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
  ];

  const currentWorks = works.filter((w) => w.status === 'in_progress');
  const completedWorks = works.filter((w) => w.status === 'completed');
  const pendingWorks = works.filter((w) => w.status === 'pending');
  const overdueWorks = works.filter((w) => {
    if (w.status === 'completed') return false;
    return new Date(w.due_date) < new Date();
  });

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
    completed: 'bg-green-100 text-green-700 border-green-200',
    overdue: 'bg-red-100 text-red-700 border-red-200',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-teal-600 to-emerald-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <User size={28} />
              Staff Details
            </h2>
            <p className="text-teal-100 text-sm mt-1">
              Member since {new Date(staff.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
            >
              <Edit2 size={18} />
              Edit
            </button>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Status Badge */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span
              className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                staff.is_active
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {staff.is_active ? 'Active' : 'Inactive'}
            </span>
            <span className="text-sm font-medium text-gray-700 uppercase px-3 py-1 bg-blue-50 rounded-lg">
              {staff.role}
            </span>
            {staff.hourly_rate && (
              <span className="text-sm font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg flex items-center gap-1">
                <DollarSign size={14} />
                ₹{staff.hourly_rate}/hour
              </span>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 p-6 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-gray-200 flex-shrink-0">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={16} className="text-blue-600" />
              <p className="text-xs font-medium text-gray-600">Total Works</p>
            </div>
            <p className="text-xl font-bold text-blue-600">{statistics.totalWorks}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-xs font-medium text-gray-600">Completed</p>
            </div>
            <p className="text-xl font-bold text-green-600">{statistics.completedWorks}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-yellow-600" />
              <p className="text-xs font-medium text-gray-600">Pending</p>
            </div>
            <p className="text-xl font-bold text-yellow-600">{statistics.pendingWorks}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-red-600" />
              <p className="text-xs font-medium text-gray-600">Overdue</p>
            </div>
            <p className="text-xl font-bold text-red-600">{statistics.overdueWorks}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-teal-600" />
              <p className="text-xs font-medium text-gray-600">Hours Worked</p>
            </div>
            <p className="text-xl font-bold text-teal-600">{statistics.totalHoursWorked.toFixed(1)}</p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-purple-600" />
              <p className="text-xs font-medium text-gray-600">Avg Time</p>
            </div>
            <p className="text-xl font-bold text-purple-600">
              {statistics.averageCompletionTime.toFixed(1)}h
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Award size={16} className="text-emerald-600" />
              <p className="text-xs font-medium text-gray-600">On-Time Rate</p>
            </div>
            <p className="text-xl font-bold text-emerald-600">
              {statistics.onTimeCompletionRate.toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-emerald-50 flex-shrink-0 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 font-medium rounded-t-lg transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-teal-700 shadow-sm border-t-2 border-teal-600'
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <Icon size={18} className="text-teal-600" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Personal Information */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User size={20} className="text-teal-600" />
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Name</label>
                    <p className="text-gray-900 font-medium mt-1">{staff.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Role</label>
                    <p className="text-gray-900 font-medium mt-1 capitalize">{staff.role}</p>
                  </div>
                  {staff.email && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                        <Mail size={14} />
                        Email
                      </label>
                      <p className="text-gray-900 mt-1">
                        <a href={`mailto:${staff.email}`} className="text-teal-600 hover:underline">
                          {staff.email}
                        </a>
                      </p>
                    </div>
                  )}
                  {staff.phone && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                        <Phone size={14} />
                        Phone
                      </label>
                      <p className="text-gray-900 mt-1">
                        <a href={`tel:${staff.phone}`} className="text-teal-600 hover:underline">
                          {staff.phone}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Skills */}
              {staff.skills && staff.skills.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Award size={20} className="text-teal-600" />
                    Skills & Expertise
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {staff.skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {staff.notes && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Notes</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{staff.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'current' && (
            <WorksList works={currentWorks} statusColors={statusColors} priorityColors={priorityColors} emptyMessage="No works in progress" />
          )}

          {activeTab === 'completed' && (
            <WorksList works={completedWorks} statusColors={statusColors} priorityColors={priorityColors} emptyMessage="No completed works" />
          )}

          {activeTab === 'pending' && (
            <WorksList works={pendingWorks} statusColors={statusColors} priorityColors={priorityColors} emptyMessage="No pending works" />
          )}

          {activeTab === 'overdue' && (
            <WorksList works={overdueWorks} statusColors={statusColors} priorityColors={priorityColors} emptyMessage="No overdue works" />
          )}

          {activeTab === 'performance' && (
            <PerformanceTab statistics={statistics} works={works} />
          )}
        </div>
      </div>
    </div>
  );
}

function WorksList({
  works,
  statusColors,
  priorityColors,
  emptyMessage,
}: {
  works: Work[];
  statusColors: Record<string, string>;
  priorityColors: Record<string, string>;
  emptyMessage: string;
}) {
  if (works.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
        <Clock size={48} className="mx-auto text-gray-400 mb-4" />
        <p className="text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {works.map((work) => (
        <div
          key={work.id}
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">{work.title}</h4>
              <p className="text-sm text-gray-600">{work.services?.name}</p>
              <p className="text-sm text-gray-500">{work.customers?.name}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 border ${
                statusColors[work.status] || statusColors.pending
              }`}
            >
              {work.status.replace('_', ' ')}
            </span>
          </div>

          {work.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{work.description}</p>
          )}

          <div className="flex items-center justify-between text-sm">
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                priorityColors[work.priority] || priorityColors.medium
              }`}
            >
              {work.priority}
            </span>
            {work.due_date && (
              <div className="flex items-center gap-1 text-gray-600">
                <Calendar size={14} />
                <span>{new Date(work.due_date).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {work.actual_hours && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-700">
              <Clock size={14} />
              <span>Actual: {work.actual_hours}h</span>
              {work.estimated_hours && (
                <span className="text-gray-500">/ Est: {work.estimated_hours}h</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PerformanceTab({ statistics, works }: { statistics: any; works: Work[] }) {
  const completedWorks = works.filter((w) => w.status === 'completed');
  
  const worksByMonth = completedWorks.reduce((acc: any, work) => {
    const month = new Date(work.completed_at).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Performance Summary */}
      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-teal-600" />
          Performance Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Hours Worked</p>
            <p className="text-2xl font-bold text-teal-600">
              {statistics.totalHoursWorked.toFixed(1)} hours
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Average Completion Time</p>
            <p className="text-2xl font-bold text-blue-600">
              {statistics.averageCompletionTime.toFixed(1)} hours
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">On-Time Delivery Rate</p>
            <p className="text-2xl font-bold text-emerald-600">
              {statistics.onTimeCompletionRate.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Work Completion by Month */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Completion by Month</h3>
        <div className="space-y-3">
          {Object.entries(worksByMonth).map(([month, count]: [string, any]) => (
            <div key={month} className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 w-24">{month}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full flex items-center justify-end px-2"
                  style={{ width: `${(count / Math.max(...Object.values(worksByMonth))) * 100}%` }}
                >
                  <span className="text-xs font-semibold text-white">{count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Work Efficiency */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Efficiency</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Total Works Assigned</span>
            <span className="font-bold text-gray-900">{statistics.totalWorks}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Completion Rate</span>
            <span className="font-bold text-green-600">
              {statistics.totalWorks > 0
                ? ((statistics.completedWorks / statistics.totalWorks) * 100).toFixed(1)
                : 0}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Works Overdue</span>
            <span className="font-bold text-red-600">{statistics.overdueWorks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
