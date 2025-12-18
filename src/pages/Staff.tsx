import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Trash2, Edit, Shield,
  ClipboardList, Clock, Search
} from 'lucide-react';
import StaffDetails from '../components/StaffDetails';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';
import { format } from 'date-fns';

export default function AdminStaffManager({ isDetailsView, staffId, onNavigate }: any = {}) {
  const { user, role, permissions } = useAuth();
  const [activeTab, setActiveTab] = useState<'directory' | 'monitor' | 'timesheets'>('directory');

  const canViewMonitor = role === 'admin' || permissions?.staff?.view_monitor;
  const canViewTimesheets = role === 'admin' || permissions?.staff?.view_timesheets;
  const [staff, setStaff] = useState<any[]>([]);
  const [globalWorks, setGlobalWorks] = useState<any[]>([]);
  const [globalLogs, setGlobalLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Reuse existing directory logic
  const [searchQuery, setSearchQuery] = useState('');
  const { showConfirmation } = useConfirmation();
  const toast = useToast();

  useEffect(() => {
    if (user) {
      if (activeTab === 'directory') fetchData();
      if (activeTab === 'monitor') fetchGlobalWorks();
      if (activeTab === 'timesheets') fetchGlobalLogs();
    }
  }, [user, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('staff_members').select('*').order('name');
    if (!error) setStaff(data || []);
    setLoading(false);
  };

  const fetchGlobalWorks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('works')
      .select('*, staff_members(name)')
      .order('due_date');
    setGlobalWorks(data || []);
    setLoading(false);
  };

  const fetchGlobalLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('work_time_logs')
      .select('*, staff_members(name), works(title)')
      .order('created_at', { ascending: false })
      .limit(50);
    setGlobalLogs(data || []);
    setLoading(false);
  }

  const handleDelete = async (id: string) => {
    showConfirmation({
      title: 'Delete Staff Member',
      message: 'Are you sure?',
      confirmText: 'Delete',
      confirmColor: 'red',
      onConfirm: async () => {
        const { error } = await supabase.from('staff_members').delete().eq('id', id);
        if (!error) {
          toast.success('Deleted');
          fetchData();
        } else {
          toast.error('Failed to delete');
        }
      }
    });
  };

  if (isDetailsView && staffId) {
    return <StaffDetails staffId={staffId} onBack={() => onNavigate?.('staff')} />;
  }

  if (loading && staff.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-600" /> Staff & Workflow
          </h1>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          {activeTab === 'directory' && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm border-gray-200 rounded-lg w-40 focus:ring-2 focus:ring-blue-500 outline-none transition-all focus:w-56"
                />
              </div>
              <button
                onClick={() => onNavigate?.('create-staff')}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                title="Add New Staff"
              >
                <Plus size={18} />
              </button>
            </>
          )}

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('directory')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'directory' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Directory
            </button>
            {canViewMonitor && (
              <button
                onClick={() => setActiveTab('monitor')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'monitor' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Monitor
              </button>
            )}
            {canViewTimesheets && (
              <button
                onClick={() => setActiveTab('timesheets')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'timesheets' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Logs
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Staff List Full Width */}
          <div className="flex flex-col space-y-3">
            {staff.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map(member => (
              <div
                key={member.id}
                onClick={() => onNavigate?.('staff-details', { id: member.id })}
                className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg group-hover:scale-110 transition-transform">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{member.name}</h3>
                    <p className="text-xs text-gray-500">{member.role} &bull; {member.department || 'General'}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full ${member.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onNavigate?.('create-staff', { id: member.id }); }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit Profile"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(member.id); }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete User"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'monitor' && canViewMonitor && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2">
              <ClipboardList className="w-5 h-5 text-indigo-600" /> Staff Workload Monitor
            </h3>
            <p className="text-sm text-gray-500">
              Overview of task distribution and performance across all staff members.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {staff.filter(s => s.is_active).map(member => {
              const memberWorks = globalWorks.filter(w => w.assigned_to === member.id);
              const pending = memberWorks.filter(w => w.status === 'pending').length;
              const inProgress = memberWorks.filter(w => w.status === 'in_progress').length;
              const completed = memberWorks.filter(w => w.status === 'completed').length;
              const overdue = memberWorks.filter(w => w.status !== 'completed' && w.due_date && new Date(w.due_date) < new Date()).length;
              const totalActive = pending + inProgress;

              // Calculate easy stats


              return (
                <div key={member.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{member.name}</h4>
                        <p className="text-xs text-gray-500">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{totalActive}</div>
                      <div className="text-xs text-gray-500 uppercase font-medium">Active Tasks</div>
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50/50">
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <div className="text-amber-600 font-bold text-lg">{pending}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Pending</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <div className="text-blue-600 font-bold text-lg">{inProgress}</div>
                      <div className="text-[10px] text-gray-500 uppercase">In Progress</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <div className="text-green-600 font-bold text-lg">{completed}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Completed</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <div className="text-red-600 font-bold text-lg">{overdue}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Overdue</div>
                    </div>
                  </div>

                  <div className="p-5">
                    <h5 className="text-xs font-semibold text-gray-500 uppercase mb-3 px-1">Current Active Works</h5>
                    <div className="space-y-2">
                      {memberWorks
                        .filter(w => w.status === 'in_progress' || w.status === 'pending')
                        .slice(0, 3)
                        .map(work => (
                          <div key={work.id} onClick={() => onNavigate?.('work-details', { id: work.id })} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-100 transition-all">
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium text-gray-800 truncate">{work.title}</span>
                              <span className="text-xs text-gray-500 truncate">{format(new Date(work.created_at), 'MMM d')} • {work.priority}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${work.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                              {work.status.replace('_', ' ')}
                            </span>
                          </div>
                        ))}
                      {memberWorks.filter(w => w.status === 'in_progress' || w.status === 'pending').length === 0 && (
                        <div className="text-center py-4 text-gray-400 text-xs italic">
                          No active tasks assigned
                        </div>
                      )}
                      {memberWorks.filter(w => w.status === 'in_progress' || w.status === 'pending').length > 3 && (
                        <div className="text-center pt-2">
                          <button className="text-xs text-indigo-600 hover:underline">
                            + {memberWorks.filter(w => w.status === 'in_progress' || w.status === 'pending').length - 3} more
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'timesheets' && canViewTimesheets && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" /> Recent Time Logs
            </h3>
            <button className="text-sm text-indigo-600 font-medium hover:underline">Download Report</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3">Staff Member</th>
                  <th className="px-6 py-3">Work Item</th>
                  <th className="px-6 py-3">Date & Time</th>
                  <th className="px-6 py-3 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {globalLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {log.staff_members?.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {log.works?.title || 'Unknown Work'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {log.duration_minutes} min
                    </td>
                  </tr>
                ))}
                {globalLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No time logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
