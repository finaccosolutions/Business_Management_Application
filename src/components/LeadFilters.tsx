// src/components/LeadFilters.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Filter, X, ChevronDown } from 'lucide-react';

interface LeadFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  activeFilters: FilterState;
}

export interface FilterState {
  sources: string[];
  serviceTypes: string[];
  dateFrom: string;
  dateTo: string;
}

export default function LeadFilters({ onFilterChange, activeFilters }: LeadFiltersProps) {
  const { user } = useAuth();
  const [sources, setSources] = useState<string[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  useEffect(() => {
    fetchFilterOptions();
  }, [user]);

  const fetchFilterOptions = async () => {
    try {
      // Fetch unique sources
      const { data: leadsData } = await supabase
        .from('leads')
        .select('source')
        .eq('user_id', user?.id)
        .not('source', 'is', null);

      if (leadsData) {
        const uniqueSources = [...new Set(leadsData.map((l) => l.source))].filter(
          Boolean
        ) as string[];
        setSources(uniqueSources);
      }

      // Fetch services
      const { data: servicesData } = await supabase
        .from('services')
        .select('id, name')
        .eq('user_id', user?.id)
        .order('name');

      if (servicesData) {
        setServices(servicesData);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const toggleSource = (source: string) => {
    const newSources = activeFilters.sources.includes(source)
      ? activeFilters.sources.filter((s) => s !== source)
      : [...activeFilters.sources, source];

    onFilterChange({ ...activeFilters, sources: newSources });
  };

  const toggleService = (serviceId: string) => {
    const newServices = activeFilters.serviceTypes.includes(serviceId)
      ? activeFilters.serviceTypes.filter((s) => s !== serviceId)
      : [...activeFilters.serviceTypes, serviceId];

    onFilterChange({ ...activeFilters, serviceTypes: newServices });
  };

  const clearAllFilters = () => {
    onFilterChange({
      sources: [],
      serviceTypes: [],
      dateFrom: '',
      dateTo: '',
    });
  };

  const hasActiveFilters =
    activeFilters.sources.length > 0 ||
    activeFilters.serviceTypes.length > 0 ||
    activeFilters.dateFrom ||
    activeFilters.dateTo;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Source Filter */}
        <div className="relative">
          <button
            onClick={() => setShowSourceDropdown(!showSourceDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <span className="text-sm text-gray-700">
              {activeFilters.sources.length > 0
                ? `Source (${activeFilters.sources.length})`
                : 'Source'}
            </span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showSourceDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSourceDropdown(false)}
              />
              <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                {sources.length > 0 ? (
                  sources.map((source) => (
                    <label
                      key={source}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={activeFilters.sources.includes(source)}
                        onChange={() => toggleSource(source)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">{source}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">No sources available</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Service Type Filter */}
        <div className="relative">
          <button
            onClick={() => setShowServiceDropdown(!showServiceDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <span className="text-sm text-gray-700">
              {activeFilters.serviceTypes.length > 0
                ? `Service (${activeFilters.serviceTypes.length})`
                : 'Service Type'}
            </span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showServiceDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowServiceDropdown(false)}
              />
              <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                {services.length > 0 ? (
                  services.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={activeFilters.serviceTypes.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">{service.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">No services available</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Date Range Filters */}
        <div>
          <input
            type="date"
            value={activeFilters.dateFrom}
            onChange={(e) => onFilterChange({ ...activeFilters, dateFrom: e.target.value })}
            placeholder="From Date"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <input
            type="date"
            value={activeFilters.dateTo}
            onChange={(e) => onFilterChange({ ...activeFilters, dateTo: e.target.value })}
            placeholder="To Date"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200">
          {activeFilters.sources.map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
            >
              {source}
              <button
                onClick={() => toggleSource(source)}
                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {activeFilters.serviceTypes.map((serviceId) => {
            const service = services.find((s) => s.id === serviceId);
            return (
              <span
                key={serviceId}
                className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm"
              >
                {service?.name}
                <button
                  onClick={() => toggleService(serviceId)}
                  className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                >
                  <X size={14} />
                </button>
              </span>
            );
          })}
          {activeFilters.dateFrom && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
              From: {activeFilters.dateFrom}
              <button
                onClick={() => onFilterChange({ ...activeFilters, dateFrom: '' })}
                className="hover:bg-orange-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          )}
          {activeFilters.dateTo && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
              To: {activeFilters.dateTo}
              <button
                onClick={() => onFilterChange({ ...activeFilters, dateTo: '' })}
                className="hover:bg-orange-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
