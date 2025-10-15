import { useState } from 'react';
import { ChevronRight, ChevronDown, FolderOpen, Folder, BookOpen } from 'lucide-react';

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

interface AccountTreeViewProps {
  groups: AccountGroup[];
  accounts: Account[];
  onGroupClick: (group: AccountGroup) => void;
  onAccountClick: (account: Account) => void;
}

const accountTypeColors = {
  asset: 'text-blue-600 dark:text-blue-400',
  liability: 'text-red-600 dark:text-red-400',
  income: 'text-green-600 dark:text-green-400',
  expense: 'text-orange-600 dark:text-orange-400',
  equity: 'text-slate-600 dark:text-slate-400',
};

export default function AccountTreeView({ groups, accounts, onGroupClick, onAccountClick }: AccountTreeViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['asset', 'liability', 'income', 'expense', 'equity']));

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleType = (type: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  const getSubGroups = (parentId: string | null) => {
    return groups.filter(g => g.parent_group_id === parentId);
  };

  const getGroupAccounts = (groupId: string) => {
    return accounts.filter(a => a.account_group_id === groupId);
  };

  const calculateGroupBalance = (groupId: string): number => {
    const directAccounts = getGroupAccounts(groupId);
    const directBalance = directAccounts.reduce((sum, acc) => sum + acc.current_balance, 0);

    const subGroups = getSubGroups(groupId);
    const subGroupBalance = subGroups.reduce((sum, subGroup) => sum + calculateGroupBalance(subGroup.id), 0);

    return directBalance + subGroupBalance;
  };

  const renderGroup = (group: AccountGroup, level: number = 0) => {
    const isExpanded = expandedGroups.has(group.id);
    const subGroups = getSubGroups(group.id);
    const groupAccounts = getGroupAccounts(group.id);
    const hasChildren = subGroups.length > 0 || groupAccounts.length > 0;
    const balance = calculateGroupBalance(group.id);
    const colorClass = accountTypeColors[group.account_type as keyof typeof accountTypeColors];

    return (
      <div key={group.id}>
        <div
          className={`flex items-center justify-between py-2 px-3 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors ${
            level > 0 ? 'ml-' + (level * 6) : ''
          }`}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleGroup(group.id);
            }
            onGroupClick(group);
          }}
        >
          <div className="flex items-center gap-2 flex-1">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )
            ) : (
              <div className="w-4" />
            )}
            {isExpanded ? (
              <FolderOpen className={`w-5 h-5 ${colorClass}`} />
            ) : (
              <Folder className={`w-5 h-5 ${colorClass}`} />
            )}
            <span className="font-medium text-gray-900 dark:text-white">{group.name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({groupAccounts.length} {groupAccounts.length === 1 ? 'ledger' : 'ledgers'})
            </span>
          </div>
          <span className={`font-semibold ${colorClass}`}>
            ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {isExpanded && (
          <div>
            {subGroups.map(subGroup => renderGroup(subGroup, level + 1))}
            {groupAccounts.map(account => (
              <div
                key={account.id}
                className="flex items-center justify-between py-2 px-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer transition-colors"
                style={{ paddingLeft: `${(level + 1) * 24 + 12}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onAccountClick(account);
                }}
              >
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-4" />
                  <BookOpen className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                    {account.account_code}
                  </span>
                  <span className="text-sm text-gray-900 dark:text-white">{account.account_name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  ₹{account.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const accountTypes = [
    { type: 'asset', label: 'Assets', color: 'text-blue-600 dark:text-blue-400' },
    { type: 'liability', label: 'Liabilities', color: 'text-red-600 dark:text-red-400' },
    { type: 'income', label: 'Income', color: 'text-green-600 dark:text-green-400' },
    { type: 'expense', label: 'Expenses', color: 'text-orange-600 dark:text-orange-400' },
    { type: 'equity', label: 'Equity', color: 'text-slate-600 dark:text-slate-400' },
  ];

  return (
    <div className="space-y-2">
      {accountTypes.map(({ type, label, color }) => {
        const typeGroups = groups.filter(g => g.account_type === type && g.parent_group_id === null);
        if (typeGroups.length === 0) return null;

        const isExpanded = expandedTypes.has(type);
        const typeAccounts = accounts.filter(a => a.account_groups.account_type === type);
        const typeBalance = typeAccounts.reduce((sum, acc) => sum + acc.current_balance, 0);

        return (
          <div key={type} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
              onClick={() => toggleType(type)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
                <h3 className={`text-lg font-bold uppercase ${color}`}>{label}</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({typeGroups.length} {typeGroups.length === 1 ? 'group' : 'groups'})
                </span>
              </div>
              <span className={`text-xl font-bold ${color}`}>
                ₹{typeBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {isExpanded && (
              <div className="p-4">
                {typeGroups.map(group => renderGroup(group, 0))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
