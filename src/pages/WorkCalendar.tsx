import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, X, CheckCircle, AlertCircle } from 'lucide-react';

import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, addDays, isBefore, startOfDay } from 'date-fns';

interface CalendarEvent {
    id: string;
    title: string;
    type: 'work' | 'task' | 'subtask';
    date: Date;
    status: string;
    assigned_to?: string;
    staff_name?: string;
    priority?: string;
    work_id?: string; // Optional for recurring instances to link back to parent
    is_recurring_instance?: boolean;
    debug_period_end?: string;
}

interface WorkCalendarProps {
    onNavigate?: (page: string, params?: any) => void;
}

export default function WorkCalendar({ onNavigate }: WorkCalendarProps) {
    const { user, role } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'my'>('all');

    useEffect(() => {
        fetchEvents();
    }, [currentDate, filter, user]);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            setLoading(true);
            const monthStart = startOfMonth(currentDate);
            const monthEnd = endOfMonth(currentDate);
            const startDate = startOfWeek(monthStart);
            const endDate = endOfWeek(monthEnd);

            const start = format(startDate, 'yyyy-MM-dd');
            const end = format(endDate, 'yyyy-MM-dd');
            console.log('Fetching range:', start, 'to', end);

            let shouldViewAll = role === 'admin';

            // Check permissions if staff
            if (role === 'staff' && user) {
                const { data: staffData } = await supabase
                    .from('staff_members')
                    .select('detailed_permissions')
                    .eq('auth_user_id', user.id)
                    .single();

                if (staffData?.detailed_permissions?.works?.view_all) {
                    shouldViewAll = true;
                }
            }

            // Allow manual toggle override ONLY if user has permission to view all, OR if they are just viewing 'my'
            // If they don't have permission to view all, force 'my' filter logic (or just fetch assigned)

            // However, the UI filter state 'filter' is what the user *wants* to see.
            // If they want to see 'all', we only show 'all' if they have permission.
            // If they want to see 'my', we show 'my'.

            let effectiveFilter = filter;
            if (role === 'staff' && filter === 'all' && !shouldViewAll) {
                effectiveFilter = 'my';
                // Optionally could warn user or setFilter('my') but that might cause re-render loop if not careful.
                // For now, let's just restrict the query.
            }

            // 1. Fetch Staff ID if needed for filtering
            let currentStaffId: string | null = null;
            if (role === 'staff') {
                const { data: sData } = await supabase.from('staff_members').select('id').eq('auth_user_id', user!.id).single();
                currentStaffId = sData?.id || null;
            }

            // 2. Debug & Filter Application
            // Apply Staff Permissions Logic: If Staff Role + No View All -> Enforce 'my' filter
            if (role === 'staff' && filter === 'all' && !shouldViewAll) {
                effectiveFilter = 'my';
            }

            // 1. Fetch Work Tasks
            let allWorkTasksQuery = supabase
                .from('work_tasks')
                .select(`
                    id, title, status, priority, due_date, assigned_to, work_id,
                    staff_members(name),
                    works (
                        id, title, recurrence_pattern, assigned_to
                    )
                `)
                .or(`due_date.gte.${format(startDate, 'yyyy-MM-dd')},due_date.lte.${format(endDate, 'yyyy-MM-dd')}`);

            // STRICT filtering for staff without view_all permission
            // We do NOT filter by query here to handle the case where tasks have null assigned_to 
            // but the parent work is assigned to the staff.
            // We will filter in memory below.

            const { data: rawWorkTasks, error: ottError } = await allWorkTasksQuery;
            if (ottError) console.error('Work Tasks Error:', ottError);

            let allWorkTasks = rawWorkTasks || [];

            // Apply "My Data" filter in memory to handle inheritance
            if (role === 'staff' && effectiveFilter === 'my' && currentStaffId) {
                allWorkTasks = allWorkTasks.filter((t: any) =>
                    t.assigned_to === currentStaffId ||
                    (!t.assigned_to && t.works?.assigned_to === currentStaffId)
                );
            }

            // Filter: Only keep tasks where work is Non-Recurring (one-time or null)
            const oneTimeTasks = allWorkTasks?.filter((t: any) =>
                !t.works ||
                t.works.recurrence_pattern === 'one-time' ||
                !t.works.recurrence_pattern
            );
            console.log('Filtered One-time Tasks:', oneTimeTasks);

            // Also fetch Works that fall in this range (to show the Work item itself if desired, or if it has no tasks)
            let worksQuery = supabase
                .from('works')
                .select(`
                    id, title, due_date, start_date, status, priority, assigned_to,
                    staff_members(name)
                `)
                .eq('recurrence_pattern', 'one-time')
                .gte('due_date', start)
                .lte('due_date', end);

            if (role === 'staff' && effectiveFilter === 'my' && currentStaffId) {
                worksQuery = worksQuery.eq('assigned_to', currentStaffId);
            }
            const { data: works } = await worksQuery;

            // Safe Date Parsing Helper to avoid Timezone issues (treat dates as Local "Wall Clock" time)
            const parseDateSafe = (dateStr: string | null | undefined): Date | null => {
                if (!dateStr) return null;
                // Split YYYY-MM-DD
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // 0-indexed
                    const day = parseInt(parts[2], 10);
                    return new Date(year, month, day);
                }
                return null; // Invalid format
            };


            {/* ... */ }

            // ... (Inside formattedEvents logic later)

            // ...

            // Navigation Buttons
            // 3. Fetch Existing Recurring Period Tasks (Generated Instances)
            let tasksQuery = supabase
                .from('recurring_period_tasks')
                .select(`
                        id, title, due_date, status, priority, assigned_to, service_task_id,
                        staff_members!assigned_to(name),
                        work_recurring_instances (
                        period_name, period_end_date,
                        works (id, title, assigned_to)
                        )
                        `)
                .gte('due_date', start)
                .lte('due_date', end);

            // Fetch first, filter later
            const { data: rawTasks, error: tasksError } = await tasksQuery;
            if (tasksError) console.error('Tasks Error:', tasksError);

            let tasks = rawTasks || [];

            if (role === 'staff' && effectiveFilter === 'my' && currentStaffId) {
                tasks = tasks.filter((t: any) =>
                    t.assigned_to === currentStaffId ||
                    (!t.assigned_to && t.work_recurring_instances?.works?.assigned_to === currentStaffId)
                );
            }

            // 4. Subtasks logic removed to avoid duplication and mix-up.
            // "Ad-hoc" tasks on recurring works are currently ignored based on user request to separate sources strictly.
            // If they are needed, they should be fetched distinctly or user flow should define them better.
            const subTasks: any[] = [];

            // 5. Projection Logic Disabled per user request to only show table data.
            // "instead of run the function why dont you take the tasks and due date from the corresponding tables"
            /*
            const { data: recurringWorksData } = await supabase
                .from('works')
                // ...
                .eq('status', 'active');
            */ const recurringWorksData: any[] = [];


            let projectedEvents: CalendarEvent[] = [];

            if (recurringWorksData) {
                recurringWorksData.forEach((work: any) => {
                    const workStart = parseDateSafe(work.start_date) || new Date(0);
                    const viewStart = startDate; // Already Date objects
                    const viewEnd = endDate;

                    const tasksList = work.services?.service_tasks || [];
                    tasksList.forEach((taskTemplate: any) => {
                        if (taskTemplate.is_active === false) return;

                        // Find config override
                        const config = work.work_task_configs?.find((c: any) => c.service_task_id === taskTemplate.id);

                        const workRecurrence = (work.recurrence_pattern || 'monthly').toLowerCase();

                        // Resolve Configs
                        const offsetType = config?.due_offset_type || taskTemplate.due_offset_type;
                        const offsetValue = config?.due_offset_value ?? taskTemplate.due_offset_value;
                        const exactDate = config?.exact_due_date;
                        const assignedTo = config?.assigned_to;

                        // Filter by assignment for projection
                        if (role === 'staff' && effectiveFilter === 'my') {
                            if (assignedTo !== currentStaffId) return;
                        }

                        // Projection Helper
                        const calcDueDate = (periodEnd: Date): Date | null => {
                            if (exactDate) {
                                const ed = parseDateSafe(exactDate);
                                return ed;
                            }
                            let due = new Date(periodEnd);
                            if (offsetType === 'day' || offsetType === 'days') {
                                due = addDays(due, offsetValue || 0);
                            } else if (offsetType === 'month' || offsetType === 'months') {
                                due = addMonths(due, offsetValue || 0);
                            } else if (offsetType === 'day_of_month') {
                                const y = periodEnd.getFullYear();
                                const m = periodEnd.getMonth();
                                const maxDay = new Date(y, m + 1, 0).getDate();
                                const day = Math.min(Math.max(offsetValue || 1, 1), maxDay);
                                due = new Date(y, m, day);
                            }
                            return due;
                        };

                        // 1. Monthly Work
                        if (workRecurrence === 'monthly') {
                            let iter = startOfMonth(subMonths(viewStart, 1));
                            const limit = endOfMonth(addMonths(viewEnd, 1));

                            while (iter <= limit) {
                                const pEnd = endOfMonth(iter);
                                const dueDate = calcDueDate(pEnd);

                                if (dueDate && dueDate >= viewStart && dueDate <= viewEnd && dueDate >= workStart) {
                                    projectedEvents.push({
                                        id: `projected-${work.id}-${taskTemplate.id}-${format(dueDate, 'yyyy-MM-dd')}`,
                                        title: `${work.title} - ${taskTemplate.title}`,
                                        type: 'task',
                                        date: dueDate,
                                        status: 'pending', // Always pending for projected
                                        assigned_to: assignedTo,
                                        staff_name: '', // We don't have join for this yet, could fetch map if needed
                                        priority: taskTemplate.priority,
                                        work_id: work.id,
                                        // @ts-ignore
                                        service_task_id: taskTemplate.id
                                    });
                                }
                                iter = addMonths(iter, 1);
                            }
                        }
                        // 2. Weekly Work
                        else if (workRecurrence === 'weekly') {
                            let iter = startOfWeek(viewStart, { weekStartsOn: 1 });
                            const limit = endOfWeek(viewEnd, { weekStartsOn: 1 });

                            while (iter <= limit) {
                                const pEnd = endOfWeek(iter, { weekStartsOn: 1 });
                                const dueDate = calcDueDate(pEnd);
                                if (dueDate && dueDate >= viewStart && dueDate <= viewEnd && dueDate >= workStart) {
                                    projectedEvents.push({
                                        id: `projected-${work.id}-${taskTemplate.id}-${format(dueDate, 'yyyy-MM-dd')}`,
                                        title: `${work.title} - ${taskTemplate.title}`,
                                        type: 'task',
                                        date: dueDate,
                                        status: 'pending',
                                        assigned_to: assignedTo,
                                        work_id: work.id,
                                        priority: taskTemplate.priority,
                                        // @ts-ignore
                                        service_task_id: taskTemplate.id
                                    });
                                }
                                iter = addDays(iter, 7);
                            }
                        }
                        // 3. Quarterly Work
                        else if (workRecurrence === 'quarterly') {
                            let iter = startOfMonth(subMonths(viewStart, 3));
                            const limit = endOfMonth(addMonths(viewEnd, 3));
                            while (iter <= limit) {
                                // Standard Quarters check (Ends Mar, Jun, Sep, Dec)
                                if ([2, 5, 8, 11].includes(iter.getMonth())) {
                                    const pEnd = endOfMonth(iter);
                                    const dueDate = calcDueDate(pEnd);
                                    if (dueDate && dueDate >= viewStart && dueDate <= viewEnd && dueDate >= workStart) {
                                        projectedEvents.push({
                                            id: `projected-${work.id}-${taskTemplate.id}-${format(dueDate, 'yyyy-MM-dd')}`,
                                            title: `${work.title} - ${taskTemplate.title}`,
                                            type: 'task',
                                            date: dueDate,
                                            status: 'pending',
                                            assigned_to: assignedTo,
                                            work_id: work.id,
                                            priority: taskTemplate.priority,
                                            // @ts-ignore
                                            service_task_id: taskTemplate.id
                                        });
                                    }
                                }
                                iter = addMonths(iter, 1);
                            }
                        }
                    });
                });
            }

            // Deduplication and Projection disabled.
            // const realTaskKeys = ...
            // const uniqueProjected = ...


            const formattedEvents: CalendarEvent[] = [];

            // 1. One-time Tasks (Fetched Directly)
            formattedEvents.push(...(oneTimeTasks || []).map((wt: any) => ({
                id: `work-task-${wt.id}`,
                title: `${wt.works?.title || 'Work'} - ${wt.title}`,
                priority: wt.priority,
                status: wt.status,
                type: 'task' as const,
                date: parseDateSafe(wt.due_date) || new Date(),
                assigned_to: wt.assigned_to,
                work_id: wt.work_id
            })));

            // 2. One-time Works (The Work item itself)
            if (works) {
                works.forEach((work: any) => {
                    formattedEvents.push({
                        id: `work-${work.id}`,
                        title: work.title,
                        type: 'work',
                        date: parseDateSafe(work.due_date) || new Date(),
                        status: work.status,
                        assigned_to: work.assigned_to,
                        staff_name: work.staff_members?.name,
                        priority: work.priority
                    });
                });
            }
            // 2. Real Recurring Tasks
            formattedEvents.push(...(tasks || []).map((task: any) => ({
                id: `task-${task.id}`,
                work_id: task.work_recurring_instances?.works?.id,
                title: `${task.work_recurring_instances?.works?.title || 'Unknown Work'} - ${task.title}`,
                type: 'task' as const,
                date: parseDateSafe(task.due_date) || new Date(),
                status: task.status,
                assigned_to: task.assigned_to,
                staff_name: task.staff_members?.name,
                priority: task.priority,
                debug_period_end: task.work_recurring_instances?.period_end_date
            })));

            // 3. Projected Tasks (Disabled)
            /*
            if (typeof uniqueProjected !== 'undefined') {
                formattedEvents.push(...uniqueProjected);
            }
            */

            // 4. Subtasks
            formattedEvents.push(...(subTasks || []).map((task: any) => ({
                id: `subtask-${task.id}`,
                work_id: task.work_id,
                title: `${task.works?.title || 'Unknown Work'}: ${task.title}`,
                type: 'subtask' as const,
                date: parseDateSafe(task.due_date) || new Date(),
                status: task.status,
                assigned_to: task.assigned_to,
                staff_name: task.staff_members?.name,
                priority: task.priority
            })));

            setEvents(formattedEvents);
        } catch (error) {
            console.error('Error fetching calendar events:', error);
        } finally {
            setLoading(false);
        }
    };

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate)),
        end: endOfWeek(endOfMonth(currentDate))
    });

    const getDayEvents = (day: Date) => events.filter(e => isSameDay(e.date, day));

    const getEventStyle = (event: CalendarEvent) => {
        if (event.status === 'completed') {
            return 'bg-emerald-100 text-emerald-800 border-emerald-200 line-through opacity-70';
        }

        // Overdue check: Due date is before today (start of today)
        const isOverdue = isBefore(event.date, startOfDay(new Date()));
        if (isOverdue && event.status !== 'completed') {
            return 'bg-red-100 text-red-800 border-red-200 font-medium';
        }

        // Pending / Scheduled
        switch (event.priority) {
            case 'urgent': return 'bg-amber-100 text-amber-900 border-amber-200';
            default: return 'bg-blue-50 text-blue-700 border-blue-200';
        }
    };

    const [selectedDayStrings, setSelectedDayStrings] = useState<string | null>(null);
    const [selectedEvents, setSelectedEvents] = useState<CalendarEvent[]>([]);

    const handleDayClick = (dayStr: string, events: CalendarEvent[]) => {
        setSelectedDayStrings(dayStr);
        setSelectedEvents(events);
    };

    const [lastWheelTime, setLastWheelTime] = useState(0);

    const handleWheel = (e: React.WheelEvent) => {
        const now = Date.now();
        if (now - lastWheelTime < 500) return; // 500ms cooldown

        // Check for significant scroll to avoid accidental triggers
        if (Math.abs(e.deltaX) > 10 || Math.abs(e.deltaY) > 10) {
            if (e.deltaX > 0 || e.deltaY > 0) {
                nextMonth();
            } else {
                prevMonth();
            }
            setLastWheelTime(now);
        }
    };

    const closeModal = () => {
        setSelectedDayStrings(null);
        setSelectedEvents([]);
    };

    const [showDebug, setShowDebug] = useState(false);

    // ... (rest of logic)

    return (
        <div className="p-4 w-full relative group" onWheel={handleWheel}>
            {/* Navigation Buttons - Absolute relative to container */}
            <button
                onClick={prevMonth}
                className="absolute left-2 top-24 md:top-28 p-2 bg-white shadow-md rounded-full text-gray-600 hover:text-blue-600 z-10 border border-gray-200 opacity-60 hover:opacity-100 transition-all"
                title="Previous Month"
            >
                <ChevronLeft size={24} />
            </button>
            <button
                onClick={nextMonth}
                className="absolute right-2 top-24 md:top-28 p-2 bg-white shadow-md rounded-full text-gray-600 hover:text-blue-600 z-10 border border-gray-200 opacity-60 hover:opacity-100 transition-all"
                title="Next Month"
            >
                <ChevronRight size={24} />
            </button>

            {/* Debug Toggle */}
            <div className="absolute top-0 right-0 p-2 opacity-0 hover:opacity-100 transition-opacity">
                <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-gray-400 underline">Debug</button>
            </div>

            {/* Debug Panel */}
            {showDebug && (
                <div className="fixed bottom-0 left-0 right-0 bg-black/90 text-green-400 p-4 z-[60] h-64 overflow-auto font-mono text-xs opacity-95">
                    <div className="flex justify-between border-b border-gray-700 pb-2 mb-2">
                        <h3 className="font-bold">Debug Info</h3>
                        <button onClick={() => setShowDebug(false)}><X size={16} /></button>
                    </div>
                    <p>Current View: {format(currentDate, 'yyyy-MM-dd')}</p>
                    <p>Filter: {filter} | Role: {role}</p>
                    <p>Total Events: {events.length}</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <strong>Events Dump (First 5):</strong>
                            <pre>{JSON.stringify(events.slice(0, 5), null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <CalendarIcon className="text-blue-600" />
                    Work Calendar - {format(currentDate, 'MMMM yyyy')}
                </h1>

                <div className="flex items-center gap-4">
                    {role === 'staff' && (
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === 'all' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                                    }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilter('my')}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === 'my' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                                    }`}
                            >
                                My Works
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 p-1">
                        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-md">
                            <ChevronLeft size={20} />
                        </button>
                        <span className="font-semibold text-gray-900 min-w-[140px] text-center">
                            {format(currentDate, 'MMMM yyyy')}
                        </span>
                        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-md">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden relative">
                {loading && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                )}
                {/* Days Header */}
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="py-3 text-center text-sm font-semibold text-gray-600">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 auto-rows-fr bg-gray-100 gap-px border-b border-gray-200">
                    {days.map(day => {
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const dayEvents = getDayEvents(day);
                        const isTodayDate = isToday(day);

                        return (
                            <div
                                key={day.toString()}
                                onClick={() => handleDayClick(day.toISOString(), dayEvents)}
                                className={`min-h-[110px] bg-white border border-gray-200 p-2 transition-colors hover:bg-gray-50 cursor-pointer overflow-hidden ${!isCurrentMonth ? 'bg-gray-100/60 opacity-60' : ''
                                    } ${selectedDayStrings === day.toISOString() ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span
                                        className={`text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isTodayDate
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : !isCurrentMonth ? 'text-gray-300' : 'text-gray-900'
                                            }`}
                                    >
                                        {format(day, 'd')}
                                    </span>
                                    {dayEvents.length > 0 && (
                                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                            {dayEvents.length} items
                                        </span>
                                    )}
                                </div>

                                <div className="mt-2 space-y-1.5 overflow-hidden">
                                    {dayEvents.slice(0, 3).map(event => (
                                        <div
                                            key={event.id}
                                            className={`text-[11px] px-1.5 py-1 rounded border truncate transition-all hover:brightness-95 ${getEventStyle(event)}`}
                                        >
                                            <div className="font-medium truncate flex items-center gap-1">
                                                <span className="opacity-70 text-[9px] uppercase tracking-tighter">
                                                    {event.type === 'subtask' ? 'TSK' : event.type === 'work' ? 'ORK' : 'REC'}
                                                </span>
                                                {event.title}
                                            </div>
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <div className="text-[10px] text-gray-500 font-medium pl-1">
                                            + {dayEvents.length - 3} more
                                        </div>
                                    )}
                                </div>
                            </div>

                        );
                    })}
                </div>
            </div>

            {/* Event Details Modal */}
            {selectedDayStrings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {selectedDayStrings ? format(new Date(selectedDayStrings), 'dd/MM/yyyy - EEEE') : ''}
                                </h3>
                                <p className="text-sm text-gray-500">{selectedEvents.length} items scheduled</p>
                            </div>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {selectedEvents.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>No events scheduled for this day.</p>
                                </div>
                            ) : (
                                selectedEvents.map(event => (
                                    <div
                                        key={event.id}
                                        onClick={() => {
                                            if (onNavigate) {
                                                // Navigate to the work details (parent work for instances/tasks)
                                                const targetId = event.work_id || (event.type === 'work' ? event.id : undefined);

                                                if (targetId) {
                                                    onNavigate('work-details', { id: targetId });
                                                }
                                            }
                                        }}
                                        className={`p-4 rounded-xl border-l-[6px] shadow-sm bg-white border-y border-r border-gray-100 cursor-pointer hover:shadow-md transition-all group ${event.status === 'completed' ? 'border-l-emerald-500 opacity-80' :
                                            isBefore(event.date, startOfDay(new Date())) ? 'border-l-red-500 bg-red-50/10' :
                                                'border-l-blue-500'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${event.type === 'work' ? 'bg-indigo-50 text-indigo-700' :
                                                event.type === 'task' ? 'bg-teal-50 text-teal-700' :
                                                    'bg-purple-50 text-purple-700'
                                                }`}>
                                                {event.type === 'subtask' ? 'Task' : event.type}
                                            </span>
                                            {event.status === 'completed' && (
                                                <CheckCircle size={14} className="text-green-500" />
                                            )}
                                        </div>
                                        <h4 className={`font-semibold text-gray-900 ${event.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                                            {event.title}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                                            {event.staff_name ? (
                                                <div className="flex items-center gap-1">
                                                    <Users size={12} /> {event.staff_name}
                                                </div>
                                            ) : (
                                                <span className="text-amber-600 flex items-center gap-1">
                                                    <AlertCircle size={12} /> Unassigned
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
}
