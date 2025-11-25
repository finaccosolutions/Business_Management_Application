import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Edit2, Trash2, Search, X, BookOpen, TrendingUp, TrendingDown, ChevronRight, ChevronDown, ArrowLeft, Grid3x3, List, Filter, Network, FolderPlus, Settings } from 'lucide-react';
import { useConfirmation } from '../contexts/ConfirmationContext';
import AccountTreeView from '../components/AccountTreeView';
import ReportSettingsModal from '../components/ReportSettingsModal';

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
  _debit?: number;
  _credit?: number;
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

interface ChartOfAccountsProps {
  onNavigate?: (page: string) => void;
}

export default function ChartOfAccounts({ onNavigate }: ChartOfAccountsProps = {}) {
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
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupFilterType, setGroupFilterType] = useState('all');
  const [groupViewMode, setGroupViewMode] = useState<'table' | 'cards' | 'tree'>('table');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [ledgerViewMode, setLedgerViewMode] = useState<'table' | 'cards'>('table');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showLedgerSettings, setShowLedgerSettings] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

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
      const [accountsResult, groupsResult, transactionsResult] = await Promise.all([
        supabase
          .from('chart_of_accounts')
          .select('*, account_groups(name, account_type)')
          .order('account_code'),
        supabase
          .from('account_groups')
          .select('*')
          .order('display_order'),
        supabase
          .from('ledger_transactions')
          .select('account_id, debit, credit'),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (groupsResult.error) throw groupsResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      const balances = new Map<string, { debit: number; credit: number }>();

      transactionsResult.data?.forEach((txn: any) => {
        const existing = balances.get(txn.account_id) || { debit: 0, credit: 0 };
        existing.debit += Number(txn.debit) || 0;
        existing.credit += Number(txn.credit) || 0;
        balances.set(txn.account_id, existing);
      });

      const accountsWithBalances = (accountsResult.data || []).map((account: any) => {
        const txnBalance = balances.get(account.id) || { debit: 0, credit: 0 };
        const openingBalance = Number(account.opening_balance) || 0;

        let debit = txnBalance.debit;
        let credit = txnBalance.credit;

        if (openingBalance > 0) {
          debit += openingBalance;
        } else if (openingBalance < 0) {
          credit += Math.abs(openingBalance);
        }

        const currentBalance = debit - credit;

        return {
          ...account,
          current_balance: currentBalance,
          _debit: debit,
          _credit: credit,
        };
      });

      setAccounts(accountsWithBalances);
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

  const generateLedgerCode = async () => {
    try {
      const { data, error } = await supabase.rpc('generate_ledger_code', {
        p_user_id: user!.id
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error generating ledger code:', error);
      return '';
    }
  };

  const resetForm = async () => {
    const newCode = await generateLedgerCode();
    setFormData({
      account_code: newCode,
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
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group.id)) {
      newExpanded.delete(group.id);
    } else {
      newExpanded.add(group.id);
    }
    setExpandedGroups(newExpanded);
  };

  const handleAddChildGroup = (parentGroup: AccountGroup) => {
    setGroupFormData({
      name: '',
      account_type: parentGroup.account_type,
      parent_group_id: parentGroup.id,
      description: '',
      is_active: true,
      display_order: 0,
    });
    setShowGroupModal(true);
  };

  const handleAddLedgerToGroup = async (group: AccountGroup) => {
    await resetForm();
    setFormData(prev => ({
      ...prev,
      account_group_id: group.id,
    }));
    setShowModal(true);
  };

  const renderNestedGroup = (subGroup: AccountGroup, nestLevel: number): JSX.Element => {
    const subGroupExpanded = expandedGroups.has(subGroup.id);
    const subGroupLedgers = accounts.filter((a) => a.account_group_id === subGroup.id);
    const nestedSubGroups = groups.filter((g) => g.parent_group_id === subGroup.id);
    const hasSubChildren = nestedSubGroups.length > 0 || subGroupLedgers.length > 0;

    return (
      <div key={subGroup.id} className="border-l-2 border-gray-300 dark:border-slate-600 pl-3">
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleGroupClick(subGroup);
          }}
          className="bg-white dark:bg-slate-700 p-2.5 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-green-300 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-slate-600 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasSubChildren ? (
                subGroupExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                )
              ) : (
                <div className="w-3.5" />
              )}
              <span className="font-semibold text-gray-900 dark:text-white text-sm">
                {subGroup.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({subGroupLedgers.length} ledgers)
              </span>
            </div>
          </div>
        </div>

        {subGroupExpanded && (
          <div className="mt-2 ml-4 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddChildGroup(subGroup);
                }}
                className="flex items-center gap-1.5 bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 transition-colors text-xs font-medium"
              >
                <FolderPlus className="w-3 h-3" />
                Add Subgroup
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddLedgerToGroup(subGroup);
                }}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
              >
                <Plus className="w-3 h-3" />
                Add Ledger
              </button>
            </div>

            {nestedSubGroups.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  Nested Subgroups ({nestedSubGroups.length})
                </h5>
                <div className="space-y-1.5">
                  {nestedSubGroups.map((nested) => renderNestedGroup(nested, nestLevel + 1))}
                </div>
              </div>
            )}

            {nestedSubGroups.length === 0 && subGroupLedgers.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                No subgroups or ledgers yet. Add one using the buttons above.
              </p>
            )}

            {subGroupLedgers.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  Ledgers ({subGroupLedgers.length})
                </h5>
                <div className="space-y-1">
                  {subGroupLedgers.map((ledger) => (
                    <div
                      key={ledger.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAccountClick(ledger);
                      }}
                      className="bg-white dark:bg-slate-700 p-2 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-slate-600 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3 h-3 text-gray-400" />
                          <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                            {ledger.account_code}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white text-xs">
                            {ledger.account_name}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          ₹{ledger.current_balance.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleAccountClick = async (account: Account) => {
    try {
      // Store params in sessionStorage for the Ledger page to read
      const params = {
        account: account.id,
        returnPath: '/chart-of-accounts',
      };
      sessionStorage.setItem('ledgerParams', JSON.stringify(params));

      // Navigate to ledger page using the app's navigation system
      if (onNavigate) {
        onNavigate('ledger');
      }
    } catch (error) {
      console.error('Error navigating to ledger:', error);
      toast.error('Failed to open ledger');
    }
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

  const buildHierarchy = (parentId: string | null, allGroups: AccountGroup[], level: number = 0): (AccountGroup & { level: number; children?: AccountGroup[] })[] => {
    const children = allGroups.filter(g => g.parent_group_id === parentId);
    const result: (AccountGroup & { level: number; children?: AccountGroup[] })[] = [];

    children.forEach(child => {
      const childGroups = allGroups.filter(g => g.parent_group_id === child.id);
      result.push({ ...child, level, children: childGroups });
      result.push(...buildHierarchy(child.id, allGroups, level + 1));
    });

    return result;
  };

  const groupsByType = ['asset', 'liability', 'income', 'expense', 'equity'].map((type) => {
    const typeGroups = groups.filter((g) => {
      const matchesType = groupFilterType === 'all' || g.account_type === groupFilterType;
      const matchesSearch = groupSearchQuery === '' ||
        g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
        g.description?.toLowerCase().includes(groupSearchQuery.toLowerCase());
      return g.account_type === type && matchesType && matchesSearch;
    });

    return {
      type,
      groups: buildHierarchy(null, typeGroups),
    };
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Chart of Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage groups, ledgers, and view account details</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'groups' && (
            <>
              <button
                onClick={() => setShowGroupSettings(true)}
                className="flex items-center space-x-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white px-6 py-3 rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
                title="Configure group columns"
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
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
            </>
          )}
          {activeTab === 'ledgers' && (
            <>
              <button
                onClick={() => setShowLedgerSettings(true)}
                className="flex items-center space-x-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white px-6 py-3 rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
                title="Configure ledger columns"
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
              <button
                onClick={async () => {
                  await resetForm();
                  setShowModal(true);
                }}
                className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
              >
                <Plus className="w-5 h-5" />
                <span>Add Ledger</span>
              </button>
            </>
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
              <button
                onClick={() => setGroupViewMode('tree')}
                className={`p-2 rounded-lg transition-colors ${
                  groupViewMode === 'tree'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                }`}
                title="Tree View"
              >
                <Network className="w-5 h-5" />
              </button>
            </div>
          </div>

        <div className="space-y-4">
          {groupViewMode === 'tree' ? (
            <AccountTreeView
              groups={groups.filter(g => {
                const matchesType = groupFilterType === 'all' || g.account_type === groupFilterType;
                const matchesSearch = groupSearchQuery === '' ||
                  g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                  g.description?.toLowerCase().includes(groupSearchQuery.toLowerCase());
                return matchesType && matchesSearch;
              })}
              accounts={accounts}
              onGroupClick={(group) => handleGroupClick(group)}
              onAccountClick={(account) => handleAccountClick(account)}
            />
          ) : (
            groupsByType.map(({ type, groups: typeGroups }) => {
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
                          <th colSpan={2} className="px-6 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Closing
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Actions
                          </th>
                        </tr>
                        <tr>
                          <th></th>
                          <th></th>
                          <th></th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Debit (₹)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                            Credit (₹)
                          </th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                        {typeGroups.map((group) => {
                          const ledgerCount = accounts.filter((a) => a.account_group_id === group.id).length;
                          const groupBalance = accounts
                            .filter((a) => a.account_group_id === group.id)
                            .reduce((sum, a) => sum + a.current_balance, 0);
                          const isExpanded = expandedGroups.has(group.id);
                          const groupLedgers = accounts.filter((a) => a.account_group_id === group.id);
                          const subGroups = groups.filter((g) => g.parent_group_id === group.id);
                          const hasChildren = subGroups.length > 0 || groupLedgers.length > 0;

                          return (
                            <>
                              <tr
                                key={group.id}
                                className="hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                onClick={() => handleGroupClick(group)}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2" style={{ paddingLeft: `${group.level * 24}px` }}>
                                    {hasChildren ? (
                                      isExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                      )
                                    ) : (
                                      <div className="w-4" />
                                    )}
                                    <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
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
                                  ₹{groupLedgers.reduce((sum, a) => sum + (a._debit || 0), 0).toLocaleString('en-IN')}
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-red-600 dark:text-red-400">
                                  ₹{groupLedgers.reduce((sum, a) => sum + (a._credit || 0), 0).toLocaleString('en-IN')}
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
                              {isExpanded && (
                                <tr>
                                  <td colSpan={5} className="px-6 py-4 bg-gray-50 dark:bg-slate-900">
                                    <div className="space-y-4" style={{ paddingLeft: `${(group.level + 1) * 24}px` }}>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddChildGroup(group);
                                          }}
                                          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors text-xs font-medium"
                                        >
                                          <FolderPlus className="w-3.5 h-3.5" />
                                          Add Subgroup
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddLedgerToGroup(group);
                                          }}
                                          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          Add Ledger
                                        </button>
                                      </div>


                                      {subGroups.length > 0 && (
                                        <div>
                                          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                            Subgroups ({subGroups.length})
                                          </h4>
                                          <div className="space-y-1.5">
                                            {subGroups.map((subGroup) => renderNestedGroup(subGroup, 1))}
                                          </div>
                                        </div>
                                      )}

                                      {subGroups.length === 0 && groupLedgers.length === 0 && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                                          No subgroups or ledgers yet. Add one using the buttons above.
                                        </p>
                                      )}

                                      {groupLedgers.length > 0 && (
                                        <div>
                                          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                            Ledgers ({groupLedgers.length})
                                          </h4>
                                          <div className="space-y-1.5">
                                            {groupLedgers.map((ledger) => (
                                              <div
                                                key={ledger.id}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleAccountClick(ledger);
                                                }}
                                                className="bg-white dark:bg-slate-700 p-2.5 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-slate-600 transition-all cursor-pointer"
                                              >
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2.5">
                                                    <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                                                    <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                                                      {ledger.account_code}
                                                    </span>
                                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                      {ledger.account_name}
                                                    </span>
                                                  </div>
                                                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    ₹{ledger.current_balance.toLocaleString('en-IN')}
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="space-y-4 p-4">
                    {typeGroups.map((group) => {
                      const ledgerCount = accounts.filter((a) => a.account_group_id === group.id).length;
                      const groupBalance = accounts
                        .filter((a) => a.account_group_id === group.id)
                        .reduce((sum, a) => sum + a.current_balance, 0);
                      const isExpanded = expandedGroups.has(group.id);
                      const groupLedgers = accounts.filter((a) => a.account_group_id === group.id);
                      const subGroups = groups.filter((g) => g.parent_group_id === group.id);
                      const hasChildren = subGroups.length > 0 || groupLedgers.length > 0;

                      return (
                        <div key={group.id} className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden" style={{ marginLeft: `${group.level * 24}px` }}>
                          <div
                            onClick={() => handleGroupClick(group)}
                            className="p-4 hover:bg-gray-50 dark:hover:bg-slate-600 transition-all cursor-pointer"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2 flex-1">
                                {hasChildren ? (
                                  isExpanded ? (
                                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                  )
                                ) : (
                                  <div className="w-5" />
                                )}
                                <div className="flex-1">
                                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">{group.name}</h3>
                                  {group.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{group.description}</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-slate-600">
                              <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Ledgers</p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{ledgerCount}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-right">
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Debit</p>
                                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                    ₹{groupLedgers.reduce((sum, a) => sum + (a._debit || 0), 0).toLocaleString('en-IN')}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Credit</p>
                                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                                    ₹{groupLedgers.reduce((sum, a) => sum + (a._credit || 0), 0).toLocaleString('en-IN')}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 mt-3">
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

                          {isExpanded && (
                            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700">
                              <div className="space-y-3">
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddChildGroup(group);
                                    }}
                                    className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors text-xs font-medium"
                                  >
                                    <FolderPlus className="w-3.5 h-3.5" />
                                    Add Subgroup
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddLedgerToGroup(group);
                                    }}
                                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Ledger
                                  </button>
                                </div>

                                {subGroups.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                      Subgroups ({subGroups.length})
                                    </h4>
                                    <div className="space-y-1.5">
                                      {subGroups.map((subGroup) => renderNestedGroup(subGroup, 1))}
                                    </div>
                                  </div>
                                )}

                                {subGroups.length === 0 && groupLedgers.length === 0 && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                                    No subgroups or ledgers yet. Add one using the buttons above.
                                  </p>
                                )}

                                {groupLedgers.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                      Ledgers ({groupLedgers.length})
                                    </h4>
                                    <div className="space-y-1.5">
                                      {groupLedgers.map((ledger) => (
                                        <div
                                          key={ledger.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleAccountClick(ledger);
                                          }}
                                          className="bg-white dark:bg-slate-700 p-2.5 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-slate-600 transition-all cursor-pointer"
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                                              <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                                                {ledger.account_code}
                                              </span>
                                              <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                {ledger.account_name}
                                              </span>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                              ₹{ledger.current_balance.toLocaleString('en-IN')}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })
          )}
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
              <div className="flex items-center gap-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg p-1">
                <button
                  onClick={() => setLedgerViewMode('table')}
                  className={`p-2 rounded-lg transition-colors ${
                    ledgerViewMode === 'table'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                  }`}
                  title="Table View"
                >
                  <List className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setLedgerViewMode('cards')}
                  className={`p-2 rounded-lg transition-colors ${
                    ledgerViewMode === 'cards'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-600'
                  }`}
                  title="Card View"
                >
                  <Grid3x3 className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {ledgerViewMode === 'table' ? (
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
                    <th colSpan={2} className="px-6 py-4 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Closing
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Actions
                    </th>
                  </tr>
                  <tr>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Debit (₹)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                      Credit (₹)
                    </th>
                    <th></th>
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
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          ₹{(account._debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="font-bold text-red-600 dark:text-red-400">
                          ₹{(account._credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAccounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => handleAccountClick(account)}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 hover:shadow-lg transition-all cursor-pointer transform hover:scale-[1.02]"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {account.account_code}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">
                        {account.account_name}
                      </h3>
                      {account.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{account.description}</p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Group</span>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                          {account.account_groups.name}
                        </span>
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full mt-1 ${
                            accountTypeColors[
                              account.account_groups.account_type as keyof typeof accountTypeColors
                            ]
                          }`}
                        >
                          {account.account_groups.account_type.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400">Debit</p>
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                          ₹{(account._debit || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="py-2 px-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-xs text-red-600 dark:text-red-400">Credit</p>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                          ₹{(account._credit || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="py-2 px-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-xs text-green-600 dark:text-green-400">Balance</p>
                        <p className="text-sm font-bold text-green-700 dark:text-green-300">
                          ₹{account.current_balance.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(account);
                      }}
                      className="flex-1 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium flex items-center justify-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(account.id);
                      }}
                      className="flex-1 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors font-medium flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {filteredAccounts.length === 0 && (
                <div className="col-span-full text-center py-12">
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
          )}
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
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.account_code}
                      onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white bg-gray-50 dark:bg-slate-600"
                      placeholder="Auto-generated"
                      readOnly={!editingAccount}
                    />
                    {!editingAccount && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Code is auto-generated
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account Group *
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4 pointer-events-none z-10" />
                    <input
                      type="text"
                      value={groupSearchTerm}
                      onChange={(e) => setGroupSearchTerm(e.target.value)}
                      placeholder="Search groups..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white mb-2"
                    />
                    <div className="border border-gray-300 dark:border-slate-600 rounded-lg max-h-48 overflow-y-auto dark:bg-slate-700">
                      {groups
                        .filter((group) =>
                          groupSearchTerm === '' ||
                          group.name.toLowerCase().includes(groupSearchTerm.toLowerCase()) ||
                          group.account_type.toLowerCase().includes(groupSearchTerm.toLowerCase())
                        )
                        .map((group) => (
                        <div
                          key={group.id}
                          onClick={() => setFormData({ ...formData, account_group_id: group.id })}
                          className={`px-4 py-2.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors ${
                            formData.account_group_id === group.id ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{group.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{group.account_type}</p>
                        </div>
                      ))}
                      {groups.filter((group) =>
                        groupSearchTerm === '' ||
                        group.name.toLowerCase().includes(groupSearchTerm.toLowerCase()) ||
                        group.account_type.toLowerCase().includes(groupSearchTerm.toLowerCase())
                      ).length === 0 && (
                        <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                          No groups found
                        </div>
                      )}
                    </div>
                    {formData.account_group_id && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        ✓ Group selected: {groups.find(g => g.id === formData.account_group_id)?.name}
                      </p>
                    )}
                  </div>
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
                  <option value="">None (Top Level)</option>
                  {groups
                    .filter((group) => {
                      // Prevent selecting self or descendants as parent
                      if (editingGroup && group.id === editingGroup.id) return false;
                      // Check if group is a descendant of current editing group
                      if (editingGroup) {
                        let checkGroup = group;
                        while (checkGroup.parent_group_id) {
                          if (checkGroup.parent_group_id === editingGroup.id) return false;
                          checkGroup = groups.find(g => g.id === checkGroup.parent_group_id)!;
                          if (!checkGroup) break;
                        }
                      }
                      // Only show groups of the same type
                      return group.account_type === groupFormData.account_type;
                    })
                    .map((group) => {
                      // Calculate indentation level for visual hierarchy
                      let level = 0;
                      let checkGroup = group;
                      while (checkGroup.parent_group_id) {
                        level++;
                        checkGroup = groups.find(g => g.id === checkGroup.parent_group_id)!;
                        if (!checkGroup) break;
                      }
                      const indent = '\u00A0\u00A0'.repeat(level);
                      return (
                        <option key={group.id} value={group.id}>
                          {indent}{level > 0 ? '└─ ' : ''}{group.name}
                        </option>
                      );
                    })}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Select a parent group to create a subgroup under it
                </p>
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

      <ReportSettingsModal
        reportType="chart_of_accounts_ledgers"
        isOpen={showLedgerSettings}
        onClose={() => setShowLedgerSettings(false)}
      />

      <ReportSettingsModal
        reportType="chart_of_accounts_groups"
        isOpen={showGroupSettings}
        onClose={() => setShowGroupSettings(false)}
      />
    </div>
  );
}
