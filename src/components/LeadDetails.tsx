import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Mail,
  Phone,
  Building2,
  Calendar,
  Tag,
  FileText,
  CreditCard as Edit,
  User,
  MessageSquare,
  Clock,
  CheckCircle2,
  Plus,
  Phone as PhoneCall,
  MessageCircle,
  Users,
  Activity,
  Trash2,
  ArrowLeft,
  Edit2
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useConfirmation } from '../contexts/ConfirmationContext';
import CommunicationModal from './CommunicationModal';
import NoteModal from './NoteModal';
import AddFollowUpModal from './AddFollowUpModal';

interface LeadDetailsProps {
  leadId: string;
  onBack: () => void;
  onNavigate?: (page: string, params?: any) => void;
}

interface LeadDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  status: string;
  source: string;
  referred_by: string;
  notes: string;
  created_at: string;
  updated_at: string;
  converted_at: string;
  converted_to_customer_id: string;
  lead_services?: { service_id: string; services: { name: string } }[];
  communications?: Communication[];
}

interface Communication {
  id: string;
  type: string;
  subject: string;
  message: string;
  sent_at: string;
  created_at: string;
}

interface FollowUp {
  id: string;
  followup_date: string;
  followup_time: string;
  followup_type: string;
  remarks: string;
  status: string;
  completed_at: string;
  created_at: string;
  reminder_date?: string;
}

interface Note {
  id: string;
  title?: string;
  content: string;
  note?: string; // fallback
  created_at: string;
}

interface ActivityItem {
  id: string;
  type: 'followup' | 'communication' | 'note' | 'status_change' | 'created' | 'converted';
  title: string;
  description: string;
  timestamp: string;
  icon: any;
  color: string;
}

