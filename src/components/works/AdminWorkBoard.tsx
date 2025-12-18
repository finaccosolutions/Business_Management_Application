import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
    Filter,
    Clock,
    Briefcase,
    CheckCircle,
    AlertCircle
} from 'lucide-react';

export default function AdminWorkBoard() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [works, setWorks] = useState<any[]>([]);
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
                .select('id, name, role')
                .eq('is_active', true)
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
            console.error('Error fetching board data:', error);
        } finally {
            setLoading(false);
        }
    };

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
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4 h-[calc(100vh-200px)]">
            {/* Filter Bar */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">Work Kanban Board</h2>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 w-fit">
                    <Filter size={16} className="text-gray-500 ml-2" />
                    <select
                        value={staffFilter}
                        onChange={(e) => setStaffFilter(e.target.value)}
                        className="bg-transparent border-none text-sm text-gray-700 focus:ring-0 cursor-pointer outline-none"
                    >
                        <option value="all">All Staff</option>
                        {staffList.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-4">
                {/* Pending Column */}
                <div className="bg-gray-100/50 rounded-xl p-4 border border-gray-200 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <Clock size={18} className="text-amber-500" /> Pending
                        </h3>
                        <span className="bg-white px-2 py-1 rounded text-xs font-bold text-gray-600 shadow-sm">
                            {workColumns.pending.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {workColumns.pending.map(work => (
                            <div key={work.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-l-4 border-l-amber-500">
                                <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">{work.title}</div>
                                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                    <span>{work.customers?.name}</span>
                                    {work.priority === 'urgent' && <span className="text-red-500 font-bold">Urgent</span>}
                                </div>
                                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
                                    <span className="text-gray-400">{work.staff_members?.name || 'Unassigned'}</span>
                                    <span className="text-amber-600 font-medium">{work.due_date ? new Date(work.due_date).toLocaleDateString() : 'No Date'}</span>
                                </div>
                            </div>
                        ))}
                        {workColumns.pending.length === 0 && <p className="text-xs text-center text-gray-400 py-4">No pending works</p>}
                    </div>
                </div>

                {/* In Progress Column */}
                <div className="bg-gray-100/50 rounded-xl p-4 border border-gray-200 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <Briefcase size={18} className="text-blue-500" /> In Progress
                        </h3>
                        <span className="bg-white px-2 py-1 rounded text-xs font-bold text-gray-600 shadow-sm">
                            {workColumns.in_progress.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {workColumns.in_progress.map(work => (
                            <div key={work.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group border-l-4 border-l-blue-500">
                                <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">{work.title}</div>
                                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                    <span>{work.customers?.name}</span>
                                </div>
                                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
                                    <span className="font-medium text-blue-600">{work.staff_members?.name || 'Unassigned'}</span>
                                    <span className="text-gray-400">{work.due_date ? new Date(work.due_date).toLocaleDateString() : 'No Date'}</span>
                                </div>
                            </div>
                        ))}
                        {workColumns.in_progress.length === 0 && <p className="text-xs text-center text-gray-400 py-4">No active works</p>}
                    </div>
                </div>

                {/* Completed Column */}
                <div className="bg-gray-100/50 rounded-xl p-4 border border-gray-200 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <CheckCircle size={18} className="text-emerald-500" /> Completed
                        </h3>
                        <span className="bg-white px-2 py-1 rounded text-xs font-bold text-gray-600 shadow-sm">
                            {workColumns.completed.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {workColumns.completed.map(work => (
                            <div key={work.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-default group border-l-4 border-l-emerald-500 opacity-75 hover:opacity-100">
                                <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-2 line-through text-gray-500">{work.title}</div>
                                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                    <span>{work.customers?.name}</span>
                                </div>
                                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
                                    <span className="text-gray-400">{work.staff_members?.name}</span>
                                    <span className="text-emerald-600 font-medium">Done</span>
                                </div>
                            </div>
                        ))}
                        {workColumns.completed.length === 0 && <p className="text-xs text-center text-gray-400 py-4">No recent completed works</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
