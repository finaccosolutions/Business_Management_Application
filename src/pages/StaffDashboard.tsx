import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Briefcase, Clock, CheckCircle, XCircle, Play, Square,
    Calendar, History, AlertCircle, Eye, ChevronDown, ChevronUp, Send, MessageSquare
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { format } from 'date-fns';

interface StaffDashboardProps {
    onNavigate?: (page: string, params?: any) => void;
}

export default function StaffDashboard({ onNavigate }: StaffDashboardProps) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [staffProfile, setStaffProfile] = useState<any>(null);
    const [assignedWorks, setAssignedWorks] = useState<any[]>([]);
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTimer, setActiveTimer] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'pending_acceptance' | 'my_works'>('my_works');
    const [workStatusFilter, setWorkStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed' | 'overdue'>('all');
    const [todoList, setTodoList] = useState<any[]>([]);

    const [stats, setStats] = useState({
        todayHours: 0,
        pendingCount: 0,
        completedCount: 0
    });

    useEffect(() => {
        if (user) {
            fetchStaffProfile();
        }
    }, [user]);

    const fetchStaffProfile = async () => {
        try {
            let { data: staff, error } = await supabase
                .from('staff_members')
                .select('*')
                .eq('auth_user_id', user!.id)
                .single();

            if (!staff && !error) {
                const { data: byEmail } = await supabase
                    .from('staff_members')
                    .select('*')
                    .eq('email', user!.email)
                    .single();

                if (byEmail) {
                    staff = byEmail;
                    await supabase
                        .from('staff_members')
                        .update({ auth_user_id: user!.id })
                        .eq('id', byEmail.id);
                }
            }

            if (staff) {
                setStaffProfile(staff);
                fetchAssignedWorks(staff.id);
                checkActiveTimer(staff.id);
                fetchRecentLogs(staff.id);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAssignedWorks = async (staffId: string) => {
        try {
            const { data: works } = await supabase
                .from('works')
                .select('*')
                .eq('assigned_to', staffId)
                .order('due_date', { ascending: true });

            // Recurring Tasks assigned to me
            // Only proceed if assigned_to column exists (migration handled this)
            // But we use a try-catch to be safe if migration failed silently
            let tasks: any[] = [];
            try {
                const { data } = await supabase
                    .from('recurring_period_tasks')
                    .select('*, works(work_number, title)')
                    .eq('assigned_to', staffId)
                    .neq('status', 'completed')
                    .order('due_date', { ascending: true });
                tasks = data || [];
            } catch (err) {
                console.warn("Could not fetch assigned tasks directly, column might be missing", err);
            }

            const { data: adhocTasks } = await supabase
                .from('work_tasks')
                .select('*, works(work_number, title)')
                .eq('assigned_to', staffId)
                .neq('status', 'completed')
                .order('due_date', { ascending: true });

            setTodoList([...(tasks || []), ...(adhocTasks || [])]);

            const combined = [
                ...(works || []).map(w => ({ ...w, type: 'work' })),
                // We mainly track Works in the dashboard cards, tasks are in Todo List sidebar generally
                // But user wants tasks in the cards if they are "works"? 
                // For now, let's keep "Works" as the main cards.
            ];

            combined.sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            });

            setAssignedWorks(combined);

            const pending = combined.filter(w => w.status === 'pending' || w.status === 'in_progress').length;
            setStats(prev => ({ ...prev, pendingCount: pending }));
        } catch (e) {
            console.error("Fetch assigned works error", e);
        }
    };


    const fetchRecentLogs = async (staffId: string) => {
        const { data: logs } = await supabase
            .from('work_time_logs')
            .select('*, works(title)')
            .eq('staff_id', staffId)
            .order('created_at', { ascending: false })
            .limit(10);

        setRecentLogs(logs || []);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: todayLogs } = await supabase
            .from('work_time_logs')
            .select('duration_minutes')
            .eq('staff_id', staffId)
            .gte('start_time', today.toISOString());

        const totalMinutes = todayLogs?.reduce((acc, log) => acc + (log.duration_minutes || 0), 0) || 0;
        setStats(prev => ({ ...prev, todayHours: Math.round(totalMinutes / 60 * 10) / 10 }));
    };

    const checkActiveTimer = async (staffId: string) => {
        const { data } = await supabase
            .from('work_time_logs')
            .select('*, works(title, work_number)')
            .eq('staff_id', staffId)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .single();

        if (data) setActiveTimer(data);
    };

    const handleAcceptWork = async (workId: string) => {
        const { error } = await supabase
            .from('works')
            .update({
                acceptance_status: 'accepted',
                acceptance_date: new Date().toISOString(),
                status: 'in_progress'
            })
            .eq('id', workId);

        if (error) showToast('error', 'Failed to accept work');
        else {
            showToast('success', 'Work accepted');
            fetchAssignedWorks(staffProfile.id);
        }
    };

    const handleRejectWork = async (type: 'work' | 'task', id: string) => {
        const table = type === 'work' ? 'works' : 'recurring_period_tasks';
        const { error } = await supabase
            .from(table)
            .update({
                acceptance_status: 'rejected',
                acceptance_date: new Date().toISOString()
            })
            .eq('id', id);

        if (error) showToast('error', 'Failed to reject work');
        else {
            showToast('success', 'Work rejected');
            fetchAssignedWorks(staffProfile.id);
        }
    };

    const startTimer = async (item: any) => {
        if (activeTimer) {
            showToast('error', 'Stop current timer first');
            return;
        }

        const { data, error } = await supabase
            .from('work_time_logs')
            .insert({
                work_id: item.type === 'work' ? item.id : item.work_id,
                task_id: item.type === 'task' ? item.id : null,
                staff_id: staffProfile.id,
                start_time: new Date().toISOString()
            })
            .select('*, works(title, work_number)')
            .single();

        if (error) showToast('error', 'Failed to start timer');
        else {
            setActiveTimer(data);
            showToast('success', 'Timer started');
        }
    };

    const stopTimer = async () => {
        if (!activeTimer) return;

        const endTime = new Date();
        const startTime = new Date(activeTimer.start_time);
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

        const { error } = await supabase
            .from('work_time_logs')
            .update({
                end_time: endTime.toISOString(),
                duration_minutes: duration
            })
            .eq('id', activeTimer.id);

        if (error) showToast('error', 'Failed to stop timer');
        else {
            setActiveTimer(null);
            fetchRecentLogs(staffProfile.id);
            showToast('success', 'Timer stopped. Logged ' + duration + ' mins.');
        }
    };

    const toggleTodo = async (taskId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        const { error } = await supabase.from('recurring_period_tasks').update({ status: newStatus }).eq('id', taskId);
        if (!error) {
            fetchAssignedWorks(staffProfile.id);
            showToast('success', 'Task updated');
        }
    };

    const pendingAcceptanceWorks = assignedWorks.filter(w => w.acceptance_status !== 'accepted' && w.acceptance_status !== 'rejected');
    const myAcceptedWorks = assignedWorks.filter(w => w.acceptance_status === 'accepted');

    const filteredActiveWorks = myAcceptedWorks.filter(w => {
        if (workStatusFilter === 'all') return true;
        if (workStatusFilter === 'overdue') {
            if (w.status === 'completed') return false;
            return w.due_date && new Date(w.due_date) < new Date();
        }
        return w.status === workStatusFilter;
    });

    if (loading) return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

    if (!staffProfile) {
        return (
            <div className="p-8 text-center bg-gray-50 min-h-[50vh] flex flex-col items-center justify-center">
                <Briefcase className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900">Staff Dashboard</h2>
                <div className="mt-4 text-gray-500">Contact admin to link your account.</div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome, {staffProfile.name}</h1>
                    <p className="text-gray-500">{staffProfile.role?.toUpperCase()} &bull; {staffProfile.department || 'General Team'}</p>
                </div>

                {activeTimer ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-4 animate-pulse shadow-sm w-full md:w-auto">
                        <Clock className="w-6 h-6 text-emerald-600" />
                        <div>
                            <p className="text-xs text-emerald-700 font-bold uppercase">Tracking Time</p>
                            <p className="text-sm font-medium text-emerald-900 line-clamp-1">{activeTimer.works?.title}</p>
                            <p className="text-xs text-emerald-600">Started {format(new Date(activeTimer.start_time), 'h:mm a')}</p>
                        </div>
                        <button
                            onClick={stopTimer}
                            className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-md transition-all ml-auto"
                            title="Stop Timer"
                        >
                            <Square size={16} fill="currentColor" />
                        </button>
                    </div>
                ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3 w-full md:w-auto">
                        <Clock className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">No active timer</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-blue-100 p-3 rounded-lg"><Briefcase className="w-6 h-6 text-blue-600" /></div>
                    <div>
                        <p className="text-sm text-gray-500">My Works</p>
                        <p className="text-2xl font-bold text-gray-900">{myAcceptedWorks.length}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-orange-100 p-3 rounded-lg"><AlertCircle className="w-6 h-6 text-orange-600" /></div>
                    <div>
                        <p className="text-sm text-gray-500">Pending Requests</p>
                        <p className="text-2xl font-bold text-gray-900">{pendingAcceptanceWorks.length}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-emerald-100 p-3 rounded-lg"><Clock className="w-6 h-6 text-emerald-600" /></div>
                    <div>
                        <p className="text-sm text-gray-500">Hours Today</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.todayHours}h</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex gap-4 border-b border-gray-200">
                        <button
                            className={`pb-2 px-1 font-medium text-sm transition-colors ${activeTab === 'my_works' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('my_works')}
                        >
                            My Works
                        </button>
                        <button
                            className={`pb-2 px-1 font-medium text-sm transition-colors ${activeTab === 'pending_acceptance' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('pending_acceptance')}
                        >
                            New Requests {pendingAcceptanceWorks.length > 0 && <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs">{pendingAcceptanceWorks.length}</span>}
                        </button>
                    </div>

                    {activeTab === 'pending_acceptance' && (
                        <div className="space-y-4">
                            {pendingAcceptanceWorks.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                    <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">No new work requests.</p>
                                </div>
                            ) : (
                                pendingAcceptanceWorks.map(work => (
                                    <div key={work.id} className="bg-white border-l-4 border-l-orange-500 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{work.work_number}</span>
                                                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded font-bold">New Assignment</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-gray-900">{work.title}</h3>
                                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{work.description || 'No description provided'}</p>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleAcceptWork(work.id)}
                                                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                                                >
                                                    <CheckCircle size={14} /> Accept
                                                </button>
                                                <button
                                                    onClick={() => handleRejectWork(work.type, work.id)}
                                                    className="flex items-center gap-1 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-200"
                                                >
                                                    <XCircle size={14} /> Reject
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'my_works' && (
                        <div className="space-y-4">
                            <div className="flex gap-2 pb-2 overflow-x-auto no-scrollbar">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'pending', label: 'Pending' },
                                    { id: 'in_progress', label: 'In Progress' },
                                    { id: 'completed', label: 'Completed' },
                                    { id: 'overdue', label: 'Overdue' }
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setWorkStatusFilter(f.id as any)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${workStatusFilter === f.id
                                            ? 'bg-gray-800 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {filteredActiveWorks.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                    <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">No works found in this category.</p>
                                </div>
                            ) : (
                                filteredActiveWorks.map(work => (
                                    <WorkCard
                                        key={work.id}
                                        work={work}
                                        staffId={staffProfile?.id}
                                        onStartTimer={startTimer}
                                        activeTimer={activeTimer}
                                        onUpdate={() => fetchAssignedWorks(staffProfile.id)}
                                        onNavigate={onNavigate}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5" /> To-Do List
                        </h2>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm p-4 space-y-3">
                            {todoList.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-4">No pending tasks.</p>
                            ) : (
                                todoList.map(task => (
                                    <div key={task.id} className="flex items-start gap-3 p-2 bg-gray-50 rounded-lg">
                                        <button
                                            onClick={() => toggleTodo(task.id, task.status)}
                                            className={`mt-0.5 flex-shrink-0 w-5 h-5 border-2 rounded-md ${task.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-400'
                                                } flex items-center justify-center`}
                                        >
                                            {task.status === 'completed' && <CheckCircle size={14} className="text-white" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                                                {task.task_title || task.title}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">{task.works?.title}</p>
                                        </div>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                            task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                            {task.priority || 'Normal'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <History className="w-5 h-5" /> Recent Activity
                        </h2>

                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                            {recentLogs.length === 0 ? (
                                <div className="p-6 text-center text-gray-500 text-sm">No recent activity logs.</div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {recentLogs.map(log => (
                                        <div key={log.id} className="p-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-gray-900 truncate flex-1">{log.works?.title}</span>
                                                <span className="text-gray-500 text-xs whitespace-nowrap">{format(new Date(log.created_at), 'MMM d, h:mm a')}</span>
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-xs text-gray-500">
                                                    {log.duration_minutes ? `${log.duration_minutes} mins` : 'In Progress'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function WorkCard({ work, staffId, onStartTimer, activeTimer, onUpdate, onNavigate }: any) {
    const [expanded, setExpanded] = useState(false);
    const [comments, setComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const { showToast } = useToast();

    const fetchDetails = async () => {
        const { data: comms } = await supabase
            .from('work_comments')
            .select('*, author:staff_members(name)')
            .eq('work_id', work.id)
            .order('created_at', { ascending: true });
        setComments(comms || []);
    };

    const toggleExpand = () => {
        setExpanded(!expanded);
        if (!expanded) fetchDetails();
    };

    const handleStatusUpdate = async (newStatus: string) => {
        const { error } = await supabase.from('works').update({ status: newStatus }).eq('id', work.id);
        if (error) showToast('error', 'Failed to update status');
        else {
            showToast('success', 'Status updated');
            onUpdate();
        }
    };

    const postComment = async () => {
        if (!commentText.trim()) return;
        const { error } = await supabase.from('work_comments').insert({
            work_id: work.id,
            author_id: staffId,
            content: commentText
        });
        if (error) showToast('error', 'Failed to post comment');
        else {
            setCommentText('');
            fetchDetails();
        }
    };

    const handleViewWork = (e: any) => {
        e.stopPropagation();
        if (onNavigate) {
            onNavigate('work-details', { id: work.id });
        }
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all">
            <div className="p-5 cursor-pointer" onClick={toggleExpand}>
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200">{work.work_number}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${work.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    work.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                        'bg-yellow-100 text-yellow-700'
                                }`}>
                                {work.status.replace('_', ' ')}
                            </span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{work.title}</h3>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                                <Calendar size={14} /> Due: {work.due_date ? format(new Date(work.due_date), 'MMM d') : 'No date'}
                            </span>
                            {work.estimated_hours && (
                                <span className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300">
                                    <Clock size={14} /> Est: {work.estimated_hours}h
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!activeTimer && work.status !== 'completed' && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onStartTimer(work); }}
                                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            >
                                <Play size={14} fill="currentColor" /> Timer
                            </button>
                        )}
                        {activeTimer && activeTimer.work_id === work.id && (
                            <span className="text-xs text-emerald-600 font-bold animate-pulse px-2">Running...</span>
                        )}
                        {expanded ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                    </div>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-gray-100 bg-gray-50 p-5 grid grid-cols-1 lg:grid-cols-2 gap-6" onClick={e => e.stopPropagation()}>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Update Status</label>
                            <div className="flex gap-2 mt-1">
                                {['pending', 'in_progress', 'completed'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => handleStatusUpdate(s)}
                                        className={`flex-1 py-1.5 rounded text-xs font-medium border ${work.status === s
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        {s.replace('_', ' ').toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-2"><MessageSquare size={14} /> Team Chat</h4>
                            <div className="bg-white border border-gray-200 rounded-lg h-48 overflow-y-auto p-3 space-y-3 mb-2">
                                {comments.length === 0 ? <p className="text-xs text-gray-400 text-center mt-10">No messages yet.</p> :
                                    comments.map(c => (
                                        <div key={c.id} className="text-sm">
                                            <span className="font-bold text-gray-700 text-xs">{c.author?.name}</span>
                                            <p className="bg-gray-100 rounded-md p-2 mt-0.5 text-gray-800">{c.content}</p>
                                        </div>
                                    ))
                                }
                            </div>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                                    placeholder="Type message..."
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && postComment()}
                                />
                                <button onClick={postComment} className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"><Send size={16} /></button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-gray-500 uppercase">Details</label>
                            <button onClick={handleViewWork} className="text-xs text-blue-600 flex items-center gap-1 hover:underline"><Eye size={12} /> View Full Work</button>
                        </div>
                        <p className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-200 mt-1 min-h-[100px]">{work.description || 'No description.'}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
