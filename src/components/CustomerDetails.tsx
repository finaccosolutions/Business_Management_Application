// src/components/CustomerDetails.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, User, Briefcase, FileText, DollarSign, Mail, Phone, MapPin, Building2, CreditCard, Clock, CheckCircle, AlertCircle, Plus, Edit2, TrendingUp, Calendar, MessageSquare, Download, ExternalLink, Trash2, StickyNote, Pin, History } from 'lucide-react';
import CustomerFormModal from './CustomerFormModal';
import CommunicationModal from './CommunicationModal';
import DocumentUploadModal from './DocumentUploadModal';
import NoteModal from './NoteModal';
import InvoiceFormModal from './InvoiceFormModal';
import EditInvoiceModal from './EditInvoiceModal';
import AddServiceModal from './AddServiceModal';
import AddWorkModal from './AddWorkModal';
import { useToast } from '../contexts/ToastContext';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { formatDateDisplay, formatDateDisplayLong } from '../lib/dateUtils';

interface EditInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_rate?: number;
  service_id?: string;
}

interface EditInvoiceData {
  id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes?: string;
  work_id?: string;
  income_account_id?: string;
  customer_account_id?: string;
  customers: { name: string };
}

interface CustomerDetailsProps {
  customerId: string;
  onClose: () => void;
  onUpdate: () => void;
  onNavigateToService?: (serviceId: string) => void;
  onNavigateToWork?: (workId: string) => void;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  image_url: string;
  contact_person: string;
  designation: string;
  alternate_phone: string;
  website: string;
  gstin: string;
  pan_number: string;
  entity_type: string;
  legal_form: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc_code: string;
  bank_branch: string;
  notes: string;
  created_at: string;
}

interface CustomerService {
  id: string;
  service_id: string;
  price: number;
  start_date: string;
  end_date: string | null;
  status: string;
  services: { name: string; description: string };
}

interface Work {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
  created_at: string;
  services: { name: string };
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: string;
  paid_at: string | null;
}

interface Communication {
  id: string;
  type: string;
  subject: string | null;
  message: string;
  sent_at: string;
  created_at: string;
}

interface Document {
  id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  description: string | null;
  uploaded_at: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  activity_type: string;
  activity_title: string;
  activity_description: string | null;
  metadata: any;
  created_at: string;
}

type TabType = 'overview' | 'services' | 'works' | 'invoices' | 'communications' | 'documents' | 'notes' | 'activity';

