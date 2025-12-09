import { useState, useEffect } from 'react';
import { X, Plus, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface Service {
  id: string;
  name: string;
}

interface AddWorkModalProps {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onSuccess: () => void;
  autoFillCustomerName?: boolean;
}

const RECURRENCE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half-yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function AddWorkModal({ customerId, customerName, onClose, onSuccess, autoFillCustomerName = false }: AddWorkModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingServices, setLoadingServices] = useState(true);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurrenceType, setRecurrenceType] = useState<string>('monthly');
  const [periodCalculationType, setPeriodCalculationType] = useState<string>('previous_period');
  const [periodOffsetValue, setPeriodOffsetValue] = useState<number>(1);
  const [periodOffsetUnit, setPeriodOffsetUnit] = useState<string>('month');
  const [billingAmount, setBillingAmount] = useState<string>('');

  useEffect(() => {
    fetchServices();
  }, [user]);

  useEffect(() => {
    if (autoFillCustomerName && customerName && selectedServiceId && services.length > 0) {
      const service = services.find(s => s.id === selectedServiceId);
      if (service && !title) {
        setTitle(`${service.name} - ${customerName}`);
      }
    }
  }, [autoFillCustomerName, customerName, selectedServiceId, services]);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('user_id', user?.id)
        .order('name');

      if (error) throw error;
      setServices(data || []);
      if (data && data.length > 0) {
        setSelectedServiceId(data[0].id);
      }
    } catch (error: any) {
      showToast('Failed to load services', 'error');
    } finally {
      setLoadingServices(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedServiceId || !title) {
      showToast('Please fill in required fields', 'error');
      return;
    }

    setLoading(true);
    try {
      const workData: any = {
        customer_id: customerId,
        service_id: selectedServiceId,
        title,
        description: description || null,
        priority,
        due_date: dueDate || null,
        status: 'pending',
        billing_status: 'not_billed',
        is_recurring: isRecurring,
      };

      if (isRecurring) {
        workData.recurrence_pattern = recurrenceType;
        workData.period_calculation_type = periodCalculationType;
        workData.billing_amount = billingAmount ? parseFloat(billingAmount) : null;
      }

      const { error } = await supabase
        .from('works')
        .insert(workData);

      if (error) throw error;
      showToast('Work created successfully', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      showToast('Error: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full z-[10000]">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Plus size={24} />
              Create Work
            </h2>
            <p className="text-blue-100 text-sm mt-1">Customer: {customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service *
            </label>
            {loadingServices ? (
              <div className="h-10 bg-gray-100 rounded animate-pulse" />
            ) : (
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select a service</option>
                {services.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Work title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Work description"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center space-x-3 mb-3">
              <input
                type="checkbox"
                id="is_recurring"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="is_recurring" className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar size={16} />
                Recurring Work
              </label>
            </div>
            <p className="text-xs text-gray-600 ml-8 mb-3">
              Enable automatic period-based work generation. Configure task details in work settings after creation.
            </p>

            {isRecurring && (
              <div className="space-y-4 ml-8 pt-3 border-t border-blue-200">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    How Often? *
                  </label>
                  <select
                    value={recurrenceType}
                    onChange={(e) => setRecurrenceType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {RECURRENCE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {recurrenceType === 'daily' && (
                  <div className="bg-white rounded p-3 border border-blue-100 space-y-3">
                    <p className="text-xs font-medium text-gray-700">Daily Recurrence Settings</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Period Type
                      </label>
                      <select
                        value={periodCalculationType}
                        onChange={(e) => setPeriodCalculationType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="previous_period">Previous Day</option>
                        <option value="current_period">Current Day</option>
                        <option value="next_period">Next Day</option>
                      </select>
                    </div>
                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">Work is generated every day with period spanning 24 hours</p>
                  </div>
                )}

                {recurrenceType === 'weekly' && (
                  <div className="bg-white rounded p-3 border border-blue-100 space-y-3">
                    <p className="text-xs font-medium text-gray-700">Weekly Recurrence Settings</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Start Day of Week *
                      </label>
                      <select
                        value={periodCalculationType}
                        onChange={(e) => setPeriodCalculationType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="previous_period">Monday (Mon-Sun)</option>
                        <option value="current_period">Sunday (Sun-Sat)</option>
                        <option value="next_period">Custom Range</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Select which day your week starts on</p>
                    </div>
                  </div>
                )}

                {recurrenceType === 'monthly' && (
                  <div className="bg-white rounded p-3 border border-blue-100 space-y-3">
                    <p className="text-xs font-medium text-gray-700">Monthly Recurrence Settings</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Period Type *
                      </label>
                      <select
                        value={periodCalculationType}
                        onChange={(e) => setPeriodCalculationType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="previous_period">Previous Month</option>
                        <option value="current_period">Current Month</option>
                        <option value="next_period">Next Month</option>
                      </select>
                    </div>
                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">Calendar month basis (1st to last day)</p>
                  </div>
                )}

                {recurrenceType === 'quarterly' && (
                  <div className="bg-white rounded p-3 border border-blue-100 space-y-3">
                    <p className="text-xs font-medium text-gray-700">Quarterly Recurrence Settings</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Period Type *
                      </label>
                      <select
                        value={periodCalculationType}
                        onChange={(e) => setPeriodCalculationType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="previous_period">Previous Quarter</option>
                        <option value="current_period">Current Quarter</option>
                        <option value="next_period">Next Quarter</option>
                      </select>
                    </div>
                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)</p>
                  </div>
                )}

                {recurrenceType === 'half-yearly' && (
                  <div className="bg-white rounded p-3 border border-blue-100 space-y-3">
                    <p className="text-xs font-medium text-gray-700">Half-Yearly Recurrence Settings</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Period Type *
                      </label>
                      <select
                        value={periodCalculationType}
                        onChange={(e) => setPeriodCalculationType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="previous_period">Previous Half-Year</option>
                        <option value="current_period">Current Half-Year</option>
                        <option value="next_period">Next Half-Year</option>
                      </select>
                    </div>
                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">H1 (Jan-Jun), H2 (Jul-Dec)</p>
                  </div>
                )}

                {recurrenceType === 'yearly' && (
                  <div className="bg-white rounded p-3 border border-blue-100 space-y-3">
                    <p className="text-xs font-medium text-gray-700">Yearly Recurrence Settings</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Period Type *
                      </label>
                      <select
                        value={periodCalculationType}
                        onChange={(e) => setPeriodCalculationType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="previous_period">Previous Financial Year</option>
                        <option value="current_period">Current Financial Year</option>
                        <option value="next_period">Next Financial Year</option>
                      </select>
                    </div>
                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded">Financial Year: Apr-Mar (India standard)</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Default Billing Amount (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={billingAmount}
                    onChange={(e) => setBillingAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="₹"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Work'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
