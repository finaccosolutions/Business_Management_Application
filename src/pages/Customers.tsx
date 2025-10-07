// src/pages/Customers.tsx (Enhanced Version)
import { useEffect, useState } from 'react';
import { Bolt Database } from '../lib/Bolt Database';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Eye,
  Trash2,
  Edit,
  Building,
  User,
  FileText,
} from 'lucide-react';
import CustomerDetails from '../components/CustomerDetails';
import CustomerFormModal from '../components/CustomerFormModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../contexts/ToastContext';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  company_name: string;
  created_at: string;
}

export default function Customers() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  useEffect(() => {
    filterCustomers();
  }, [searchTerm, customers]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await Bolt Database
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      showToast('Failed to fetch customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filterCustomers = () => {
    if (!searchTerm.trim()) {
      setFilteredCustomers(customers);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        customer.email.toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        (customer.company_name && customer.company_name.toLowerCase().includes(term))
    );
    setFilteredCustomers(filtered);
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;

    try {
      const { error } = await Bolt Database
        .from('customers')
        .delete()
        .eq('id', customerToDelete.id);

      if (error) throw error;

      showToast('Customer deleted successfully', 'success');
      fetchCustomers();
      setShowDeleteModal(false);
      setCustomerToDelete(null);
    } catch (error) {
      console.error('Error deleting customer:', error);
      showToast('Failed to delete customer', 'error');
    }
  };

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowFormModal(true);
  };

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailsModal(true);
  };

  const confirmDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setShowDeleteModal(true);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600 mt-1">Manage your customer database</p>
        </div>
        <button
          onClick={() => {
            setSelectedCustomer(null);
            setShowFormModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Customer
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search customers by name, email, phone, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => (
          <div
            key={customer.id}
            className="bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-xl transition-shadow overflow-hidden"
          >
            {/* Header Section with Company/Name */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {customer.company_name ? (
                      <Building className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <User className="w-5 h-5 flex-shrink-0" />
                    )}
                    <h3 className="font-bold text-lg truncate">
                      {customer.company_name || customer.name}
                    </h3>
                  </div>
                  {customer.company_name && (
                    <p className="text-sm text-blue-100 truncate">{customer.name}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Details Section - More Space */}
            <div className="p-4 space-y-3">
              {/* Email */}
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Email</p>
                  <p className="text-sm text-gray-900 break-all">{customer.email}</p>
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Phone</p>
                  <p className="text-sm text-gray-900">{customer.phone}</p>
                </div>
              </div>

              {/* Address */}
              {customer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">Address</p>
                    <p className="text-sm text-gray-900 line-clamp-2">{customer.address}</p>
                  </div>
                </div>
              )}

              {/* GSTIN */}
              {customer.gstin && (
                <div className="flex items-start gap-3">
                  <FileText className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">GSTIN</p>
                    <p className="text-sm text-gray-900 font-mono">{customer.gstin}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons - Vertical Layout */}
            <div className="border-t border-gray-200 p-3 bg-gray-50">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleViewDetails(customer)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEdit(customer)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => confirmDelete(customer)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            {searchTerm ? 'No customers found matching your search' : 'No customers yet'}
          </p>
        </div>
      )}

      {showFormModal && (
        <CustomerFormModal
          customer={selectedCustomer}
          onClose={() => {
            setShowFormModal(false);
            setSelectedCustomer(null);
          }}
          onSuccess={() => {
            fetchCustomers();
            setShowFormModal(false);
            setSelectedCustomer(null);
          }}
        />
      )}

      {showDetailsModal && selectedCustomer && (
        <CustomerDetails
          customerId={selectedCustomer.id}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedCustomer(null);
          }}
        />
      )}

      {showDeleteModal && (
        <ConfirmationModal
          title="Delete Customer"
          message={`Are you sure you want to delete ${customerToDelete?.name}? This action cannot be undone.`}
          confirmLabel="Delete"
          confirmStyle="danger"
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDeleteModal(false);
            setCustomerToDelete(null);
          }}
        />
      )}
    </div>
  );
}