export default function CustomerDetails({
  customerId,
  onClose,
  onUpdate,
  onNavigateToService,
  onNavigateToWork,
}: CustomerDetailsProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirmation();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [services, setServices] = useState<CustomerService[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showInvoiceFormModal, setShowInvoiceFormModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [statistics, setStatistics] = useState({
    totalInvoiced: 0,
    totalPaid: 0,
    totalPending: 0,
    activeServices: 0,
    completedWorks: 0,
    pendingWorks: 0,
  });

  useEffect(() => {
    if (customerId) {
      fetchCustomerDetails();
    }
  }, [customerId]);

  const fetchCustomerDetails = async () => {
    try {
      const [
        customerRes,
        servicesRes,
        worksRes,
        invoicesRes,
        communicationsRes,
        documentsRes,
        notesRes,
        activitiesRes,
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single(),
        supabase
          .from('customer_services')
          .select('*, services(name, description)')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('works')
          .select('*, services!service_id(name)')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*')
          .eq('customer_id', customerId)
          .order('invoice_date', { ascending: false }),
        supabase
          .from('communications')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_documents')
          .select('*')
          .eq('customer_id', customerId)
          .order('uploaded_at', { ascending: false }),
        supabase
          .from('customer_notes')
          .select('*')
          .eq('customer_id', customerId)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_activities')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (customerRes.error) throw customerRes.error;
      if (servicesRes.error) throw servicesRes.error;
      if (worksRes.error) throw worksRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (communicationsRes.error) throw communicationsRes.error;
      if (documentsRes.error) throw documentsRes.error;
      if (notesRes.error) throw notesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;

      setCustomer(customerRes.data);
      setServices(servicesRes.data || []);
      setWorks(worksRes.data || []);
      setInvoices(invoicesRes.data || []);
      setCommunications(communicationsRes.data || []);
      setDocuments(documentsRes.data || []);
      setNotes(notesRes.data || []);
      setActivities(activitiesRes.data || []);

      const uniqueServiceIds = [...new Set(worksRes.data?.map((w: any) => w.service_id).filter(Boolean) || [])];
      if (uniqueServiceIds.length > 0 && (!servicesRes.data || servicesRes.data.length === 0)) {
        const { data: servicesFromWorks } = await supabase
          .from('services')
          .select('id, name, description, default_price')
          .in('id', uniqueServiceIds);

        if (servicesFromWorks) {
          const servicesList = servicesFromWorks.map(s => ({
            id: s.id,
            service_id: s.id,
            price: s.default_price || 0,
            start_date: '',
            end_date: null,
            status: 'active',
            services: { name: s.name, description: s.description || '' }
          }));
          setServices(servicesList as CustomerService[]);
        }
      }

      const totalInvoiced = invoicesRes.data?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
      const totalPaid = invoicesRes.data?.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
      const totalPending = totalInvoiced - totalPaid;
      const activeServices = uniqueServiceIds.length || servicesRes.data?.filter(s => s.status === 'active').length || 0;
      const completedWorks = worksRes.data?.filter(w => w.status === 'completed').length || 0;
      const pendingWorks = worksRes.data?.filter(w => w.status !== 'completed').length || 0;

      setStatistics({
        totalInvoiced,
        totalPaid,
        totalPending,
        activeServices,
        completedWorks,
        pendingWorks,
      });
    } catch (error: any) {
      console.error('Error fetching customer details:', error.message);
      showToast('Failed to load customer details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    fetchCustomerDetails();
    onUpdate();
  };

  const handleInvoiceEdit = (invoiceId: string) => {
    setEditingInvoiceId(invoiceId);
  };

  const tabs: Array<{ id: TabType; label: string; icon: any; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'services', label: 'Services', icon: Briefcase, count: services.length },
    { id: 'works', label: 'Works', icon: Clock, count: works.length },
    { id: 'invoices', label: 'Invoices', icon: FileText, count: invoices.length },
    { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'notes', label: 'Notes', icon: StickyNote, count: notes.length },
    { id: 'activity', label: 'Activity Timeline', icon: History, count: activities.length },
  ];

  if (loading || !customer) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-600 to-green-700">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center overflow-hidden">
              {customer.image_url ? (
                <img
                  src={customer.image_url}
                  alt={customer.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={32} className="text-green-600" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{customer.name}</h2>
              {customer.company_name && (
                <p className="text-green-100 flex items-center gap-1">
                  <Building2 size={14} />
                  {customer.company_name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
            >
              <Edit2 size={18} />
              Edit
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
            >
              <X size={24} />
            </button>
          </div>
        </div>


        <div className="flex border-b border-gray-200 bg-gray-50 px-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600 bg-white'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon size={18} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab customer={customer} statistics={statistics} />
          )}

          {activeTab === 'services' && (
            <ServicesTab
              services={services}
              customerId={customerId}
              onUpdate={fetchCustomerDetails}
              onNavigateToService={(serviceId) => {
                onNavigateToService?.(serviceId);
                onClose();
              }}
              onAdd={() => setShowServiceModal(true)}
            />
          )}

          {activeTab === 'works' && (
            <WorksTab
              works={works}
              customerId={customerId}
              onUpdate={fetchCustomerDetails}
              onNavigateToWork={(workId) => {
                onNavigateToWork?.(workId);
                onClose();
              }}
              onAdd={() => setShowWorkModal(true)}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesTab
              invoices={invoices}
              statistics={statistics}
              customerId={customerId}
              onEdit={handleInvoiceEdit}
              onAdd={() => setShowInvoiceFormModal(true)}
            />
          )}

          {activeTab === 'communications' && (
            <CommunicationsTab
              communications={communications}
              customerId={customerId}
              onAdd={() => setShowCommunicationModal(true)}
              onRefresh={fetchCustomerDetails}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab
              documents={documents}
              customerId={customerId}
              onAdd={() => setShowDocumentModal(true)}
              onRefresh={fetchCustomerDetails}
            />
          )}

          {activeTab === 'notes' && (
            <NotesTab
              notes={notes}
              customerId={customerId}
              onAdd={() => {
                setEditingNote(null);
                setShowNoteModal(true);
              }}
              onEdit={(note) => {
                setEditingNote(note);
                setShowNoteModal(true);
              }}
              onRefresh={fetchCustomerDetails}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityTab activities={activities} />
          )}
        </div>
      </div>

      {showEditModal && (
        <CustomerFormModal
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
          initialData={customer}
          mode="edit"
          customerId={customerId}
          title={`Edit Customer: ${customer.name}`}
        />
      )}

      {showCommunicationModal && (
        <CommunicationModal
          customerId={customerId}
          onClose={() => setShowCommunicationModal(false)}
          onSuccess={fetchCustomerDetails}
        />
      )}

      {showDocumentModal && (
        <DocumentUploadModal
          customerId={customerId}
          onClose={() => setShowDocumentModal(false)}
          onSuccess={fetchCustomerDetails}
        />
      )}

      {showNoteModal && (
        <NoteModal
          customerId={customerId}
          noteId={editingNote?.id}
          initialData={editingNote ? {
            title: editingNote.title,
            content: editingNote.content,
            is_pinned: editingNote.is_pinned,
          } : undefined}
          onClose={() => {
            setShowNoteModal(false);
            setEditingNote(null);
          }}
          onSuccess={fetchCustomerDetails}
        />
      )}

      {showInvoiceFormModal && (
        <InvoiceFormModal
          customerId={customerId}
          onClose={() => setShowInvoiceFormModal(false)}
          onSuccess={fetchCustomerDetails}
        />
      )}

      {showServiceModal && (
        <AddServiceModal
          customerId={customerId}
          onClose={() => setShowServiceModal(false)}
          onSuccess={fetchCustomerDetails}
        />
      )}

      {showWorkModal && (
        <AddWorkModal
          customerId={customerId}
          customerName={customer.name}
          onClose={() => setShowWorkModal(false)}
          onSuccess={fetchCustomerDetails}
        />
      )}

      {editingInvoiceId && (
        <EditInvoiceModalWrapper
          invoiceId={editingInvoiceId}
          onClose={() => setEditingInvoiceId(null)}
          onSuccess={() => {
            setEditingInvoiceId(null);
            fetchCustomerDetails();
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({ customer, statistics }: { customer: Customer; statistics: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-blue-600" />
            <p className="text-xs font-medium text-gray-600">Total Invoiced</p>
          </div>
          <p className="text-lg font-bold text-blue-600">
            ₹{statistics.totalInvoiced.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-xs font-medium text-gray-600">Total Paid</p>
          </div>
          <p className="text-lg font-bold text-green-600">
            ₹{statistics.totalPaid.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-orange-600" />
            <p className="text-xs font-medium text-gray-600">Pending</p>
          </div>
          <p className="text-lg font-bold text-orange-600">
            ₹{statistics.totalPending.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase size={16} className="text-teal-600" />
            <p className="text-xs font-medium text-gray-600">Active Services</p>
          </div>
          <p className="text-lg font-bold text-teal-600">{statistics.activeServices}</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-emerald-600" />
            <p className="text-xs font-medium text-gray-600">Completed</p>
          </div>
          <p className="text-lg font-bold text-emerald-600">{statistics.completedWorks}</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-yellow-600" />
            <p className="text-xs font-medium text-gray-600">Pending Works</p>
          </div>
          <p className="text-lg font-bold text-yellow-600">{statistics.pendingWorks}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User size={20} className="text-green-600" />
          Contact Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customer.email && (
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{customer.email}</p>
              </div>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900">{customer.phone}</p>
              </div>
            </div>
          )}
          {customer.alternate_phone && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Alternate Phone</p>
                <p className="text-sm font-medium text-gray-900">{customer.alternate_phone}</p>
              </div>
            </div>
          )}
          {customer.website && (
            <div className="flex items-center gap-3">
              <Building2 size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Website</p>
                <a
                  href={customer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {customer.website}
                </a>
              </div>
            </div>
          )}
          {customer.contact_person && (
            <div className="flex items-center gap-3">
              <User size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Contact Person</p>
                <p className="text-sm font-medium text-gray-900">{customer.contact_person}</p>
              </div>
            </div>
          )}
          {customer.designation && (
            <div className="flex items-center gap-3">
              <Briefcase size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Designation</p>
                <p className="text-sm font-medium text-gray-900">{customer.designation}</p>
              </div>
            </div>
          )}
          {(customer.entity_type || customer.legal_form) && (
            <div className="flex items-center gap-3">
              <Building2 size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Entity Type / Legal Form</p>
                <p className="text-sm font-medium text-gray-900">{customer.entity_type || customer.legal_form}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {customer.address && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-green-600" />
            Address
          </h3>
          <p className="text-gray-700 mb-2">{customer.address}</p>
          <p className="text-gray-700">
            {[customer.city, customer.state, customer.pincode, customer.country]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      )}

      {(customer.gstin || customer.pan_number) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-green-600" />
            Tax & Statutory Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customer.gstin && (
              <div>
                <p className="text-xs text-gray-500">GSTIN</p>
                <p className="text-sm font-medium text-gray-900">{customer.gstin}</p>
              </div>
            )}
            {customer.pan_number && (
              <div>
                <p className="text-xs text-gray-500">PAN Number</p>
                <p className="text-sm font-medium text-gray-900">{customer.pan_number}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {customer.bank_name && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard size={20} className="text-green-600" />
            Bank Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customer.bank_name && (
              <div>
                <p className="text-xs text-gray-500">Bank Name</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_name}</p>
              </div>
            )}
            {customer.bank_branch && (
              <div>
                <p className="text-xs text-gray-500">Branch</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_branch}</p>
              </div>
            )}
            {customer.bank_account_number && (
              <div>
                <p className="text-xs text-gray-500">Account Number</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_account_number}</p>
              </div>
            )}
            {customer.bank_ifsc_code && (
              <div>
                <p className="text-xs text-gray-500">IFSC Code</p>
                <p className="text-sm font-medium text-gray-900">{customer.bank_ifsc_code}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {customer.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-green-600" />
            Notes
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
        </div>
      )}

      <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200 p-6">
        <p className="text-sm text-green-700">
          Customer since {formatDateDisplayLong(customer.created_at)}
        </p>
      </div>
    </div>
  );
}

function ServicesTab({
  services,
  customerId,
  onUpdate,
  onNavigateToService,
  onAdd,
}: {
  services: CustomerService[];
  customerId: string;
  onUpdate: () => void;
  onNavigateToService?: (serviceId: string) => void;
  onAdd?: () => void;
}) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-700',
    expired: 'bg-red-100 text-red-700',
  };

  const handleAddService = () => {
    onAdd?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          Services ({services.length})
        </h3>
        <button
          onClick={handleAddService}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus size={18} />
          Add Service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Briefcase size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No services assigned</h4>
          <p className="text-gray-600 mb-4">Assign services to this customer to get started.</p>
          <button
            onClick={handleAddService}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={20} />
            Add Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => {
                if (onNavigateToService) {
                  onNavigateToService(service.service_id);
                }
              }}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow text-left cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1 hover:text-green-600 transition-colors">{service.services.name}</h4>
                  {service.services.description && (
                    <p className="text-sm text-gray-600">{service.services.description}</p>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    statusColors[service.status] || statusColors.inactive
                  }`}
                >
                  {service.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price:</span>
                  <span className="font-semibold text-gray-900">
                    ₹{service.price.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Start Date:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(service.start_date).toLocaleDateString()}
                  </span>
                </div>
                {service.end_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">End Date:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(service.end_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorksTab({
  works,
  customerId,
  onUpdate,
  onNavigateToWork,
  onAdd,
}: {
  works: Work[];
  customerId: string;
  onUpdate: () => void;
  onNavigateToWork?: (workId: string) => void;
  onAdd?: () => void;
}) {
  const [filterStatus, setFilterStatus] = useState('all');

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  };

  const filteredWorks =
    filterStatus === 'all'
      ? works
      : works.filter((work) => work.status === filterStatus);

  const handleAddWork = () => {
    onAdd?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Works ({works.length})</h3>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <button
            onClick={handleAddWork}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Add Work
          </button>
        </div>
      </div>

      {filteredWorks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Clock size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            {filterStatus === 'all' ? 'No works yet' : 'No works match the filter'}
          </h4>
          <p className="text-gray-600 mb-4">
            {filterStatus === 'all'
              ? 'Create a work assignment for this customer to get started.'
              : 'Try adjusting your filter criteria.'}
          </p>
          <button
            onClick={handleAddWork}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={20} />
            Add Work
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWorks.map((work) => (
            <button
              key={work.id}
              onClick={() => {
                if (onNavigateToWork) {
                  onNavigateToWork(work.id);
                }
              }}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow text-left cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1 hover:text-green-600 transition-colors">{work.title}</h4>
                  <p className="text-sm text-gray-600">{work.services.name}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${
                    statusColors[work.status] || statusColors.pending
                  }`}
                >
                  {work.status.replace('_', ' ')}
                </span>
              </div>

              {work.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{work.description}</p>
              )}

              <div className="flex items-center justify-between text-sm">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    priorityColors[work.priority] || priorityColors.medium
                  }`}
                >
                  {work.priority}
                </span>
                {work.due_date && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar size={14} />
                    <span>{new Date(work.due_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InvoicesTab({
  invoices,
  statistics,
  customerId,
  onEdit,
  onAdd,
}: {
  invoices: Invoice[];
  statistics: any;
  customerId: string;
  onEdit?: (invoiceId: string) => void;
  onAdd?: () => void;
}) {
  const [filterStatus, setFilterStatus] = useState('all');

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const filteredInvoices =
    filterStatus === 'all'
      ? invoices
      : invoices.filter((invoice) => invoice.status === filterStatus);

  const handleCreateInvoice = () => {
    onAdd?.();
  };

  const handleInvoiceClick = (invoiceId: string) => {
    onEdit?.(invoiceId);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl border border-green-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-green-600" />
          Financial Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Invoiced</p>
            <p className="text-2xl font-bold text-blue-600">
              ₹{statistics.totalInvoiced.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-green-600">
              ₹{statistics.totalPaid.toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Outstanding Balance</p>
            <p className="text-2xl font-bold text-orange-600">
              ₹{statistics.totalPending.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Invoices ({invoices.length})
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <button
            onClick={handleCreateInvoice}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Create Invoice
          </button>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            {filterStatus === 'all' ? 'No invoices yet' : 'No invoices match the filter'}
          </h4>
          <p className="text-gray-600 mb-4">
            {filterStatus === 'all'
              ? 'Create an invoice for this customer to get started.'
              : 'Try adjusting your filter criteria.'}
          </p>
          <button
            onClick={handleCreateInvoice}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={20} />
            Create Invoice
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInvoices.map((invoice) => (
            <button
              key={invoice.id}
              onClick={() => handleInvoiceClick(invoice.id)}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-green-300 transition-all text-left cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {invoice.invoice_number}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    statusColors[invoice.status] || statusColors.draft
                  }`}
                >
                  {invoice.status}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="text-lg font-bold text-green-600">
                    ₹{invoice.total_amount.toLocaleString('en-IN')}
                  </span>
                </div>
                {invoice.paid_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Paid On:</span>
                    <span className="font-medium text-green-700">
                      {new Date(invoice.paid_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CommunicationsTab({
  communications,
  customerId,
  onAdd,
  onRefresh,
}: {
  communications: Communication[];
  customerId: string;
  onAdd: () => void;
  onRefresh: () => void;
}) {
  const { confirm } = useConfirmation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [filterType, setFilterType] = useState('all');

  const handleDelete = async (id: string) => {
    const confirmed = await confirm(
      'Delete Communication',
      'Are you sure you want to delete this communication? This action cannot be undone.'
    );

    if (confirmed) {
      try {
        const { error } = await supabase
          .from('communications')
          .delete()
          .eq('id', id)
          .eq('user_id', user?.id);
        if (error) throw error;
        showToast('Communication deleted successfully', 'success');
        onRefresh();
      } catch (error: any) {
        console.error('Delete error:', error);
        showToast('Error: ' + error.message, 'error');
      }
    }
  };

  const typeColors: Record<string, string> = {
    email: 'bg-blue-100 text-blue-700',
    phone: 'bg-green-100 text-green-700',
    meeting: 'bg-purple-100 text-purple-700',
    note: 'bg-yellow-100 text-yellow-700',
  };

  const typeIcons: Record<string, any> = {
    email: Mail,
    phone: Phone,
    meeting: MessageSquare,
    note: FileText,
  };

  const filteredCommunications =
    filterType === 'all'
      ? communications
      : communications.filter((comm) => comm.type === filterType);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Communications ({communications.length})
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Types</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="meeting">Meeting</option>
            <option value="note">Note</option>
          </select>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Log Communication
          </button>
        </div>
      </div>

      {filteredCommunications.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            {filterType === 'all' ? 'No communications yet' : 'No communications match the filter'}
          </h4>
          <p className="text-gray-600 mb-4">
            {filterType === 'all'
              ? 'Start logging communications with this customer.'
              : 'Try adjusting your filter criteria.'}
          </p>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Log Communication
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCommunications.map((comm) => {
            const Icon = typeIcons[comm.type] || MessageSquare;
            return (
              <div
                key={comm.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${typeColors[comm.type] || typeColors.note}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      {comm.subject && (
                        <h4 className="font-semibold text-gray-900">{comm.subject}</h4>
                      )}
                      <p className="text-sm text-gray-600">
                        {new Date(comm.sent_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        typeColors[comm.type] || typeColors.note
                      }`}
                    >
                      {comm.type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(comm.id);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete communication"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{comm.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  documents,
  customerId,
  onAdd,
  onRefresh,
}: {
  documents: Document[];
  customerId: string;
  onAdd: () => void;
  onRefresh: () => void;
}) {
  const { confirm } = useConfirmation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [filterCategory, setFilterCategory] = useState('all');

  const handleDelete = async (id: string) => {
    const confirmed = await confirm(
      'Delete Document',
      'Are you sure you want to delete this document? This action cannot be undone.'
    );

    if (confirmed) {
      try {
        const { error } = await supabase.from('customer_documents').delete().eq('id', id);
        if (error) throw error;
        showToast('Document deleted successfully', 'success');
        onRefresh();
      } catch (error: any) {
        showToast('Error: ' + error.message, 'error');
      }
    }
  };

  const categoryColors: Record<string, string> = {
    general: 'bg-gray-100 text-gray-700',
    contract: 'bg-blue-100 text-blue-700',
    invoice: 'bg-green-100 text-green-700',
    report: 'bg-purple-100 text-purple-700',
    proposal: 'bg-yellow-100 text-yellow-700',
    agreement: 'bg-red-100 text-red-700',
    other: 'bg-gray-100 text-gray-700',
  };

  const filteredDocuments =
    filterCategory === 'all'
      ? documents
      : documents.filter((doc) => doc.category === filterCategory);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Documents ({documents.length})</h3>
        <div className="flex items-center gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="contract">Contract</option>
            <option value="invoice">Invoice</option>
            <option value="report">Report</option>
            <option value="proposal">Proposal</option>
            <option value="agreement">Agreement</option>
            <option value="other">Other</option>
          </select>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Upload Document
          </button>
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            {filterCategory === 'all' ? 'No documents yet' : 'No documents match the filter'}
          </h4>
          <p className="text-gray-600 mb-4">
            {filterCategory === 'all'
              ? 'Upload documents related to this customer.'
              : 'Try adjusting your filter criteria.'}
          </p>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Upload Document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <FileText size={24} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">{doc.name}</h4>
                    <p className="text-xs text-gray-500">
                      {formatDateDisplay(doc.uploaded_at)}
                    </p>
                  </div>
                </div>
              </div>

              {doc.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{doc.description}</p>
              )}

              <div className="flex items-center justify-between mb-4">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    categoryColors[doc.category] || categoryColors.general
                  }`}
                >
                  {doc.category}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <ExternalLink size={16} />
                  View
                </a>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesTab({
  notes,
  customerId,
  onAdd,
  onEdit,
  onRefresh,
}: {
  notes: Note[];
  customerId: string;
  onAdd: () => void;
  onEdit: (note: Note) => void;
  onRefresh: () => void;
}) {
  const { confirm } = useConfirmation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const handleDelete = async (id: string) => {
    const confirmed = await confirm(
      'Delete Note',
      'Are you sure you want to delete this note? This action cannot be undone.'
    );

    if (confirmed) {
      try {
        const { error } = await supabase
          .from('customer_notes')
          .delete()
          .eq('id', id)
          .eq('user_id', user?.id);
        if (error) throw error;
        showToast('Note deleted successfully', 'success');
        onRefresh();
      } catch (error: any) {
        console.error('Delete error:', error);
        showToast('Error: ' + error.message, 'error');
      }
    }
  };

  const handleTogglePin = async (note: Note) => {
    try {
      const { error } = await supabase
        .from('customer_notes')
        .update({ is_pinned: !note.is_pinned })
        .eq('id', note.id);

      if (error) throw error;
      showToast(
        note.is_pinned ? 'Note unpinned' : 'Note pinned',
        'success'
      );
      onRefresh();
    } catch (error: any) {
      showToast('Error: ' + error.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Notes ({notes.length})</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
        >
          <Plus size={18} />
          Add Note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <StickyNote size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No notes yet</h4>
          <p className="text-gray-600 mb-4">
            Add notes to keep important information about this customer.
          </p>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <Plus size={18} />
            Add Note
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-shadow ${
                note.is_pinned
                  ? 'border-yellow-300 bg-yellow-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {note.is_pinned && <Pin size={16} className="text-yellow-600" />}
                  <h4 className="font-semibold text-gray-900">{note.title}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTogglePin(note)}
                    className={`p-2 rounded-lg transition-colors ${
                      note.is_pinned
                        ? 'text-yellow-600 hover:bg-yellow-100'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={note.is_pinned ? 'Unpin note' : 'Pin note'}
                  >
                    <Pin size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(note);
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit note"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(note.id);
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete note"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap mb-3">{note.content}</p>
              <div className="text-xs text-gray-500">
                {note.created_at !== note.updated_at ? (
                  <span>Updated {new Date(note.updated_at).toLocaleString('en-IN')}</span>
                ) : (
                  <span>Created {new Date(note.created_at).toLocaleString('en-IN')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditInvoiceModalWrapper({
  invoiceId,
  onClose,
  onSuccess
}: {
  invoiceId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<EditInvoiceData | null>(null);
  const [items, setItems] = useState<EditInvoiceItem[]>([]);

  useEffect(() => {
    fetchInvoiceData();
  }, [invoiceId]);

  const fetchInvoiceData = async () => {
    try {
      setLoading(true);
      const [invoiceRes, itemsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('*, customers(name)')
          .eq('id', invoiceId)
          .single(),
        supabase
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: true }),
      ]);

      if (invoiceRes.error) throw invoiceRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setInvoice(invoiceRes.data);
      setItems(itemsRes.data || []);
    } catch (error: any) {
      console.error('Error fetching invoice:', error);
      showToast('Failed to load invoice', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  return (
    <EditInvoiceModal
      invoice={invoice}
      items={items}
      onClose={onClose}
      onSave={onSuccess}
    />
  );
}

function ActivityTab({ activities }: { activities: Activity[] }) {
  const activityTypeColors: Record<string, string> = {
    communication: 'bg-blue-100 text-blue-700',
    document: 'bg-green-100 text-green-700',
    note: 'bg-yellow-100 text-yellow-700',
    service: 'bg-purple-100 text-purple-700',
    work: 'bg-orange-100 text-orange-700',
    invoice: 'bg-red-100 text-red-700',
    customer: 'bg-teal-100 text-teal-700',
    created: 'bg-teal-100 text-teal-700',
    updated: 'bg-blue-100 text-blue-700',
    status_change: 'bg-indigo-100 text-indigo-700',
    payment: 'bg-green-100 text-green-700',
  };

  const activityTypeIcons: Record<string, any> = {
    communication: MessageSquare,
    document: FileText,
    note: StickyNote,
    service: Briefcase,
    work: Clock,
    invoice: DollarSign,
    customer: User,
    created: Plus,
    updated: Edit2,
    status_change: AlertCircle,
    payment: CheckCircle,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
        <p className="text-sm text-gray-600">Complete history of customer interactions</p>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <History size={48} className="mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No activity yet</h4>
          <p className="text-gray-600">
            Customer activities will appear here including:
          </p>
          <ul className="text-gray-600 mt-2 space-y-1">
            <li>Customer creation and updates</li>
            <li>Work assignments and status changes</li>
            <li>Service additions and modifications</li>
            <li>Invoices created and payments received</li>
            <li>Communications logged</li>
            <li>Documents uploaded</li>
            <li>Notes added</li>
          </ul>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
          <div className="space-y-6">
            {activities.map((activity, index) => {
              const Icon = activityTypeIcons[activity.activity_type] || History;
              return (
                <div key={activity.id} className="relative flex gap-4">
                  <div
                    className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center z-10 ${
                      activityTypeColors[activity.activity_type] ||
                      activityTypeColors.customer
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">
                          {activity.activity_title}
                        </h4>
                        {activity.activity_description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {activity.activity_description}
                          </p>
                        )}
                        {activity.metadata && (
                          <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2">
                            {typeof activity.metadata === 'object' && (
                              <div className="space-y-1">
                                {Object.entries(activity.metadata).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium">{key}:</span>{' '}
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${
                          activityTypeColors[activity.activity_type] ||
                          activityTypeColors.customer
                        }`}
                      >
                        {activity.activity_type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(activity.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
