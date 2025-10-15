import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Edit2, Trash2, Search, X, BookOpen, TrendingUp, TrendingDown, ChevronRight, ArrowLeft, Grid3x3, List, Filter } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';

interface AccountGroup {
  id: string;
  name: string;
  account_type: string;
  parent_group_id: string | null;
  description: string;
  is_active: boolean;
  display_order: number;
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

interface LedgerTransaction {
  id: string;
  transaction_date: string;
  debit: number;
  credit: number;
  balance: number;
  narration: string;
  vouchers: { voucher_number: string } | null;
}

const accountTypeColors = {
  asset: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  liability: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  income: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expense: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  equity: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
};

const accountTypeBgColors = {
  asset: 'from-blue-500 to-blue-600',
  liability: 'from-red-500 to-red-600',
  income: 'from-green-500 to-green-600',
  expense: 'from-orange-500 to-orange-600',
  equity: 'from-slate-500 to-slate-600',
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
  const [editingGroup, setEditingGroup] = useState<AccountGroup | null>(null);
  const [activeTab, setActiveTab] = useState<'groups' | 'ledgers'>('ledgers');
  const [selectedGroup, setSelectedGroup] = useState<AccountGroup | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupFilterType, setGroupFilterType] = useState('all');
  const [groupViewMode, setGroupViewMode] = useState<'table' | 'cards'>('table');

  const [formData, setFormData] = useState({
    account_code: '',
    account_name: '',
    account_group_id: '',
    opening_balance: '0',
    description: '',
    is_active: true,
    debit_balance: true,
  });

  const [groupFormData, setGroupFormData] = useState({
    name: '',
    account_type: 'asset',
    parent_group_id: '',
    description: '',
    is_active: true,
    display_order: 0,
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

  const fetchTransactions = async (accountId: string) => {
    try {
      const { data, error } = await supabase
        .from('ledger_transactions')
        .select('*, vouchers(voucher_number)')
        .eq('account_id', accountId)
        .order('transaction_date', { ascending: true });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to load transactions');
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
        display_order: groupFormData.display_order,
        updated_at: new Date().toISOString(),
      };

      if (editingGroup) {
        const { error } = await supabase
          .from('account_groups')
          .update(groupData)
          .eq('id', editingGroup.id);

        if (error) throw error;
        toast.success('Group updated successfully');
      } else {
        const { error } = await supabase
          .from('account_groups')
          .insert(groupData);

        if (error) throw error;
        toast.success('Group created successfully');
      }

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
      debit_balance: true,
    });
    setShowModal(true);
  };

