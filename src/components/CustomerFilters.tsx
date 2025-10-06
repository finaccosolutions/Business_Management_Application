// src/components/CustomerFilters.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Filter, X, ChevronDown } from 'lucide-react';

interface CustomerFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  activeFilters: FilterState;
}

export interface FilterState {
  sources: string[];
  serviceTypes: string[];
  cities: string[];
  states: string[];
  gstStatus: 'all' | 'has_gst' | 'no_gst';
  dateFrom: string;
  dateTo: string;
}

export default function CustomerFilters({ onFilterChange, activeFilters }: CustomerFiltersProps) {
  const { user } = useAuth();
  const [sources, setSources] = useState<string[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);

  useEffect(() => {
    fetchFilterOptions();
  }, [user]);

  const fetchFilterOptions = async () => {
    try {
      // Fetch unique sources from leads converted to customers
      const { data: leadsData } = await supabase
        .from('leads')
        .select('source')
        .not('converted_to_customer_id', 'is', null);

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

      // Fetch unique cities and states
      const { data: customersData } = await supabase
        .from('customers')
        .select('city, state')
        .eq('user_id', user?.id);

      if (customersData) {
        const uniqueCities = [...new Set(customersData.map((c) => c.city).filter(Boolean))];
        const uniqueStates = [...new Set(customersData.map((c) => c.state).filter(Boolean))];
        setCities(uniqueCities as string[]);
        setStates(uniqueStates as string[]);
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

  const toggleCity = (city: string) => {
    const newCities = activeFilters.cities.includes(city)
      ? activeFilters.cities.filter((c) => c !== city)
      : [...activeFilters.cities, city];
    onFilterChange({ ...activeFilters, cities: newCities });
  };

  const toggleState = (state: string) => {
    const newStates = activeFilters.states.includes(state)
      ? activeFilters.states.filter((s) => s !== state)
      : [...activeFilters.states, state];
    onFilterChange({ ...activeFilters, states: newStates });
  };

  const clearAllFilters = () => {
    onFilterChange({
      sources: [],
      serviceTypes: [],
      cities: [],
      states: [],
      gstStatus: 'all',
      dateFrom: '',
      dateTo: '',
    });
  };

  const hasActiveFilters =
    activeFilters.sources.length > 0 ||
    activeFilters.serviceTypes.length > 0 ||
    activeFilters.cities.length > 0 ||
    activeFilters.states.length > 0 ||
    activeFilters.gstStatus !== 'all' ||
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

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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

        {/* City Filter */}
        <div className="relative">
          <button
            onClick={() => setShowCityDropdown(!showCityDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <span className="text-sm text-gray-700">
              {activeFilters.cities.length > 0
                ? `City (${activeFilters.cities.length})`
                : 'City'}
            </span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showCityDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowCityDropdown(false)}
              />
              <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                {cities.length > 0 ? (
                  cities.map((city) => (
                    <label
                      key={city}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={activeFilters.cities.includes(city)}
                        onChange={() => toggleCity(city)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">{city}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">No cities available</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* State Filter */}
        <div className="relative">
          <button
            onClick={() => setShowStateDropdown(!showStateDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <span className="text-sm text-gray-700">
              {activeFilters.states.length > 0
                ? `State (${activeFilters.states.length})`
                : 'State'}
            </span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showStateDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowStateDropdown(false)}
              />
              <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                {states.length > 0 ? (
                  states.map((state) => (
                    <label
                      key={state}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={activeFilters.states.includes(state)}
                        onChange={() => toggleState(state)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">{state}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">No states available</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* GST Status Filter */}
        <div>
          <select
            value={activeFilters.gstStatus}
            onChange={(e) =>
              onFilterChange({
                ...activeFilters,
                gstStatus: e.target.value as 'all' | 'has_gst' | 'no_gst',
              })
            }
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            <option value="all">GST Status</option>
            <option value="has_gst">Has GST</option>
            <option value="no_gst">No GST</option>
          </select>
        </div>

        {/* Date Range Filter */}
        <div>
          <input
            type="date"
            value={activeFilters.dateFrom}
            onChange={(e) => onFilterChange({ ...activeFilters, dateFrom: e.target.value })}
            placeholder="From Date"
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
          {activeFilters.cities.map((city) => (
            <span
              key={city}
              className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm"
            >
              {city}
              <button
                onClick={() => toggleCity(city)}
                className="hover:bg-orange-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {activeFilters.states.map((state) => (
            <span
              key={state}
              className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-sm"
            >
              {state}
              <button
                onClick={() => toggleState(state)}
                className="hover:bg-cyan-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {activeFilters.gstStatus !== 'all' && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm">
              {activeFilters.gstStatus === 'has_gst' ? 'Has GST' : 'No GST'}
              <button
                onClick={() => onFilterChange({ ...activeFilters, gstStatus: 'all' })}
                className="hover:bg-teal-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          )}
          {activeFilters.dateFrom && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm">
              From: {activeFilters.dateFrom}
              <button
                onClick={() => onFilterChange({ ...activeFilters, dateFrom: '' })}
                className="hover:bg-pink-200 rounded-full p-0.5 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          )}
          {activeFilters.dateTo && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm">
              To: {activeFilters.dateTo}
              <button
                onClick={() => onFilterChange({ ...activeFilters, dateTo: '' })}
                className="hover:bg-pink-200 rounded-full p-0.5 transition-colors"
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
