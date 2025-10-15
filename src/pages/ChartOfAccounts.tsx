import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Edit2, Trash2, Search, X, BookOpen, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';

interface AccountGroup {
  id: string;
  name: string;
  account_type: string;
  parent_group_id: string | null;
  description: string;
  is_active: boolean;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_group_id: string;
  opening_balance: number;
  current_balance: number;
  description: string;
  is_active: boolean;
  account_groups: { name: string; account_type: string };
}

const accountTypeColors = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  income: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
  equity: 'bg-slate-100 text-slate-700',
};

const accountTypeBgColors = {
  asset: 'bg-blue-500',
  liability: 'bg-red-500',
  income: 'bg-green-500',
  expense: 'bg-orange-500',
  equity: 'bg-slate-500',
};

export default function ChartOfAccounts() {
  const { user } = useAuth();
  const toast = useToast();
  const { showConfirmation } = useConfirmation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [activeTab, setActiveTab] = useState<'ledgers' | 'groups' | 'structure'>('ledgers');

  const [formData, setFormData] = useState({
    account_code: '',
    account_name: '',
    account_group_id: '',
    opening_balance: '0',
    description: '',
    is_active: true,
  });

  const [groupFormData, setGroupFormData] = useState({
    name: '',
    account_type: 'asset',
    parent_group_id: '',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [accountsResult, groupsResult] = await Promise.all([
        supabase
          .from('chart_of_accounts')
          .select('*, account_groups(name, account_type)')
          .order('account_code'),
        supabase
          .from('account_groups')
          .select('*')
          .order('display_order'),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (groupsResult.error) throw groupsResult.error;

      setAccounts(accountsResult.data || []);
      setGroups(groupsResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const accountData = {
        user_id: user!.id,
        account_code: formData.account_code,
        account_name: formData.account_name,
        account_group_id: formData.account_group_id,
        opening_balance: parseFloat(formData.opening_balance),
        current_balance: parseFloat(formData.opening_balance),
        description: formData.description,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingAccount) {
        const { error } = await supabase
          .from('chart_of_accounts')
          .update(accountData)
          .eq('id', editingAccount.id);

        if (error) throw error;
        toast.success('Ledger updated successfully');
      } else {
        const { error } = await supabase
          .from('chart_of_accounts')
          .insert(accountData);

        if (error) throw error;
        toast.success('Ledger created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving ledger:', error);
      toast.error(error.message || 'Failed to save ledger');
    }
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const groupData = {
        user_id: user!.id,
        name: groupFormData.name,
        account_type: groupFormData.account_type,
        parent_group_id: groupFormData.parent_group_id || null,
        description: groupFormData.description,
        is_active: groupFormData.is_active,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('account_groups')
        .insert(groupData);

      if (error) throw error;

      toast.success('Account group created successfully');
      setShowGroupModal(false);
      resetGroupForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving group:', error);
      toast.error(error.message || 'Failed to save group');
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      account_code: account.account_code,
      account_name: account.account_name,
      account_group_id: account.account_group_id,
      opening_balance: account.opening_balance.toString(),
      description: account.description || '',
      is_active: account.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    showConfirmation({
      title: 'Delete Ledger',
      message: 'Are you sure you want to delete this ledger? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('chart_of_accounts')
            .delete()
            .eq('id', id);

          if (error) throw error;
          toast.success('Ledger deleted successfully');
          fetchData();
        } catch (error: any) {
          console.error('Error deleting ledger:', error);
          toast.error(error.message || 'Failed to delete ledger');
        }
      },
    });
  };

  const resetForm = () => {
    setFormData({
      account_code: '',
      account_name: '',
      account_group_id: '',
      opening_balance: '0',
      description: '',
      is_active: true,
    });
    setEditingAccount(null);
  };

  const resetGroupForm = () => {
    setGroupFormData({
      name: '',
      account_type: 'asset',
      parent_group_id: '',
      description: '',
      is_active: true,
    });
  };

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch =
      searchQuery === '' ||
      account.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.account_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      filterType === 'all' || account.account_groups.account_type === filterType;
    return matchesSearch && matchesType;
  });

  const totalAssets = accounts
    .filter((a) => a.account_groups.account_type === 'asset')
    .reduce((sum, a) => sum + a.current_balance, 0);

  const totalLiabilities = accounts
    .filter((a) => a.account_groups.account_type === 'liability')
    .reduce((sum, a) => sum + a.current_balance, 0);

  const totalIncome = accounts
    .filter((a) => a.account_groups.account_type === 'income')
    .reduce((sum, a) => sum + a.current_balance, 0);

  const totalExpenses = accounts
    .filter((a) => a.account_groups.account_type === 'expense')
    .reduce((sum, a) => sum + a.current_balance, 0);

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Chart of Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage ledgers, groups, and account structure</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'ledgers' && (
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
            >
              <Plus className="w-5 h-5" />
              <span>Add Ledger</span>
            </button>
          )}
          {activeTab === 'groups' && (
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
            >
              <Plus className="w-5 h-5" />
              <span>Add Group</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="flex border-b border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('ledgers')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'ledgers'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            Ledgers
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'groups'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            Groups
          </button>
          <button
            onClick={() => setActiveTab('structure')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'structure'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            Structure
          </button>
        </div>
      </div>

      {activeTab === 'ledgers' && (
        <>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search ledgers by code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-6 py-3 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="asset">Assets</option>
              <option value="liability">Liabilities</option>
              <option value="income">Income</option>
              <option value="expense">Expenses</option>
              <option value="equity">Equity</option>
            </select>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-slate-700 dark:to-slate-600 border-b border-gray-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ledger Code
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ledger Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Group / Type
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Opening Balance
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Current Balance
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {filteredAccounts.map((account) => (
                    <tr
                      key={account.id}
                      className="hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {account.account_code}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{account.account_name}</p>
                          {account.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{account.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {account.account_groups.name}
                          </p>
                          <span
                            className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                              accountTypeColors[
                                account.account_groups.account_type as keyof typeof accountTypeColors
                              ]
                            }`}
                          >
                            {account.account_groups.account_type.toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          ₹{account.opening_balance.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          ₹{account.current_balance.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            account.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {account.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(account)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Ledger"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(account.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Ledger"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredAccounts.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No ledgers found</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first ledger to get started</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add Ledger</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'groups' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{group.name}</h3>
                  <span
                    className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                      accountTypeColors[group.account_type as keyof typeof accountTypeColors]
                    }`}
                  >
                    {group.account_type.toUpperCase()}
                  </span>
                  {group.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{group.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      group.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {group.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No groups found</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first group to get started</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'structure' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Structure Tree View</h3>
          <div className="space-y-4">
            {['asset', 'liability', 'income', 'expense', 'equity'].map((type) => {
              const typeGroups = groups.filter((g) => g.account_type === type);
              if (typeGroups.length === 0) return null;

              return (
                <div key={type} className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
                  <div className={`px-4 py-3 font-semibold text-white ${accountTypeBgColors[type as keyof typeof accountTypeBgColors]}`}>
                    {type.toUpperCase()}
                  </div>
                  <div className="p-4 space-y-3">
                    {typeGroups.map((group) => {
                      const groupAccounts = accounts.filter((a) => a.account_group_id === group.id);
                      return (
                        <div key={group.id} className="ml-0">
                          <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            {group.name}
                          </div>
                          {groupAccounts.length > 0 && (
                            <div className="ml-6 space-y-1">
                              {groupAccounts.map((account) => (
                                <div key={account.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 dark:bg-slate-700 rounded text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-gray-600 dark:text-gray-400">{account.account_code}</span>
                                    <span className="text-gray-900 dark:text-white">{account.account_name}</span>
                                  </div>
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    ₹{account.current_balance.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-cyan-600">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <BookOpen size={28} />
                {editingAccount ? 'Edit Ledger' : 'Add New Ledger'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ledger Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="e.g., 1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account Group *
                  </label>
                  <select
                    required
                    value={formData.account_group_id}
                    onChange={(e) => setFormData({ ...formData, account_group_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.account_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ledger Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="e.g., Cash in Hand"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Opening Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.opening_balance}
                  onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="Ledger description..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">Active Ledger</label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all font-medium shadow-lg"
                >
                  {editingAccount ? 'Update Ledger' : 'Create Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-green-600 to-emerald-600">
              <h2 className="text-2xl font-bold text-white">Add Account Group</h2>
              <button
                onClick={() => {
                  setShowGroupModal(false);
                  resetGroupForm();
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleGroupSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Group Name *
                </label>
                <input
                  type="text"
                  required
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="e.g., Current Assets"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Account Type *
                </label>
                <select
                  required
                  value={groupFormData.account_type}
                  onChange={(e) =>
                    setGroupFormData({ ...groupFormData, account_type: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="equity">Equity</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parent Group (Optional)
                </label>
                <select
                  value={groupFormData.parent_group_id}
                  onChange={(e) =>
                    setGroupFormData({ ...groupFormData, parent_group_id: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="">None</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={groupFormData.description}
                  onChange={(e) =>
                    setGroupFormData({ ...groupFormData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="Group description..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupModal(false);
                    resetGroupForm();
                  }}
                  className="px-6 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all font-medium shadow-lg"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
