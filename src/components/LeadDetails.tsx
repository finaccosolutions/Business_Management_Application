import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Mail,
  Phone,
  Building2,
  Calendar,
  Tag,
  FileText,
  Edit,
  User,
  MessageSquare,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface LeadDetailsProps {
  leadId: string;
  onClose: () => void;
  onEdit: () => void;
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
  lead_services?: { services: { name: string } }[];
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

export default function LeadDetails({ leadId, onClose, onEdit }: LeadDetailsProps) {
  const { user } = useAuth();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'communications' | 'notes'>('details');

  useEffect(() => {
    fetchLeadDetails();
  }, [leadId]);

  const fetchLeadDetails = async () => {
    try {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select(`
          *,
          lead_services (
            services (name)
          )
        `)
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;

      const { data: commsData } = await supabase
        .from('communications')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      setLead({
        ...leadData,
        communications: commsData || [],
      });
    } catch (error: any) {
      console.error('Error fetching lead details:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      {/* Position: Left edge at sidebar (left-64), Top edge below topbar (top-16) */}
      <div className="fixed top-16 left-64 right-0 bottom-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-cyan-600 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <User size={28} />
              Lead Details
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              Created on {new Date(lead.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
            >
              <Edit size={18} />
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

        {/* Status Badge */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span
              className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                statusColors[lead.status] || 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
            </span>
            {lead.converted_at && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                <CheckCircle2 size={16} />
                Converted on {new Date(lead.converted_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex-shrink-0">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'details'
                ? 'bg-white text-blue-700 shadow-sm border-t-2 border-blue-600'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <FileText size={18} className="text-blue-600" />
            Details
          </button>
          <button
            onClick={() => setActiveTab('communications')}
            className={`flex items-center gap-2 px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'communications'
                ? 'bg-white text-cyan-700 shadow-sm border-t-2 border-cyan-600'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <MessageSquare size={18} className="text-cyan-600" />
            Communications
            {lead.communications && lead.communications.length > 0 && (
              <span className="bg-cyan-100 text-cyan-700 text-xs px-2 py-0.5 rounded-full">
                {lead.communications.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'notes'
                ? 'bg-white text-orange-700 shadow-sm border-t-2 border-orange-600'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            <FileText size={18} className="text-orange-600" />
            Notes
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Basic Information */}
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

              {/* Interested Services */}
              {lead.lead_services && lead.lead_services.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Interested Services
                  </h3>
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

              {/* Notes */}
              {lead.notes && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText size={20} className="text-orange-600" />
                    Notes
                  </h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}

              {/* Timeline */}
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

          {activeTab === 'communications' && (
            <div className="space-y-4">
              {lead.communications && lead.communications.length > 0 ? (
                lead.communications.map((comm) => (
                  <div
                    key={comm.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={18} className="text-cyan-600" />
                        <span className="font-semibold text-gray-900">{comm.type}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(comm.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {comm.subject && (
                      <h4 className="font-medium text-gray-900 mb-2">{comm.subject}</h4>
                    )}
                    <p className="text-gray-700 whitespace-pre-wrap">{comm.message}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <MessageSquare size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No communications recorded yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-gray-700 whitespace-pre-wrap">
                {lead.notes || 'No notes available'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
