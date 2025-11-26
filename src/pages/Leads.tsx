import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users,
  Plus,
  Search,
  Filter,
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
import EditLeadModal from '../components/EditLeadModal';
import LeadFilters, { FilterState } from '../components/LeadFilters';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';


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
  followup_count?: number;
  next_followup_date?: string;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { showConfirmation } = useConfirmation();
  const toast = useToast();


  const tabsRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sources: [],
    serviceTypes: [],
    dateFrom: '',
    dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);

useEffect(() => {
  const navigationState = sessionStorage.getItem('searchNavigationState');
  if (navigationState) {
    try {
      const state = JSON.parse(navigationState);
      if (state.itemType === 'lead' && state.shouldShowDetails) {
        setSelectedLead(state);
        setShowDetailsModal(true);
        sessionStorage.removeItem('searchNavigationState');
      }
    } catch (error) {
      console.error('Error reading navigation state:', error);
    }
  }
}, []);


  useEffect(() => {
    if (user) {
      fetchLeads();
    }
  }, [user]);

  useEffect(() => {
    filterLeads();
  }, [leads, searchTerm, activeTab, filters]);

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

      // Fetch follow-up counts for each lead
      const leadsWithFollowups = await Promise.all(
        (data || []).map(async (lead) => {
          const { data: followups } = await supabase
            .from('lead_followups')
            .select('id, followup_date, status')
            .eq('lead_id', lead.id)
            .eq('status', 'pending')
            .order('followup_date', { ascending: true });

          return {
            ...lead,
            followup_count: followups?.length || 0,
            next_followup_date: followups?.[0]?.followup_date || null,
          };
        })
      );

      setLeads(leadsWithFollowups);
    } catch (error: any) {
      console.error('Error fetching leads:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const filterLeads = () => {
    let filtered = leads;

    // Status filter
    if (activeTab !== 'all') {
      if (activeTab === 'converted') {
        filtered = filtered.filter((lead) => lead.converted_to_customer_id !== null);
      } else {
        filtered = filtered.filter(
          (lead) => lead.status === activeTab && !lead.converted_to_customer_id
        );
      }
    }

    // Source filter
    if (filters.sources.length > 0) {
      filtered = filtered.filter((lead) => filters.sources.includes(lead.source));
    }

    // Service type filter
    if (filters.serviceTypes.length > 0) {
      filtered = filtered.filter((lead) =>
        lead.lead_services?.some((ls: any) =>
          filters.serviceTypes.includes(ls.service_id)
        )
      );
    }

    // Date range filter
    if (filters.dateFrom) {
      filtered = filtered.filter(
        (lead) => new Date(lead.created_at) >= new Date(filters.dateFrom)
      );
    }
    if (filters.dateTo) {
      filtered = filtered.filter(
        (lead) => new Date(lead.created_at) <= new Date(filters.dateTo)
      );
    }

    // Search filter
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
      toast.error('Failed to update lead status');
    }
  };

  const deleteLead = async (leadId: string) => {
    showConfirmation({
      title: 'Delete Lead',
      message: 'Are you sure you want to delete this lead? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('leads').delete().eq('id', leadId);
  
          if (error) throw error;
  
          setLeads(leads.filter((lead) => lead.id !== leadId));
          toast.success('Lead deleted successfully');
        } catch (error: any) {
          console.error('Error deleting lead:', error.message);
          toast.error('Failed to delete lead');
        }
      }
    });
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Leads</h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Filters"
          >
            <Filter className="w-4 h-4" />
            {(filters.sources.length > 0 ||
              filters.serviceTypes.length > 0 ||
              filters.dateFrom ||
              filters.dateTo) && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1 text-xs">
                {[
                  filters.sources.length,
                  filters.serviceTypes.length,
                  filters.dateFrom ? 1 : 0,
                  filters.dateTo ? 1 : 0,
                ].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
            title="Add Lead"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="sm:hidden bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Colorful Tabs with Icons */}
      <div className="bg-gradient-to-r from-slate-100 via-gray-50 to-slate-100 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="relative">
          {showLeftArrow && (
            <button
              onClick={() => scrollTabs('left')}
              className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-white via-white to-transparent px-2 flex items-center"
            >
              <div className="bg-white rounded-full p-1.5 shadow-md hover:shadow-lg transition-shadow">
                <ChevronLeft size={16} className="text-gray-700" />
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
                  className={`flex items-center gap-2 px-3 sm:px-4 py-3 transition-all whitespace-nowrap flex-shrink-0 font-semibold text-sm ${
                    isActive
                      ? `bg-gradient-to-r ${config.color} text-white shadow-lg border-b-4 border-white`
                      : `text-gray-700 hover:bg-white/80 hover:shadow-sm ${config.textColor}`
                  }`}
                >
                  <Icon size={18} className={isActive ? 'drop-shadow-md' : ''} />
                  <span className="hidden sm:inline text-sm">{config.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold min-w-[1.5rem] text-center ${
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
              className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-white via-white to-transparent px-2 flex items-center"
            >
              <div className="bg-white rounded-full p-1.5 shadow-md hover:shadow-lg transition-shadow">
                <ChevronRight size={16} className="text-gray-700" />
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

      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <LeadFilters onFilterChange={setFilters} activeFilters={filters} />
        </div>
      )}

      {/* Leads List - Compact Cards */}
      {filteredLeads.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
          <Users size={40} className="mx-auto text-gray-400 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No leads found</h3>
          <p className="text-sm text-gray-600 mb-6">
            {searchTerm
              ? 'Try adjusting your search criteria'
              : 'Get started by adding your first lead'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              Add Your First Lead
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredLeads.map((lead) => {
            const isConverted = !!lead.converted_to_customer_id;
            const statusConfig = statusOptions.find(s => s.value === lead.status);

            return (
              <div
                key={lead.id}
                className={`bg-white rounded-lg shadow-sm border-l-4 ${
                  isConverted
                    ? 'border-l-emerald-500 hover:bg-emerald-50/20'
                    : 'border-l-blue-500 hover:bg-blue-50/20'
                } border-t border-r border-b border-gray-200 transition-all cursor-pointer hover:shadow-md`}
                onClick={() => {
                  setSelectedLead(lead);
                  setShowDetailsModal(true);
                }}
              >
                <div className="p-3 sm:p-4">
                  <div className="flex items-start gap-3 justify-between flex-wrap">
                    {/* Profile & Name Section */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0 text-sm sm:text-base font-bold">
                        {lead.name?.charAt(0).toUpperCase() || 'L'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{lead.name}</h3>
                          {isConverted && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Converted</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-600">
                          {lead.company_name && (
                            <span className="truncate flex items-center gap-1">
                              <Building2 size={12} className="flex-shrink-0" />
                              {lead.company_name}
                            </span>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="truncate text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                              {lead.email}
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${getStatusBadgeColor(lead.status, false)}`}>
                            {statusConfig?.label || lead.status}
                          </span>
                          {lead.phone && (
                            <span className="flex items-center gap-1 text-gray-600">
                              <Phone size={12} className="flex-shrink-0" />
                              {lead.phone}
                            </span>
                          )}
                          {lead.followup_count > 0 && (
                            <span className="flex items-center gap-1 text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
                              <Calendar size={11} className="flex-shrink-0" />
                              {lead.followup_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Icons - Horizontal */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                          setShowDetailsModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      {!isConverted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLead(lead);
                            setShowConvertModal(true);
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Convert to Customer"
                        >
                          <UserPlus size={18} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLead(lead.id);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Lead"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
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
