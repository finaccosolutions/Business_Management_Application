// src/pages/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Shield,
    Users,
    Briefcase,
    Settings as SettingsIcon,
    CheckCircle,
    Clock,
    Lock,
    Layout as LayoutIcon,
    Activity,
    AlertCircle,
    UserCheck,
    UserX,
    Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AdminDashboardProps {
    onNavigate?: (page: string, params?: any) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'access_control' | 'work_board'>('overview');

    // Data
    const [staffList, setStaffList] = useState<any[]>([]);
    const [works, setWorks] = useState<any[]>([]);

    // Filters
    const [staffFilter, setStaffFilter] = useState<string>('all');

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // Fetch Staff
            const { data: staffData, error: staffError } = await supabase
                .from('staff_members')
                .select('id, name, role, department, allowed_modules, detailed_permissions, is_active')
                .order('name');
            if (staffError) throw staffError;
            setStaffList(staffData || []);

            // Fetch Works
            const { data: worksData, error: worksError } = await supabase
                .from('works')
                .select('id, title, status, priority, due_date, assigned_to, customers(name), staff_members(name)')
                .order('due_date', { ascending: true });
            if (worksError) throw worksError;
            setWorks(worksData || []);

        } catch (error) {
            console.error('Error fetching admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (staffId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('staff_members')
                .update({ is_active: !currentStatus })
                .eq('id', staffId);

            if (error) throw error;

            // Update local state
            setStaffList(prev => prev.map(s => s.id === staffId ? { ...s, is_active: !currentStatus } : s));
        } catch (err) {
            console.error("Error toggling status", err);
            alert("Failed to update status");
        }
    };

    const handleEditPermissions = (staff: any) => {
        if (onNavigate) {
            onNavigate('staff-permissions', { id: staff.id });
        }
    };

    // Metrics calculation
    const activeStaffCount = staffList.filter(s => s.is_active).length;
    const totalWorks = works.length;
    const pendingWorks = works.filter(w => w.status === 'pending').length;

    // Staff Workload Logic
    const staffWorkload = staffList.map(staff => {
        const staffWorks = works.filter(w => w.assigned_to === staff.id && w.status !== 'completed');
        return {
            ...staff,
            workCount: staffWorks.length
        };
    });

    const idleStaff = staffWorkload.filter(s => s.workCount === 0 && s.is_active);
    const overloadedStaff = staffWorkload.filter(s => s.workCount > 5 && s.is_active);

    // Filtered Works for Board
    const filteredWorks = staffFilter === 'all'
        ? works
        : works.filter(w => w.assigned_to === staffFilter);

    const workColumns = {
        pending: filteredWorks.filter(w => w.status === 'pending'),
        in_progress: filteredWorks.filter(w => w.status === 'in_progress'),
        completed: filteredWorks.filter(w => w.status === 'completed'),
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8 bg-gray-50 dark:bg-slate-900 min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sticky top-16 z-20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                            <Shield className="w-8 h-8 text-indigo-600" />
                            Admin Control Panel
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            System overview, access management, and workflow optimization.
                        </p>
                    </div>
                    <div className="flex gap-2 text-sm">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${activeTab === 'overview'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <Activity size={16} />
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('access_control')}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${activeTab === 'access_control'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <Lock size={16} />
                            Access Control
                        </button>
                    </div>
                </div>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase">Total Active Staff</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{activeStaffCount}</h3>
                                </div>
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600">
                                    <Users size={20} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase">Pending Works</p>
                                    <h3 className="text-2xl font-bold text-amber-600 mt-1">{pendingWorks}</h3>
                                </div>
                                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600">
                                    <Clock size={20} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase">Idle Staff (Available)</p>
                                    <h3 className="text-2xl font-bold text-emerald-600 mt-1">{idleStaff.length}</h3>
                                </div>
                                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-emerald-600">
                                    <UserCheck size={20} />
                                </div>
                            </div>
                            {idleStaff.length > 0 && (
                                <div className="mt-3 text-xs text-gray-500">
                                    {idleStaff.slice(0, 3).map(s => s.name).join(', ')} {idleStaff.length > 3 && `+${idleStaff.length - 3}`}
                                </div>
                            )}
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-medium text-gray-500 uppercase">Overloaded Staff</p>
                                    <h3 className="text-2xl font-bold text-red-600 mt-1">{overloadedStaff.length}</h3>
                                </div>
                                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600">
                                    <AlertCircle size={20} />
                                </div>
                            </div>
                            {overloadedStaff.length > 0 && (
                                <div className="mt-3 text-xs text-red-500">
                                    {overloadedStaff.slice(0, 2).map(s => s.name).join(', ')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Workflow Health / Insights */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Workflow Health</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Staff Utilization</span>
                                    <div className="w-1/2 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                        <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${Math.min((activeStaffCount - idleStaff.length) / activeStaffCount * 100, 100)}%` }}></div>
                                    </div>
                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">
                                        {activeStaffCount ? Math.round(((activeStaffCount - idleStaff.length) / activeStaffCount) * 100) : 0}% Active
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Queue Health</span>
                                    <div className="w-1/2 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${Math.min((pendingWorks / totalWorks) * 100, 100)}%` }}></div>
                                    </div>
                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">
                                        {totalWorks ? Math.round((pendingWorks / totalWorks) * 100) : 0}% Pending
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => onNavigate && onNavigate('create-staff')} className="p-3 text-left bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors group">
                                    <div className="text-indigo-600 mb-1 group-hover:scale-110 transition-transform origin-left"><Users size={20} /></div>
                                    <div className="font-semibold text-gray-900 text-sm">Add Staff</div>
                                    <div className="text-xs text-gray-500">Create new user account</div>
                                </button>
                                <button onClick={() => onNavigate && onNavigate('works')} className="p-3 text-left bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors group">
                                    <div className="text-emerald-600 mb-1 group-hover:scale-110 transition-transform origin-left"><Briefcase size={20} /></div>
                                    <div className="font-semibold text-gray-900 text-sm">Manage All Works</div>
                                    <div className="text-xs text-gray-500">Go to Full list</div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Access Control Tab */}
            {activeTab === 'access_control' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Staff Management & Permissions</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-slate-700/50 dark:text-gray-400">
                                <tr>
                                    <th className="px-6 py-3">Staff Member</th>
                                    <th className="px-6 py-3">Role</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffList.map((staff) => (
                                    <tr key={staff.id} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${staff.is_active ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    {staff.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div>{staff.name}</div>
                                                    <div className="text-xs text-gray-500">{staff.department || 'No Dept'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${staff.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {staff.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleToggleStatus(staff.id, staff.is_active)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${staff.is_active
                                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                    }`}
                                            >
                                                {staff.is_active ? <UserCheck size={12} /> : <UserX size={12} />}
                                                {staff.is_active ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleEditPermissions(staff)}
                                                className="font-medium text-indigo-600 hover:underline flex items-center gap-1 justify-end ml-auto"
                                            >
                                                <SettingsIcon size={14} />
                                                Configure Access
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
