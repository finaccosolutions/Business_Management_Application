export interface WorkDetailsProps {
  workId: string;
  onClose: () => void;
  onUpdate: () => void;
  onEdit: () => void;
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
  staff_member?: { name: string } | null;
  from_staff?: { name: string } | null;
}

export interface RecurringInstance {
  id: string;
  period_name: string;
  period_start_date: string;
  period_end_date: string;
  due_date: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  completed_by: string | null;
  completed_staff?: { name: string } | null;
  billing_amount: number | null;
  is_billed: boolean;
  invoice_id: string | null;
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
  due_date: string;
  billing_amount: string;
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