  const handleEditGroup = (group: AccountGroup) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
      account_type: group.account_type,
      parent_group_id: group.parent_group_id || '',
      description: group.description || '',
      is_active: group.is_active,
      display_order: group.display_order || 0,
    });
    setShowGroupModal(true);
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

  const handleDeleteGroup = async (id: string) => {
    showConfirmation({
      title: 'Delete Group',
      message: 'Are you sure you want to delete this group? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('account_groups')
            .delete()
            .eq('id', id);

          if (error) throw error;
          toast.success('Group deleted successfully');
          fetchData();
        } catch (error: any) {
          console.error('Error deleting group:', error);
          toast.error(error.message || 'Failed to delete group');
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
      debit_balance: true,
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
      display_order: 0,
    });
    setEditingGroup(null);
  };

  const handleGroupClick = (group: AccountGroup) => {
    setSelectedGroup(group);
    setSelectedAccount(null);
    setActiveTab('ledgers');
  };

  const handleAccountClick = async (account: Account) => {
    setSelectedAccount(account);
    await fetchTransactions(account.id);
  };

  const filteredAccounts = selectedGroup
    ? accounts.filter((account) => account.account_group_id === selectedGroup.id)
    : accounts.filter((account) => {
        const matchesSearch =
          searchQuery === '' ||
          account.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          account.account_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType =
          filterType === 'all' || account.account_groups.account_type === filterType;
        return matchesSearch && matchesType;
      });

  const groupsByType = ['asset', 'liability', 'income', 'expense', 'equity'].map((type) => ({
    type,
    groups: groups.filter((g) => {
      const matchesType = groupFilterType === 'all' || g.account_type === groupFilterType;
      const matchesSearch = groupSearchQuery === '' ||
        g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
        g.description?.toLowerCase().includes(groupSearchQuery.toLowerCase());
      return g.account_type === type && matchesType && matchesSearch;
    }),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (selectedAccount) {
    const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedAccount(null)}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Ledgers
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {selectedAccount.account_name}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Code: {selectedAccount.account_code}</p>
          <div className="mt-4 flex gap-4">
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <p className="text-xs text-blue-600 dark:text-blue-400">Opening Balance</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                ₹{selectedAccount.opening_balance.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="px-4 py-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
              <p className="text-xs text-green-600 dark:text-green-400">Current Balance</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                ₹{selectedAccount.current_balance.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-slate-700 dark:to-slate-600 border-b border-gray-200 dark:border-slate-600">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Voucher
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Narration
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Debit
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Credit
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(txn.transaction_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600 dark:text-blue-400">
                      {txn.vouchers?.voucher_number || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{txn.narration || '-'}</td>
                    <td className="px-6 py-4 text-right whitespace-nowrap text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {txn.debit > 0 ? `₹${txn.debit.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap text-sm font-semibold text-red-600 dark:text-red-400">
                      {txn.credit > 0 ? `₹${txn.credit.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                      ₹{txn.balance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-slate-700 border-t-2 border-gray-300 dark:border-slate-600">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                    Total:
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-blue-600 dark:text-blue-400">
                    ₹{totalDebit.toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-600 dark:text-red-400">
                    ₹{totalCredit.toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4"></td>
                </tr>
              </tfoot>
            </table>
            {transactions.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No transactions found for this ledger</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Chart of Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage groups, ledgers, and view account details</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'groups' && (
            <button
              onClick={() => {
                resetGroupForm();
                setShowGroupModal(true);
              }}
              className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
            >
              <Plus className="w-5 h-5" />
              <span>Add Group</span>
            </button>
          )}
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
            onClick={() => {
              setActiveTab('groups');
              setSelectedGroup(null);
            }}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'groups'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            Groups
          </button>
        </div>
      </div>

      {activeTab === 'groups' && (
        <>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search groups..."
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>
            <select
              value={groupFilterType}
              onChange={(e) => setGroupFilterType(e.target.value)}
              className="px-6 py-3 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="asset">Assets</option>
              <option value="liability">Liabilities</option>
              <option value="income">Income</option>
              <option value="expense">Expenses</option>
              <option value="equity">Equity</option>
            </select>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg p-1">
              <button
                onClick={() => setGroupViewMode('table')}
                className={`p-2 rounded-lg transition-colors ${
                  groupViewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                }`}
                title="Table View"
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setGroupViewMode('cards')}
                className={`p-2 rounded-lg transition-colors ${
                  groupViewMode === 'cards'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                }`}
                title="Card View"
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
            </div>
          </div>

        <div className="space-y-4">
          {groupsByType.map(({ type, groups: typeGroups }) => {
            if (typeGroups.length === 0) return null;

            const groupAccounts = accounts.filter((a) =>
              typeGroups.some((g) => g.id === a.account_group_id)
            );
            const totalBalance = groupAccounts.reduce((sum, a) => sum + a.current_balance, 0);

            return (
              <div
                key={type}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden"
              >
                <div
                  className={`bg-gradient-to-r ${
                    accountTypeBgColors[type as keyof typeof accountTypeBgColors]
                  } px-6 py-4 flex items-center justify-between`}
                >
                  <h2 className="text-xl font-bold text-white uppercase">{type}</h2>
                  <div className="text-right">
                    <p className="text-white/80 text-sm">Total Balance</p>
                    <p className="text-2xl font-bold text-white">₹{totalBalance.toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {groupViewMode === 'table' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Group Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Description
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Ledgers
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Balance
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                        {typeGroups.map((group) => {
                          const ledgerCount = accounts.filter((a) => a.account_group_id === group.id).length;
                          const groupBalance = accounts
                            .filter((a) => a.account_group_id === group.id)
                            .reduce((sum, a) => sum + a.current_balance, 0);

                          return (
                            <tr
                              key={group.id}
                              className="hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              onClick={() => handleGroupClick(group)}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                {group.description || '-'}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-semibold">
                                  {ledgerCount} Ledgers
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-blue-600 dark:text-blue-400">
                                ₹{groupBalance.toLocaleString('en-IN')}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditGroup(group);
                                    }}
                                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                    title="Edit Group"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteGroup(group.id);
                                    }}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                    title="Delete Group"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {typeGroups.map((group) => {
                      const ledgerCount = accounts.filter((a) => a.account_group_id === group.id).length;
                      const groupBalance = accounts
                        .filter((a) => a.account_group_id === group.id)
                        .reduce((sum, a) => sum + a.current_balance, 0);

                      return (
                        <div
                          key={group.id}
                          onClick={() => handleGroupClick(group)}
                          className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4 hover:shadow-lg transition-all cursor-pointer transform hover:scale-[1.02]"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-bold text-gray-900 dark:text-white text-lg">{group.name}</h3>
                              {group.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{group.description}</p>
                              )}
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Ledgers</p>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{ledgerCount}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Balance</p>
                              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                ₹{groupBalance.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditGroup(group);
                              }}
                              className="flex-1 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGroup(group.id);
                              }}
                              className="flex-1 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}

      {activeTab === 'ledgers' && (
        <>
          {selectedGroup && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedGroup(null)}
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to All Groups
              </button>
              <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedGroup.name}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedGroup.description}</p>
              </div>
            </div>
          )}

          {!selectedGroup && (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search ledgers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
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
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-slate-700 dark:to-slate-600 border-b border-gray-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Code
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Ledger Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Group
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Opening Balance
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Current Balance
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {filteredAccounts.map((account) => (
                    <tr
                      key={account.id}
                      className="hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      onClick={() => handleAccountClick(account)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {account.account_code}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{account.account_name}</p>
                            {account.description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{account.description}</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
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
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(account);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Edit Ledger"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(account.id);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {selectedGroup
                      ? 'No ledgers in this group. Create your first ledger.'
                      : 'Create your first ledger to get started'}
                  </p>
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
              <h2 className="text-2xl font-bold text-white">
                {editingGroup ? 'Edit Account Group' : 'Add Account Group'}
              </h2>
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

              <div className="grid grid-cols-2 gap-4">
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
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={groupFormData.display_order}
                    onChange={(e) =>
                      setGroupFormData({ ...groupFormData, display_order: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
                    placeholder="0"
                  />
                </div>
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

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={groupFormData.is_active}
                  onChange={(e) => setGroupFormData({ ...groupFormData, is_active: e.target.checked })}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">Active Group</label>
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
                  {editingGroup ? 'Update Group' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
