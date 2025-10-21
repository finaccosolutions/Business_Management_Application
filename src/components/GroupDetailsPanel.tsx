import { Plus, FolderPlus, BookOpen, X, ArrowLeft } from 'lucide-react';

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

interface GroupDetailsPanelProps {
  group: AccountGroup;
  accounts: Account[];
  subGroups: AccountGroup[];
  onClose: () => void;
  onAddChildGroup: (parentGroup: AccountGroup) => void;
  onAddLedger: (group: AccountGroup) => void;
  onAccountClick: (account: Account) => void;
  onSubGroupClick: (group: AccountGroup) => void;
}

const accountTypeColors = {
  asset: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  liability: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  income: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expense: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  equity: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
};

export default function GroupDetailsPanel({
  group,
  accounts,
  subGroups,
  onClose,
  onAddChildGroup,
  onAddLedger,
  onAccountClick,
  onSubGroupClick,
}: GroupDetailsPanelProps) {
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.current_balance, 0);
  const colorClass = accountTypeColors[group.account_type as keyof typeof accountTypeColors];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-600 to-cyan-600">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white">{group.name}</h2>
              <p className="text-blue-100 text-sm mt-1">{group.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Account Type</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-300 capitalize mt-1">
                {group.account_type}
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Total Ledgers</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-300 mt-1">
                {accounts.length}
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
              <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Total Balance</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-300 mt-1">
                ₹{totalBalance.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <button
              onClick={() => onAddChildGroup(group)}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
            >
              <FolderPlus className="w-5 h-5" />
              <span>Add Child Group</span>
            </button>
            <button
              onClick={() => onAddLedger(group)}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-md"
            >
              <Plus className="w-5 h-5" />
              <span>Add Ledger</span>
            </button>
          </div>

          {subGroups.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FolderPlus className="w-5 h-5" />
                Child Groups ({subGroups.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {subGroups.map((subGroup) => {
                  const subGroupAccounts = accounts.filter(a => a.account_group_id === subGroup.id);
                  const subGroupBalance = subGroupAccounts.reduce((sum, acc) => sum + acc.current_balance, 0);

                  return (
                    <div
                      key={subGroup.id}
                      onClick={() => onSubGroupClick(subGroup)}
                      className="bg-gray-50 dark:bg-slate-700 p-4 rounded-lg border border-gray-200 dark:border-slate-600 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">{subGroup.name}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {subGroup.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {subGroupAccounts.length} ledgers
                        </span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                          ₹{subGroupBalance.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Ledgers in this Group ({accounts.length})
            </h3>
            {accounts.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No ledgers yet</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Add your first ledger to this group
                </p>
                <button
                  onClick={() => onAddLedger(group)}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add Ledger
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    onClick={() => onAccountClick(account)}
                    className="bg-white dark:bg-slate-700 p-4 rounded-lg border border-gray-200 dark:border-slate-600 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {account.account_code}
                          </span>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {account.account_name}
                          </h4>
                        </div>
                        {account.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {account.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Balance</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          ₹{account.current_balance.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