export default function LeadDetails({ leadId, onBack, onNavigate }: LeadDetailsProps) {
  const { user } = useAuth();
  const toast = useToast();
  const { showConfirmation } = useConfirmation();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'communications' | 'notes' | 'followups' | 'activity'>(
    'details'
  );
  const [showAddFollowUpModal, setShowAddFollowUpModal] = useState(false);
  const [showAddCommunicationModal, setShowAddCommunicationModal] = useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);

  useEffect(() => {
    fetchLeadDetails();
  }, [leadId]);

  const fetchLeadDetails = async () => {
    try {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select(
          `
          *,
          lead_services (
            service_id,
            services (name)
          )
        `
        )
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;

      const { data: commsData } = await supabase
        .from('communications')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      const { data: followUpsData } = await supabase
        .from('lead_followups')
        .select('*')
        .eq('lead_id', leadId)
        .order('followup_date', { ascending: false });

      const { data: notesData } = await supabase
        .from('customer_notes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      setLead({
        ...leadData,
        communications: commsData || [],
      });
      setFollowUps(followUpsData || []);
      setNotes(notesData || []);
    } catch (error: any) {
      console.error('Error fetching lead details:', error.message);
      toast.showToast('Failed to load lead details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const markFollowUpCompleted = async (followUpId: string) => {
    try {
      const { error } = await supabase
        .from('lead_followups')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', followUpId);

      if (error) throw error;
      toast.showToast('Follow-up marked as completed!', 'success');
      fetchLeadDetails();
    } catch (error: any) {
      console.error('Error updating follow-up:', error.message);
      toast.showToast('Failed to update follow-up', 'error');
    }
  };

  const deleteNote = async (noteId: string) => {
    showConfirmation({
      title: 'Delete Note',
      message: 'Are you sure you want to delete this note?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('customer_notes').delete().eq('id', noteId);
          if (!error) {
            toast.showToast('Note deleted successfully', 'success');
            fetchLeadDetails();
          } else {
            throw error;
          }
        } catch (error) {
          toast.showToast('Failed to delete note', 'error');
        }
      }
    });
  };

  const deleteCommunication = async (commId: string) => {
    showConfirmation({
      title: 'Delete Communication',
      message: 'Are you sure you want to delete this communication record?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('communications').delete().eq('id', commId);
          if (!error) {
            toast.showToast('Communication deleted successfully', 'success');
            fetchLeadDetails();
          } else {
            throw error;
          }
        } catch (error) {
          toast.showToast('Failed to delete communication', 'error');
        }
      }
    });
  };

  const generateActivityTimeline = (): ActivityItem[] => {
    if (!lead) return [];

    const activities: ActivityItem[] = [];

    activities.push({
      id: 'created',
      type: 'created',
      title: 'Lead Created',
      description: `Lead was added to the system`,
      timestamp: lead.created_at,
      icon: User,
      color: 'text-blue-600 bg-blue-100',
    });

    followUps.forEach((fu) => {
      activities.push({
        id: fu.id,
        type: 'followup',
        title: `${fu.status === 'completed' ? 'Completed' : 'Scheduled'} ${fu.followup_type} follow-up`,
        description: fu.remarks || 'No remarks provided',
        timestamp: fu.status === 'completed' && fu.completed_at ? fu.completed_at : fu.followup_date,
        icon: Calendar,
        color: fu.status === 'completed' ? 'text-green-600 bg-green-100' : 'text-orange-600 bg-orange-100',
      });
    });

    lead.communications?.forEach((comm) => {
      activities.push({
        id: comm.id,
        type: 'communication',
        title: `${comm.type} communication`,
        description: comm.subject || comm.message.substring(0, 100),
        timestamp: comm.created_at,
        icon: MessageSquare,
        color: 'text-cyan-600 bg-cyan-100',
      });
    });

    notes.forEach((note) => {
      const content = note.content || note.note || '';
      activities.push({
        id: note.id,
        type: 'note',
        title: note.title || 'Note Added',
        description: content.substring(0, 100),
        timestamp: note.created_at,
        icon: FileText,
        color: 'text-gray-600 bg-gray-100',
      });
    });

    if (lead.converted_at) {
      activities.push({
        id: 'converted',
        type: 'converted',
        title: 'Converted to Customer',
        description: 'Lead was successfully converted',
        timestamp: lead.converted_at,
        icon: CheckCircle2,
        color: 'text-emerald-600 bg-emerald-100',
      });
    }

    return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!lead) return null;

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 border-blue-200',
    contacted: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    qualified: 'bg-green-100 text-green-700 border-green-200',
    proposal: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    negotiation: 'bg-orange-100 text-orange-700 border-orange-200',
    lost: 'bg-red-100 text-red-700 border-red-200',
    converted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const followUpTypeIcons: Record<string, any> = {
    call: PhoneCall,
    email: Mail,
    whatsapp: MessageCircle,
    meeting: Users,
  };

  const activityTimeline = generateActivityTimeline();

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Back to Leads"
          >
            <ArrowLeft size={24} className="text-gray-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              {lead.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-sm">
                Created on {new Date(lead.created_at).toLocaleDateString()}
              </span>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColors[lead.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}
              >
                {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
              </span>
              {lead.converted_at && (
                <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={12} />
                  Converted on {new Date(lead.converted_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate?.('create-lead', { id: lead.id })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Edit2 size={18} />
            Edit Lead
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'details'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        >
          <FileText size={18} />
          Details
        </button>
        <button
          onClick={() => setActiveTab('followups')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'followups'
            ? 'border-green-600 text-green-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        >
          <Calendar size={18} />
          Follow-Ups
          {followUps && followUps.filter((f) => f.status === 'pending').length > 0 && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {followUps.filter((f) => f.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('communications')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'communications'
            ? 'border-cyan-600 text-cyan-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        >
          <MessageSquare size={18} />
          Communications
          {lead.communications && lead.communications.length > 0 && (
            <span className="bg-cyan-100 text-cyan-700 text-xs px-2 py-0.5 rounded-full">
              {lead.communications.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'notes'
            ? 'border-orange-600 text-orange-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        >
          <FileText size={18} />
          Notes
          {notes.length > 0 && (
            <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
              {notes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'activity'
            ? 'border-purple-600 text-purple-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
        >
          <Activity size={18} />
          Activity Timeline
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-2">
        {activeTab === 'details' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User size={20} className="text-blue-600" />
                Basic Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-gray-500">Name</label>
                  <p className="text-gray-900 font-medium mt-1">{lead.name}</p>
                </div>
                {lead.company_name && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      <Building2 size={14} />
                      Company
                    </label>
                    <p className="text-gray-900 font-medium mt-1">{lead.company_name}</p>
                  </div>
                )}
                {lead.email && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      <Mail size={14} />
                      Email
                    </label>
                    <p className="text-gray-900 mt-1">
                      <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                        {lead.email}
                      </a>
                    </p>
                  </div>
                )}
                {lead.phone && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      <Phone size={14} />
                      Phone
                    </label>
                    <p className="text-gray-900 mt-1">
                      <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">
                        {lead.phone}
                      </a>
                    </p>
                  </div>
                )}
                {lead.source && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      <Tag size={14} />
                      Source
                    </label>
                    <p className="text-gray-900 mt-1">{lead.source}</p>
                  </div>
                )}
                {lead.referred_by && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-1">
                      <User size={14} />
                      Referred By
                    </label>
                    <p className="text-gray-900 mt-1 font-medium">{lead.referred_by}</p>
                  </div>
                )}
              </div>
            </div>

            {lead.lead_services && lead.lead_services.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Interested Services</h3>
                <div className="flex flex-wrap gap-2">
                  {lead.lead_services.map((ls: any, idx: number) => (
                    <span
                      key={idx}
                      className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-medium"
                    >
                      {ls.services?.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lead.notes && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-orange-600" />
                  Initial Notes
                </h3>
                <p className="text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock size={20} className="text-gray-600" />
                Timeline
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Lead Created</p>
                    <p className="text-xs text-gray-500">
                      {new Date(lead.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {lead.updated_at !== lead.created_at && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Last Updated</p>
                      <p className="text-xs text-gray-500">
                        {new Date(lead.updated_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
                {lead.converted_at && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Converted to Customer</p>
                      <p className="text-xs text-gray-500">
                        {new Date(lead.converted_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'followups' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Follow-Up History</h3>
              <button
                onClick={() => setShowAddFollowUpModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus size={18} />
                Add Follow-Up
              </button>
            </div>

            {followUps && followUps.length > 0 ? (
              followUps.map((followUp) => {
                const Icon = followUpTypeIcons[followUp.followup_type] || Calendar;
                const isPending = followUp.status === 'pending';
                const isCompleted = followUp.status === 'completed';

                return (
                  <div
                    key={followUp.id}
                    className={`bg-white rounded-xl shadow-sm border-2 p-6 ${isPending
                      ? 'border-blue-200 bg-blue-50/30'
                      : isCompleted
                        ? 'border-green-200 bg-green-50/30'
                        : 'border-gray-200'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${isPending
                            ? 'bg-blue-100'
                            : isCompleted
                              ? 'bg-green-100'
                              : 'bg-gray-100'
                            }`}
                        >
                          <Icon
                            size={20}
                            className={
                              isPending
                                ? 'text-blue-600'
                                : isCompleted
                                  ? 'text-green-600'
                                  : 'text-gray-600'
                            }
                          />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 capitalize">
                            {followUp.followup_type}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {new Date(followUp.followup_date).toLocaleDateString()}
                            {followUp.followup_time && ` at ${followUp.followup_time}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <button
                            onClick={() => markFollowUpCompleted(followUp.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <CheckCircle2 size={16} />
                            Complete
                          </button>
                        )}
                        {isCompleted && (
                          <span className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 text-sm rounded-lg font-medium">
                            <CheckCircle2 size={16} />
                            Completed
                          </span>
                        )}
                      </div>
                    </div>

                    {followUp.remarks && (
                      <p className="text-gray-700 whitespace-pre-wrap mt-3 pl-11">
                        {followUp.remarks}
                      </p>
                    )}

                    {isCompleted && followUp.completed_at && (
                      <p className="text-xs text-gray-500 mt-3 pl-11">
                        Completed on {new Date(followUp.completed_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-4">No follow-ups scheduled yet</p>
                <button
                  onClick={() => setShowAddFollowUpModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={18} />
                  Schedule First Follow-Up
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'communications' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Communication History</h3>
              <button
                onClick={() => setShowAddCommunicationModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-all shadow-md"
              >
                <Plus size={18} />
                Log Communication
              </button>
            </div>

            {lead.communications && lead.communications.length > 0 ? (
              lead.communications.map((comm) => (
                <div
                  key={comm.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={18} className="text-cyan-600" />
                      <span className="font-semibold text-gray-900 capitalize">{comm.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {new Date(comm.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => deleteCommunication(comm.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {comm.subject && (
                    <h4 className="font-medium text-gray-900 mb-2">{comm.subject}</h4>
                  )}
                  <p className="text-gray-700 whitespace-pre-wrap">{comm.message}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-4">No communications recorded yet</p>
                <button
                  onClick={() => setShowAddCommunicationModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                >
                  <Plus size={18} />
                  Log First Communication
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
              <button
                onClick={() => setShowAddNoteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all shadow-md"
              >
                <Plus size={18} />
                Add Note
              </button>
            </div>

            {notes.length > 0 ? (
              notes.map((note) => (
                <div key={note.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-orange-600" />
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{note.title || 'Note'}</span>
                        <span className="text-sm text-gray-500">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{note.content || note.note}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-4">No notes yet</p>
                <button
                  onClick={() => setShowAddNoteModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Plus size={18} />
                  Add First Note
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>
            {activityTimeline.length > 0 ? (
              <div className="space-y-4">
                {activityTimeline.map((activity) => {
                  const Icon = activity.icon;
                  return (
                    <div key={activity.id} className="flex gap-4">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className={`p-2 rounded-full ${activity.color} z-10`}>
                          <Icon size={16} />
                        </div>
                        <div className="h-full w-px bg-gray-200 my-1"></div>
                      </div>
                      <div className="pb-8">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{activity.title}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(activity.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{activity.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">No activity yet</div>
            )}
          </div>
        )}
      </div>

      {showAddFollowUpModal && (
        <AddFollowUpModal
          leadId={lead.id}
          onClose={() => setShowAddFollowUpModal(false)}
          onSuccess={() => {
            setShowAddFollowUpModal(false);
            fetchLeadDetails();
          }}
        />
      )}

      {showAddCommunicationModal && (
        <CommunicationModal
          leadId={lead.id}
          onClose={() => setShowAddCommunicationModal(false)}
          onSuccess={() => {
            setShowAddCommunicationModal(false);
            fetchLeadDetails();
          }}
        />
      )}

      {showAddNoteModal && (
        <NoteModal
          leadId={lead.id}
          onClose={() => setShowAddNoteModal(false)}
          onSuccess={() => {
            setShowAddNoteModal(false);
            fetchLeadDetails();
          }}
        />
      )}
    </div>
  );
}
