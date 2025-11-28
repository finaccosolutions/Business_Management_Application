import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, ChevronDown, Search } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface WorkFiltersProps {
  filterCustomer: string;
  setFilterCustomer: (value: string) => void;
  filterCategory: string;
  setFilterCategory: (value: string) => void;
  filterService: string;
  setFilterService: (value: string) => void;
  filterPriority: string;
  setFilterPriority: (value: string) => void;
  filterBillingStatus: string;
  setFilterBillingStatus: (value: string) => void;
  customers: Customer[];
  categories: Category[];
  allServices: Service[];
}

export default function WorkFilters({
  filterCustomer,
  setFilterCustomer,
  filterCategory,
  setFilterCategory,
  filterService,
  setFilterService,
  filterPriority,
  setFilterPriority,
  filterBillingStatus,
  setFilterBillingStatus,
  customers,
  categories,
  allServices,
}: WorkFiltersProps) {
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  // Get customer name for display
  const selectedCustomerName = customers.find(c => c.id === filterCustomer)?.name || '';

  // Get category name for display
  const selectedCategoryName = categories.find(c => c.id === filterCategory)?.name || '';

  // Filter categories by selected customer
  const getCustomerCategories = () => {
    if (!filterCustomer) return [];

    const customerServices = allServices.filter(s => {
      const customer = customers.find(c => c.id === filterCustomer);
      if (!customer) return false;
      return true;
    });

    const categoryIds = new Set(
      customerServices
        .filter(s => s.category_id)
        .map(s => s.category_id)
    );

    return categories.filter(cat => categoryIds.has(cat.id));
  };

  // Filter services by customer and category
  const getAvailableServices = () => {
    let filtered = allServices;

    if (filterCustomer) {
      filtered = filtered.filter(s => {
        const customer = customers.find(c => c.id === filterCustomer);
        if (!customer) return false;
        return true;
      });
    }

    if (filterCategory) {
      filtered = filtered.filter(s => s.category_id === filterCategory);
    }

    return filtered;
  };

  const availableCategories = getCustomerCategories();
  const availableServices = getAvailableServices();

  // Filter displayed options based on search
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredCategories = availableCategories.filter(cat =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const filteredServices = availableServices.filter(svc =>
    svc.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const handleClearAllFilters = () => {
    setFilterCustomer('');
    setFilterCategory('');
    setFilterService('');
    setFilterPriority('');
    setFilterBillingStatus('');
    setCustomerSearch('');
    setCategorySearch('');
    setServiceSearch('');
  };

  const hasActiveFilters =
    filterCustomer || filterCategory || filterService || filterPriority || filterBillingStatus;

  return (
    <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-gray-200">
      {/* Customer Filter */}
      <div className="relative">
        <button
          onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-400 transition-colors whitespace-nowrap bg-white"
        >
          <span className="truncate max-w-[150px]">
            {filterCustomer ? `Customer: ${selectedCustomerName}` : 'Customer'}
          </span>
          <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
        </button>

        {showCustomerDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowCustomerDropdown(false)}
            />
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-48">
              <div className="p-2 border-b border-gray-200">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {filterCustomer && (
                  <button
                    onClick={() => {
                      setFilterCustomer('');
                      setFilterCategory('');
                      setFilterService('');
                      setShowCustomerDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-50 border-b border-gray-100"
                  >
                    Clear Selection
                  </button>
                )}
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setFilterCustomer(customer.id);
                        setFilterCategory('');
                        setFilterService('');
                        setShowCustomerDropdown(false);
                        setCustomerSearch('');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                        filterCustomer === customer.id
                          ? 'bg-orange-50 text-orange-700 font-medium'
                          : 'text-gray-900'
                      }`}
                    >
                      {customer.name}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-gray-500">No customers found</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Category Filter - Only show if customer is selected */}
      {filterCustomer && (
        <div className="relative">
          <button
            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-400 transition-colors whitespace-nowrap bg-white"
          >
            <span className="truncate max-w-[150px]">
              {filterCategory ? `Category: ${selectedCategoryName}` : 'Category'}
            </span>
            <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
          </button>

          {showCategoryDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowCategoryDropdown(false)}
              />
              <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-48">
                <div className="p-2 border-b border-gray-200">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {filterCategory && (
                    <button
                      onClick={() => {
                        setFilterCategory('');
                        setFilterService('');
                        setShowCategoryDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-50 border-b border-gray-100"
                    >
                      Clear Selection
                    </button>
                  )}
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => {
                          setFilterCategory(category.id);
                          setFilterService('');
                          setShowCategoryDropdown(false);
                          setCategorySearch('');
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                          filterCategory === category.id
                            ? 'bg-orange-50 text-orange-700 font-medium'
                            : 'text-gray-900'
                        }`}
                      >
                        {category.name}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-500">No categories found</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Service Filter - Show if customer is selected */}
      {filterCustomer && (
        <div className="relative">
          <button
            onClick={() => setShowServiceDropdown(!showServiceDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-gray-400 transition-colors whitespace-nowrap bg-white"
          >
            <span className="truncate max-w-[150px]">
              {filterService
                ? `Service: ${allServices.find(s => s.id === filterService)?.name || ''}`
                : 'Service'}
            </span>
            <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
          </button>

          {showServiceDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowServiceDropdown(false)}
              />
              <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-48">
                <div className="p-2 border-b border-gray-200">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {filterService && (
                    <button
                      onClick={() => {
                        setFilterService('');
                        setShowServiceDropdown(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-50 border-b border-gray-100"
                    >
                      Clear Selection
                    </button>
                  )}
                  {filteredServices.length > 0 ? (
                    filteredServices.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => {
                          setFilterService(service.id);
                          setShowServiceDropdown(false);
                          setServiceSearch('');
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                          filterService === service.id
                            ? 'bg-orange-50 text-orange-700 font-medium'
                            : 'text-gray-900'
                        }`}
                      >
                        {service.name}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-500">No services found</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Priority Filter */}
      <select
        value={filterPriority}
        onChange={(e) => setFilterPriority(e.target.value)}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      >
        <option value="">Priority</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      {/* Billing Status Filter */}
      <select
        value={filterBillingStatus}
        onChange={(e) => setFilterBillingStatus(e.target.value)}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      >
        <option value="">Billing</option>
        <option value="not_billed">Not Billed</option>
        <option value="billed">Billed</option>
        <option value="paid">Paid</option>
      </select>

      {/* Clear All Button */}
      {hasActiveFilters && (
        <button
          onClick={handleClearAllFilters}
          className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors border border-orange-300"
        >
          Clear All
        </button>
      )}
    </div>
  );
}
