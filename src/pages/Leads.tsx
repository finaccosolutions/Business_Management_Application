import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Building2,
  Calendar,
  Tag,
  Trash2,
  UserPlus,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  PhoneCall,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Briefcase,
  TrendingUp,
  UserX,
} from 'lucide-react';
import AddLeadModal from '../components/AddLeadModal';
import ConvertLeadModal from '../components/ConvertLeadModal';
import LeadDetails from '../components/LeadDetails';

interface Lead {
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
  converted_to_customer_id: string | null;
  converted_at: string | null;
  lead_services?: { service_id: string; services: { name: string } }[];
}

type LeadStatus =
  | 'all'
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'converted'
  | 'lost';

const statusConfig = {
  all: { 
    label: 'All Leads', 
    icon: Users, 
    color: 'from-gray-500 to-gray-600',
    hoverColor: 'hover:from-gray-600 hover:to-gray-700',
    textColor: 'text-gray-700'
  },
  new: { 
    label: 'New', 
    icon: Tag, 
    color: 'from-blue-500 to-blue-600',
    hoverColor: 'hover:from-blue-600 hover:to-blue-700',
    textColor: 'text-blue-700'
  },
  contacted: {
    label: 'Contacted',
    icon: PhoneCall,
    color: 'from-cyan-500 to-cyan-600',
    hoverColor: 'hover:from-cyan-600 hover:to-cyan-700',
    textColor: 'text-cyan-700'
  },
  qualified: {
    label: 'Qualified',
    icon: CheckCircle,
    color: 'from-green-500 to-green-600',
    hoverColor: 'hover:from-green-600 hover:to-green-700',
    textColor: 'text-green-700'
  },
  proposal: {
    label: 'Proposal',
    icon: Briefcase,
    color: 'from-yellow-500 to-orange-500',
    hoverColor: 'hover:from-yellow-600 hover:to-orange-600',
    textColor: 'text-yellow-700'
  },
  negotiation: {
    label: 'Negotiation',
    icon: TrendingUp,
    color: 'from-orange-500 to-orange-600',
    hoverColor: 'hover:from-orange-600 hover:to-orange-700',
    textColor: 'text-orange-700'
  },
  converted: {
    label: 'Converted',
    icon: UserCheck,
    color: 'from-emerald-500 to-emerald-600',
    hoverColor: 'hover:from-emerald-600 hover:to-emerald-700',
    textColor: 'text-emerald-700'
  },
  lost: { 
    label: 'Lost', 
    icon: UserX, 
    color: 'from-red-500 to-red-600',
    hoverColor: 'hover:from-red-600 hover:to-red-700',
    textColor: 'text-red-700'
  },
};

