// src/pages/Customers.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, UserCog, Mail, Phone, Building, MapPin, Trash2 } from 'lucide-react';
import CustomerDetails from '../components/CustomerDetails';
import CustomerFormModal from '../components/CustomerFormModal';
import { useConfirmation } from '../contexts/ConfirmationContext';
import { useToast } from '../contexts/ToastContext';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  gst_number: string | null;
  gstin: string | null;
  pan_number: string | null;
  notes: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
}

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const confirmation = useConfirmation();
  const toast = useToast();

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    confirmation.showConfirmation({
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone.',
      confirmText: 'Delete',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('customers').delete().eq('id', id);
          if (error) throw error;
          toast.success('Customer deleted successfully');
          fetchCustomers();
        } catch (error) {
          console.error('Error deleting customer:', error);
          toast.error('Failed to delete customer');
        }
      },
    });
  };

  const handleAddSuccess = (customerId: string) => {
    setShowAddModal(false);
    fetchCustomers();
    // Optionally open the newly created customer details
    setSelectedCustomerId(customerId);
  };

  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search) ||
      customer.company_name?.toLowerCase().includes(search)
    );
  });

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
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600 mt-1">Manage your customer database and information</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Customer</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search customers by name, email, phone, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => (
          <div
            key={customer.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 transform transition-all duration-200 hover:shadow-lg hover:scale-[1.01] cursor-pointer"
            onClick={() => setSelectedCustomerId(customer.id)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 overflow-hidden">
                  {customer.image_url ? (
                    <img
                      src={customer.image_url}
                      alt={customer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    customer.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate hover:text-green-600 transition-colors">
                    {customer.name}
                  </h3>
                  {customer.company_name && (
                    <p className="text-sm text-gray-600 truncate flex items-center gap-1">
                      <Building size={12} />
                      {customer.company_name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {customer.email && (
                <div className="flex items-center text-sm text-gray-600">
                  <Mail className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                  <span className="line-clamp-1">{customer.address}</span>
                </div>
              )}
              {customer.city && (
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>
                    {[customer.city, customer.state, customer.pincode]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
              {(customer.gstin || customer.gst_number) && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">GST:</span> {customer.gstin || customer.gst_number}
                </div>
              )}
              {customer.pan_number && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">PAN:</span> {customer.pan_number}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCustomerId(customer.id);
                }}
                className="flex-1 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium"
              >
                View Details
              </button>
              <button
                onClick={(e) => handleDelete(customer.id, e)}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                title="Delete Customer"
              >
                <Trash2 size={18} />
              </button>
            </div>

          </div>
        ))}

        {filteredCustomers.length === 0 && (
          <div className="col-span-full text-center py-12">
            <UserCog className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No customers found' : 'No customers yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Start by adding your first customer'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Customer</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerId && (
        <CustomerDetails
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={fetchCustomers}
        />
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <CustomerFormModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
          mode="create"
          title="Add New Customer"
        />
      )}
    </div>
  );
}
