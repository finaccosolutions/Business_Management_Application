import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Clock, Calendar, CheckCircle, AlertCircle, MessageSquare,
    ChevronDown, ChevronUp, User, MoreVertical, Send
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { useToast } from '../contexts/ToastContext';

interface WorkItem {
    id: string;
    title: string;
    work_number: string;
    description: string;
    status: string;
    priority: string;
    due_date: string;
    estimated_hours: number;
    assigned_to: string;
    assigned_staff?: { name: string };
    customer?: { name: string };
    tasks?: any[];
    time_logs?: any[];
    comments?: any[];
}

export default function AdminWorkMonitoring() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('in_progress');
    const [works, setWorks] = useState<WorkItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState('');

    useEffect(() => {
        fetchWorks();
    }, [activeTab]);

    const fetchWorks = async () => {
        setLoading(true);
        try {
            // Base Query
            let query = supabase
                .from('works')
                .select(`
          *,
          assigned_staff:staff_members!assigned_to(name),
          customer:customers(name),
          work_tasks(*),
          time_logs:work_time_logs(*)
        `)
                .eq('status', activeTab)
                .order('due_date', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;

            // Map the data to unify tasks from work_tasks and potentially recurring ones if we fetch them. 
            // For now, let's use work_tasks as 'tasks' prop to fix the crash.
            // If we need recurring tasks, we can fetch them separately or deeply nested.
            // Given the complexity, let's stick to direct work_tasks which usually contains the checklist items.

            const formattedData = (data || []).map((work: any) => ({
                ...work,
                tasks: work.work_tasks // Use work_tasks as the main tasks array
            }));

            setWorks(formattedData);
        } catch (error) {
            console.error('Error fetching works:', error);
            showToast('error', 'Failed to load works');
        } finally {
            setLoading(false);
        }
    };

    const fetchComments = async (workId: string) => {
        const { data } = await supabase
            .from('work_comments')
            .select('*, author:staff_members(name)')
            .eq('work_id', workId)
            .order('created_at', { ascending: true });

        setWorks(prev => prev.map(w => w.id === workId ? { ...w, comments: data || [] } : w));
    };

    const toggleExpand = (workId: string) => {
        if (expandedWorkId === workId) {
            setExpandedWorkId(null);
        } else {
            setExpandedWorkId(workId);
            // Load comments if not loaded
            const work = works.find(w => w.id === workId);
            if (work && !work.comments) {
                fetchComments(workId);
            }
        }
    };

    const activeTime = (logs: any[]) => {
        if (!logs) return 0;
        return logs.reduce((acc, log) => acc + (log.duration_minutes || 0), 0) / 60;
    };

    const handlePostComment = async (workId: string) => {
        if (!commentText.trim()) return;

        try {
            // Get staff id 
            const { data: staff } = await supabase.from('staff_members').select('id').eq('auth_user_id', user?.id).single();
            if (!staff) throw new Error('Not authorized');

            const { error } = await supabase.from('work_comments').insert({
                work_id: workId,
                author_id: staff.id,
                content: commentText
            });

            if (error) throw error;

            setCommentText('');
            fetchComments(workId);
        } catch (err) {
            showToast('error', 'Failed to post comment');
        }
    };

    const tabs = [
        { id: 'pending', label: 'Pending Start' },
        { id: 'in_progress', label: 'In Progress' },
        { id: 'review', label: 'Review' },
        { id: 'completed', label: 'Completed' },
        { id: 'overdue', label: 'Overdue' } // Logic needs adjustment for overdue, usually a filter
    ];

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Work Monitoring & Performance</h1>
                <div className="text-sm text-gray-500">Live Overview</div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Main Content */}
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-10"><div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 rounded-full border-t-transparent"></div></div>
                ) : works.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <p className="text-gray-500">No works found in this stage.</p>
                    </div>
                ) : (
                    works.map(work => {
                        const timeTaken = activeTime(work.time_logs || []);
                        const timeBudget = work.estimated_hours || 1; // avoid div by 0
                        const timePercent = Math.min((timeTaken / timeBudget) * 100, 100);
                        const timeColor = timeTaken > timeBudget ? 'bg-red-500' : timeTaken > timeBudget * 0.8 ? 'bg-yellow-500' : 'bg-green-500';

                        const totalTasks = work.tasks?.length || 0;
                        const completedTasks = work.tasks?.filter((t: any) => t.status === 'completed').length || 0;
                        const taskPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                        return (
                            <div key={work.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md">

                                {/* Card Header (Summary) */}
                                <div className="p-5 cursor-pointer" onClick={() => toggleExpand(work.id)}>
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        {/* Left: Info */}
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200">{work.work_number}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase
                                ${work.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}
                              `}>{work.priority}</span>
                                            </div>
                                            <h3 className="text-lg font-bold text-gray-900">{work.title}</h3>
                                            <p className="text-sm text-gray-500">{work.customer?.name || 'No Client'}</p>
                                        </div>

                                        {/* Middle: Metrics */}
                                        <div className="flex-1 space-y-3 min-w-[200px]">
                                            {/* Time Bar */}
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600">Time: {timeTaken.toFixed(1)}h / {timeBudget}h</span>
                                                    <span className={timeTaken > timeBudget ? 'text-red-600 font-bold' : 'text-gray-500'}>
                                                        {Math.round(timePercent)}%
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className={`h-full ${timeColor}`} style={{ width: `${timePercent}%` }}></div>
                                                </div>
                                            </div>

                                            {/* Task Bar */}
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600">Tasks: {completedTasks}/{totalTasks}</span>
                                                    <span className="text-blue-600 font-medium">{Math.round(taskPercent)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500" style={{ width: `${taskPercent}%` }}></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Assigned & Meta */}
                                        <div className="flex flex-col items-end gap-3 min-w-[150px]">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Assigned to:</span>
                                                {work.assigned_staff ? (
                                                    <div className="flex items-center gap-1.5 bg-gray-50 pl-1 pr-2 py-1 rounded-full border border-gray-200">
                                                        <div className='w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-700'>
                                                            {work.assigned_staff.name.charAt(0)}
                                                        </div>
                                                        <span className="text-xs font-medium">{work.assigned_staff.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">Unassigned</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 text-sm text-gray-500">
                                                <Calendar size={14} />
                                                {format(new Date(work.due_date), 'MMM dd, yyyy')}
                                            </div>

                                            {expandedWorkId === work.id ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {expandedWorkId === work.id && (
                                    <div className="border-t border-gray-200 bg-gray-50 p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">

                                        {/* Left: Task List & Status */}
                                        <div className="space-y-4">
                                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                <CheckCircle size={18} /> Tasks Breakdown
                                            </h4>
                                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                {(!work.tasks || work.tasks.length === 0) ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center">No tasks defined.</div>
                                                ) : (
                                                    <div className="divide-y divide-gray-100">
                                                        {work.tasks.sort((a, b) => a.sort_order - b.sort_order).map((task: any) => (
                                                            <div key={task.id} className="p-3 flex items-start gap-3 hover:bg-gray-50">
                                                                <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center
                                                     ${task.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                                                                    {task.status === 'completed' && <CheckCircle size={12} className="text-white" />}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <p className={`text-sm ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                                                        {task.title}
                                                                    </p>
                                                                    {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                                                                </div>
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold
                                                     ${task.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                        task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}
                                                 `}>{task.status.replace('_', ' ')}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Communication / Chat */}
                                        <div className="flex flex-col h-[400px]">
                                            <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                                                <MessageSquare size={18} /> Team Chat & Updates
                                            </h4>

                                            {/* Messages Area */}
                                            <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-y-auto p-4 space-y-4 mb-4">
                                                {(!work.comments || work.comments.length === 0) ? (
                                                    <div className="text-center text-gray-400 text-sm py-10">No comments yet. Start the discussion!</div>
                                                ) : (
                                                    work.comments.map((comment: any) => (
                                                        <div key={comment.id} className="flex gap-3">
                                                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-600">
                                                                {comment.author?.name?.charAt(0) || '?'}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-2">
                                                                    <p className="text-xs font-bold text-gray-700 mb-0.5">{comment.author?.name}</p>
                                                                    <p className="text-sm text-gray-800">{comment.content}</p>
                                                                </div>
                                                                <p className="text-[10px] text-gray-400 mt-1 pl-2">
                                                                    {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Input Area */}
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={commentText}
                                                    onChange={(e) => setCommentText(e.target.value)}
                                                    placeholder="Type a comment or update..."
                                                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment(work.id)}
                                                />
                                                <button
                                                    onClick={() => handlePostComment(work.id)}
                                                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
                                                >
                                                    <Send size={20} />
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                )}

                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
