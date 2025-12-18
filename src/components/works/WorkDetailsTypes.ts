export interface WorkDetailsProps {
  workId: string;
  onBack: () => void;
  onUpdate: () => void;
  onEdit?: () => void;
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToService?: (serviceId: string) => void;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  estimated_hours: number | null;
  actual_hours: number;
  due_date: string | null;
  remarks: string | null;
  staff_members: { name: string } | null;
}

export interface TimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  description: string | null;
  staff_members: { name: string };
}

export interface Assignment {
  id: string;
  assigned_at: string;
  status: string;
  reassigned_from: string | null;
  reassignment_reason: string | null;
  staff_members: { name: string };
  from_staff?: { name: string } | null;
}

export interface RecurringInstance {
  id: string;
  period_name: string;
  period_start_date: string;
  period_end_date: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  completed_by: string | null;
  staff_members: { name: string } | null;
  billing_amount: number | null;
  is_billed: boolean;
  invoice_id: string | null;
  created_at?: string;
  updated_at?: string;
  all_tasks_completed?: boolean;
  total_tasks?: number;
  completed_tasks?: number;
}

export interface Activity {
  id: string;
  type: 'work_created' | 'status_change' | 'assignment' | 'reassignment' | 'task_created' | 'task_completed' | 'time_logged' | 'recurring_period_created' | 'recurring_period_completed' | 'invoice_generated' | 'note_added';
  title: string;
  description: string;
  timestamp: string;
  user?: string;
  metadata?: any;
}

export interface WorkDocument {
  id: string;
  work_id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  is_required: boolean;
  is_collected: boolean;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  collected_at: string | null;
  uploaded_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaskForm {
  title: string;
  description: string;
  assigned_to: string;
  estimated_hours: string;
  due_date: string;
  priority: string;
  remarks: string;
}

export interface TimeForm {
  staff_member_id: string;
  start_time: string;
  end_time: string;
  description: string;
}

export interface RecurringForm {
  period_name: string;
  period_start_date: string;
  period_end_date: string;
  billing_amount: string;
  notes?: string;
}

export const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
};

export const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};