const statusOptions = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'qualified', label: 'Qualified', color: 'bg-green-100 text-green-700' },
  { value: 'proposal', label: 'Proposal', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-orange-100 text-orange-700' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700' },
];

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<LeadStatus>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false); // ADD THIS LINE
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const tabsRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);


  useEffect(() => {
    if (user) {
      fetchLeads();
    }
  }, [user]);

  useEffect(() => {
    filterLeads();
  }, [leads, searchTerm, activeTab]);

  useEffect(() => {
    checkScrollButtons();
    const timer = setTimeout(checkScrollButtons, 100);
    window.addEventListener('resize', checkScrollButtons);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScrollButtons);
    };
  }, [activeTab, leads]);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          lead_services (
            service_id,
            services (
              name
            )
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      console.error('Error fetching leads:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const filterLeads = () => {
    let filtered = leads;

    if (activeTab !== 'all') {
      if (activeTab === 'converted') {
        filtered = filtered.filter((lead) => lead.converted_to_customer_id !== null);
      } else {
        filtered = filtered.filter(
          (lead) => lead.status === activeTab && !lead.converted_to_customer_id
        );
      }
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (lead) =>
          lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.phone?.includes(searchTerm) ||
          lead.referred_by?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLeads(filtered);
  };

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId);

      if (error) throw error;

      setLeads(
        leads.map((lead) => (lead.id === leadId ? { ...lead, status: newStatus } : lead))
      );
    } catch (error: any) {
      console.error('Error updating lead status:', error.message);
      alert('Failed to update lead status');
    }
  };

  const deleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;

    try {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);

      if (error) throw error;

      setLeads(leads.filter((lead) => lead.id !== leadId));
    } catch (error: any) {
      console.error('Error deleting lead:', error.message);
      alert('Failed to delete lead');
    }
  };

  const getStatusBadgeColor = (status: string, isConverted: boolean) => {
    if (isConverted) {
      return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    }
    const option = statusOptions.find((opt) => opt.value === status);
    return option?.color || 'bg-gray-100 text-gray-700';
  };

  const getStatusCount = (status: LeadStatus) => {
    if (status === 'all') return leads.length;
    if (status === 'converted') return leads.filter((l) => l.converted_to_customer_id).length;
    return leads.filter((lead) => lead.status === status && !lead.converted_to_customer_id).length;
  };

  const checkScrollButtons = () => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setShowLeftArrow(scrollLeft > 5);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const scrollAmount = 200;
      tabsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScrollButtons, 300);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600 mt-1">Manage your potential customers</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          <Plus size={20} />
          Add New Lead
        </button>
      </div>

      {/* Colorful Tabs with Icons */}
      <div className="bg-gradient-to-r from-slate-100 via-gray-50 to-slate-100 rounded-2xl shadow-md border-2 border-gray-200 overflow-hidden">
        <div className="relative">
          {showLeftArrow && (
            <button
              onClick={() => scrollTabs('left')}
              className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-white via-white to-transparent px-3 flex items-center"
            >
              <div className="bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-shadow">
                <ChevronLeft size={20} className="text-gray-700" />
              </div>
            </button>
          )}

          <div
            ref={tabsRef}
            onScroll={checkScrollButtons}
            className="flex overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {(Object.keys(statusConfig) as LeadStatus[]).map((status) => {
              const config = statusConfig[status];
              const Icon = config.icon;
              const count = getStatusCount(status);
              const isActive = activeTab === status;

              return (
                <button
                  key={status}
                  onClick={() => setActiveTab(status)}
                  className={`flex items-center gap-3 px-6 py-4 transition-all whitespace-nowrap flex-shrink-0 font-semibold ${
                    isActive
                      ? `bg-gradient-to-r ${config.color} text-white shadow-xl scale-105 border-b-4 border-white`
                      : `text-gray-700 hover:bg-white/80 hover:shadow-md ${config.textColor}`
                  }`}
                >
                  <Icon size={22} className={isActive ? 'drop-shadow-md' : ''} />
                  <span className="text-base">{config.label}</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold min-w-[2rem] text-center ${
                      isActive
                        ? 'bg-white/30 text-white backdrop-blur-sm'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {showRightArrow && (
            <button
              onClick={() => scrollTabs('right')}
              className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-white via-white to-transparent px-3 flex items-center"
            >
              <div className="bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-shadow">
                <ChevronRight size={20} className="text-gray-700" />
              </div>
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search leads by name, email, company, phone, or referrer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Leads Grid */}
      {filteredLeads.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Users size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No leads found</h3>
          <p className="text-gray-600 mb-6">
            {searchTerm
              ? 'Try adjusting your search criteria'
              : 'Get started by adding your first lead'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Add Your First Lead
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLeads.map((lead) => {
            const isConverted = !!lead.converted_to_customer_id;
            return (
              <div
                key={lead.id}
                className={`bg-white rounded-xl shadow-sm border-2 p-6 hover:shadow-lg transition-all ${
                  isConverted ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'
                }`}
              >
                {isConverted && (
                  <div className="mb-3 flex items-center gap-2 text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg text-sm font-semibold w-fit">
                    <CheckCircle size={16} />
                    Converted to Customer
                  </div>
                )}

                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {lead.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate text-lg">{lead.name}</h3>
                    {lead.company_name && (
                      <p className="text-sm text-gray-600 truncate flex items-center gap-1">
                        <Building2 size={14} />
                        {lead.company_name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {lead.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail size={16} className="flex-shrink-0 text-blue-500" />
                      <span className="truncate">{lead.email}</span>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={16} className="flex-shrink-0 text-green-500" />
                      <span>{lead.phone}</span>
                    </div>
                  )}
                  {lead.source && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Tag size={16} className="flex-shrink-0 text-orange-500" />
                      <span className="truncate">Source: {lead.source}</span>
                    </div>
                  )}
                  {lead.referred_by && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users size={16} className="flex-shrink-0 text-purple-500" />
                      <span className="truncate font-medium">
                        Referred by: {lead.referred_by}
                      </span>
                    </div>
                  )}
                </div>

                {lead.lead_services && lead.lead_services.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">Interested Services:</p>
                    <div className="flex flex-wrap gap-1">
                      {lead.lead_services.map((ls: any, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-200"
                        >
                          {ls.services?.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!isConverted && (
                  <div className="mb-4">
                    <select
                      value={lead.status}
                      onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium border-0 cursor-pointer ${getStatusBadgeColor(
                        lead.status,
                        false
                      )}`}
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedLead(lead);
                      setShowDetailsModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <Eye size={16} />
                    Details
                  </button>
                  {!isConverted && (
                    <button
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowConvertModal(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <UserPlus size={16} />
                      Convert
                    </button>
                  )}
                  <button
                    onClick={() => deleteLead(lead.id)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(lead.created_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals positioned at left-64 top-16 */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchLeads();
          }}
        />
      )}

      {showConvertModal && selectedLead && (
        <ConvertLeadModal
          lead={selectedLead}
          onClose={() => {
            setShowConvertModal(false);
            setSelectedLead(null);
          }}
          onSuccess={() => {
            setShowConvertModal(false);
            setSelectedLead(null);
            fetchLeads();
          }}
        />
      )}

    {showDetailsModal && selectedLead && (
      <LeadDetails
        leadId={selectedLead.id}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedLead(null);
        }}
        onEdit={() => {
          setShowDetailsModal(false);
          setShowEditModal(true);
        }}
      />
    )}
    
    {showEditModal && selectedLead && (
      <EditLeadModal
        lead={selectedLead}
        onClose={() => {
          setShowEditModal(false);
          setSelectedLead(null);
        }}
        onSuccess={() => {
          setShowEditModal(false);
          setSelectedLead(null);
          fetchLeads();
        }}
      />
    )}

    </div>
  );
}
