import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Briefcase, Edit2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import WorkDetailsTabs from './WorkDetailsTabs';
import WorkDetailsModals from './WorkDetailsModals';

interface WorkDetailsProps {
  workId: string;
  onClose: () => void;
  onUpdate: () => void;
  onEdit: () => void;
}

export default function WorkDetails({ workId, onClose, onUpdate, onEdit }: WorkDetailsProps) {
  const [work, setWork] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [recurringInstances, setRecurringInstances] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const toast = useToast();

  useEffect(() => {
    fetchWorkDetails();
    fetchStaff();
  }, [workId]);

  const fetchWorkDetails = async () => {
    try {
      const [workRes, tasksRes, timeLogsRes, assignmentsRes, recurringRes] = await Promise.all([
        supabase
          .from('works')
          .select(`
            *,
            customers(name),
            services!works_service_id_fkey(name),
            staff_members(name)
          `)
          .eq('id', workId)
          .single(),

        supabase
          .from('work_tasks')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('sort_order'),

        supabase
          .from('time_logs')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('start_time', { ascending: false }),

        supabase
          .from('work_assignments')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('assigned_at', { ascending: false }),

        supabase
          .from('work_recurring_instances')
          .select('*, staff_members(name)')
          .eq('work_id', workId)
          .order('due_date', { ascending: false }),
      ]);

      if (workRes.data) setWork(workRes.data);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (timeLogsRes.data) setTimeLogs(timeLogsRes.data);

      if (assignmentsRes.data) {
        const enrichedAssignments = await Promise.all(
          assignmentsRes.data.map(async (assignment) => {
            if (assignment.reassigned_from) {
              const { data: fromStaff } = await supabase
                .from('staff_members')
                .select('name')
                .eq('id', assignment.reassigned_from)
                .maybeSingle();
              return { ...assignment, from_staff: fromStaff };
            }
            return assignment;
          })
        );
        setAssignments(enrichedAssignments);
      }

      if (recurringRes.data) setRecurringInstances(recurringRes.data);
    } catch (error) {
      console.error('Error fetching work details:', error);
      toast.error('Failed to load work details');
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, availability_status')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  if (loading || !work) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Briefcase size={28} />
              Work Details
            </h2>
            <p className="text-orange-100 text-sm mt-1">
              {work.customers?.name} • {work.services?.name}
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

        <WorkDetailsTabs
          work={work}
          tasks={tasks}
          timeLogs={timeLogs}
          assignments={assignments}
          recurringInstances={recurringInstances}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          fetchWorkDetails={fetchWorkDetails}
          onUpdate={onUpdate}
          staff={staff}
        />

        <WorkDetailsModals
          workId={workId}
          work={work}
          staff={staff}
          fetchWorkDetails={fetchWorkDetails}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}
