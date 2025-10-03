import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, CreditCard as Edit2, Trash2, ClipboardList, Calendar, AlertCircle, CheckCircle, Clock, FileText, Eye } from 'lucide-react';
import WorkDetails from '../components/WorkDetails';

interface Work {
  id: string;
  customer_id: string;
  service_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  customers: { name: string };
  services: { name: string };
}

interface Customer {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
}

const statusConfig = {
  pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { color: 'bg-blue-100 text-blue-700', icon: Clock },
  completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const priorityColors = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function Works() {
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceWorkId, setInvoiceWorkId] = useState<string | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    customer_id: '',
    service_id: '',
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    due_date: '',
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [worksResult, customersResult, servicesResult] = await Promise.all([
        supabase
          .from('works')
          .select('*, customers(name), services(name)')
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('services').select('id, name').order('name'),
      ]);

      if (worksResult.error) throw worksResult.error;
      if (customersResult.error) throw customersResult.error;
      if (servicesResult.error) throw servicesResult.error;

      setWorks(worksResult.data || []);
      setCustomers(customersResult.data || []);
      setServices(servicesResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const workData = {
        user_id: user!.id,
        customer_id: formData.customer_id,
        service_id: formData.service_id,
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date || null,
        updated_at: new Date().toISOString(),
      };

      if (editingWork) {
        const { error } = await supabase.from('works').update(workData).eq('id', editingWork.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('works').insert(workData);
        if (error) throw error;
      }

      setShowModal(false);
      setEditingWork(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving work:', error);
    }
  };

  const handleEdit = (work: Work) => {
    setEditingWork(work);
    setFormData({
      customer_id: work.customer_id,
      service_id: work.service_id,
      title: work.title,
      description: work.description || '',
      status: work.status,
      priority: work.priority,
      due_date: work.due_date || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this work?')) return;

    try {
      const { error } = await supabase.from('works').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting work:', error);
    }
  };

  const handleCreateInvoice = (work: Work) => {
    setInvoiceWorkId(work.id);
    setInvoiceAmount((work.actual_hours || 0) * 1000);
    setShowInvoiceModal(true);
  };

  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceWorkId) return;

    try {
      const work = works.find(w => w.id === invoiceWorkId);
      if (!work) return;

      const invoiceNumber = `INV-${Date.now()}`;
      const amount = parseFloat(invoiceAmount);
      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);

      const { error } = await supabase.from('invoices').insert({
        user_id: user!.id,
        customer_id: work.customer_id,
        work_id: invoiceWorkId,
        invoice_number: invoiceNumber,
        invoice_date: today.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        subtotal: amount,
        tax_amount: 0,
        total_amount: amount,
        status: 'draft',
      });

      if (error) throw error;

      await supabase
        .from('works')
        .update({ billing_status: 'billed' })
        .eq('id', invoiceWorkId);

      alert('Invoice created successfully!');
      setShowInvoiceModal(false);
      setInvoiceWorkId(null);
      setInvoiceAmount('');
      fetchData();
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice');
    }
  };

  const resetForm = () => {
    setFormData({
      customer_id: '',
      service_id: '',
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      due_date: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWork(null);
    resetForm();
  };

  const filteredWorks =
    filterStatus === 'all' ? works : works.filter((work) => work.status === filterStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Works</h1>
          <p className="text-gray-600 mt-1">Track and manage all your work assignments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Work</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'in_progress', 'completed', 'overdue'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              filterStatus === status
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {status.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredWorks.map((work) => {
          const StatusIcon = statusConfig[work.status as keyof typeof statusConfig]?.icon || Clock;
          return (
            <div
              key={work.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2">{work.title}</h3>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                        statusConfig[work.status as keyof typeof statusConfig]?.color || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {work.status.replace('_', ' ')}
                    </span>
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded-full ${
                        priorityColors[work.priority as keyof typeof priorityColors] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {work.priority}
                    </span>
                  </div>
                </div>
                <ClipboardList className="w-8 h-8 text-orange-600 ml-2" />
              </div>

              {work.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{work.description}</p>
              )}

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center text-gray-700">
                  <span className="font-medium mr-2">Customer:</span>
                  <span>{work.customers.name}</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <span className="font-medium mr-2">Service:</span>
                  <span>{work.services.name}</span>
                </div>
                {work.due_date && (
                  <div className="flex items-center text-gray-700">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>Due: {new Date(work.due_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2 pt-4 border-t border-gray-100">
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedWork(work.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Details</span>
                  </button>
                  <button
                    onClick={() => handleEdit(work)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                </div>
                <div className="flex space-x-2">
                  {work.status === 'completed' && (
                    <button
                      onClick={() => handleCreateInvoice(work)}
                      className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors text-sm"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Invoice</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(work.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredWorks.length === 0 && (
          <div className="col-span-full text-center py-12">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No works found</h3>
            <p className="text-gray-600 mb-4">
              {filterStatus === 'all'
                ? 'Start by creating your first work assignment'
                : 'No works match the selected filter'}
            </p>
            {filterStatus === 'all' && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Work</span>
              </button>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingWork ? 'Edit Work' : 'Add New Work'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Work title"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer *
                  </label>
                  <select
                    required
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service *</label>
                  <select
                    required
                    value={formData.service_id}
                    onChange={(e) => setFormData({ ...formData, service_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                  placeholder="Work description"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  {editingWork ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedWork && (
        <WorkDetails
          workId={selectedWork}
          onClose={() => setSelectedWork(null)}
          onUpdate={fetchData}
        />
      )}

      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Create Invoice</h2>
              <p className="text-gray-600 mt-1">Generate invoice for this completed work</p>
            </div>

            <form onSubmit={handleInvoiceSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Invoice will be created in draft status. You can edit it in the Invoices section.
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowInvoiceModal(false);
                    setInvoiceWorkId(null);
                    setInvoiceAmount('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                >
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
