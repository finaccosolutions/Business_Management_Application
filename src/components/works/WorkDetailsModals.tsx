import { X, AlertCircle, Edit2, Users } from 'lucide-react';
import { TaskForm, TimeForm, RecurringForm, Task, TimeLog, RecurringInstance } from './WorkDetailsTypes';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      bg: 'bg-red-600',
      hoverBg: 'hover:bg-red-700',
      icon: 'text-red-600',
    },
    warning: {
      bg: 'bg-orange-600',
      hoverBg: 'hover:bg-orange-700',
      icon: 'text-orange-600',
    },
    info: {
      bg: 'bg-blue-600',
      hoverBg: 'hover:bg-blue-700',
      icon: 'text-blue-600',
    },
  };

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-scale-in">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className={`${styles.icon}`} size={24} />
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-gray-700">{message}</p>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 px-4 py-2 ${styles.bg} text-white font-medium rounded-lg ${styles.hoverBg} transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  form: TaskForm;
  setForm: (form: TaskForm) => void;
  staff: any[];
  isEditing?: boolean;
}

export function TaskModal({ isOpen, onClose, onSubmit, form, setForm, staff, isEditing = false }: TaskModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className={`p-6 border-b border-gray-200 ${isEditing ? 'bg-gradient-to-r from-blue-600 to-cyan-600' : 'bg-gradient-to-r from-orange-600 to-amber-600'}`}>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {isEditing && <Edit2 size={24} />}
            {isEditing ? 'Edit Task' : 'Add New Task'}
          </h3>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              placeholder="Task title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              rows={3}
              placeholder="Task description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
              <select
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Est. Hours</label>
              <input
                type="number"
                step="0.5"
                value={form.estimated_hours}
                onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              rows={2}
              placeholder="Any additional notes or instructions"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 px-4 py-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white font-medium rounded-lg transition-colors`}
            >
              {isEditing ? 'Update Task' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TimeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  form: TimeForm;
  setForm: (form: TimeForm) => void;
  staff: any[];
  isEditing?: boolean;
}

export function TimeLogModal({ isOpen, onClose, onSubmit, form, setForm, staff, isEditing = false }: TimeLogModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        <div className={`p-6 border-b border-gray-200 ${isEditing ? 'bg-gradient-to-r from-blue-600 to-cyan-600' : 'bg-gradient-to-r from-orange-600 to-amber-600'}`}>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {isEditing && <Edit2 size={24} />}
            {isEditing ? 'Edit Time Log' : 'Log Time'}
          </h3>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Staff Member <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.staff_member_id}
              onChange={(e) => setForm({ ...form, staff_member_id: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'}`}
            >
              <option value="">Select staff member</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
              <input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'}`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'}`}
              rows={2}
              placeholder="What did you work on?"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 px-4 py-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white font-medium rounded-lg transition-colors`}
            >
              {isEditing ? 'Update Time Log' : 'Log Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RecurringPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  form: RecurringForm;
  setForm: (form: RecurringForm) => void;
  isEditing?: boolean;
}

export function RecurringPeriodModal({ isOpen, onClose, onSubmit, form, setForm, isEditing = false }: RecurringPeriodModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        <div className={`p-6 border-b border-gray-200 ${isEditing ? 'bg-gradient-to-r from-blue-600 to-cyan-600' : 'bg-gradient-to-r from-orange-600 to-amber-600'}`}>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {isEditing && <Edit2 size={24} />}
            {isEditing ? 'Edit Recurring Period' : 'Add Recurring Period'}
          </h3>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.period_name}
              onChange={(e) => setForm({ ...form, period_name: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              placeholder="e.g., January 2024, Q1 2024"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Period Start <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.period_start_date}
                onChange={(e) => setForm({ ...form, period_start_date: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Period End <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.period_end_date}
                onChange={(e) => setForm({ ...form, period_end_date: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billing Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={form.billing_amount}
                onChange={(e) => setForm({ ...form, billing_amount: e.target.value })}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${isEditing ? 'focus:ring-blue-500' : 'focus:ring-orange-500'} focus:border-transparent`}
              rows={2}
              placeholder="Any notes or special instructions for this period"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-gray-700">
              <strong>Note:</strong> If billing amount is not specified, it will use the work's default billing amount when generating invoice.
            </p>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 px-4 py-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white font-medium rounded-lg transition-colors`}
            >
              {isEditing ? 'Update Period' : 'Add Period'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AssignStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (staffId: string) => void;
  work: any;
  staff: any[];
  onRequestReassign: (staffId: string) => void;
}

export function AssignStaffModal({ isOpen, onClose, onAssign, work, staff, onRequestReassign }: AssignStaffModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={24} />
            {work.assigned_to ? 'Reassign Work' : 'Assign Work'}
          </h3>
          {work.assigned_to && work.staff_members && (
            <p className="text-orange-100 text-sm mt-1">
              Currently assigned to: {work.staff_members.name}
            </p>
          )}
        </div>
        <div className="p-6 space-y-2 max-h-96 overflow-y-auto">
          {staff.length === 0 ? (
            <div className="text-center py-8">
              <Users size={48} className="mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600">No active staff members available</p>
              <p className="text-sm text-gray-500 mt-1">Add staff members first</p>
            </div>
          ) : (
            staff.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (work.assigned_to && s.id !== work.assigned_to) {
                    onRequestReassign(s.id);
                  } else if (!work.assigned_to) {
                    onAssign(s.id);
                  }
                }}
                disabled={s.id === work.assigned_to}
                className={`w-full px-4 py-3 text-left border border-gray-200 rounded-lg transition-all font-medium ${
                  s.id === work.assigned_to
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'hover:border-orange-500 hover:bg-orange-50 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{s.name}</span>
                  {s.id === work.assigned_to && (
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded">Current</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReassignReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  reason: string;
  setReason: (reason: string) => void;
}

export function ReassignReasonModal({ isOpen, onClose, onConfirm, reason, setReason }: ReassignReasonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-600 to-amber-600">
          <h3 className="text-xl font-bold text-white">Reassignment Reason</h3>
          <p className="text-orange-100 text-sm mt-1">
            Provide a reason for reassignment (optional)
          </p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason for Reassignment
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            rows={4}
            placeholder="e.g., Staff member on leave, workload balancing, expertise match..."
          />
        </div>
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors"
          >
            Confirm Reassignment
          </button>
        </div>
      </div>
    </div>
  );
}
