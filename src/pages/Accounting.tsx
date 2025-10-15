import { Receipt, BookOpen, FileText } from 'lucide-react';

interface AccountingProps {
  onNavigate: (page: string) => void;
}

export default function Accounting({ onNavigate }: AccountingProps) {
  const modules = [
    {
      id: 'vouchers',
      title: 'Vouchers',
      description: 'Manage all accounting vouchers including invoices, payments, receipts, and journal entries',
      icon: Receipt,
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: 'chart-of-accounts',
      title: 'Chart of Accounts',
      description: 'Manage account ledgers, groups, and view complete account structure hierarchy',
      icon: BookOpen,
      color: 'from-green-500 to-green-600',
    },
    {
      id: 'accounting-masters',
      title: 'Masters',
      description: 'Configure payment terms, tax rates, and bank account master data',
      icon: FileText,
      color: 'from-orange-500 to-orange-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Accounting Module</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Comprehensive accounting management system
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              onClick={() => onNavigate(module.id)}
              className="group bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden border border-gray-200 dark:border-slate-700 text-left"
            >
              <div className={`bg-gradient-to-r ${module.color} p-6 text-white`}>
                <div className="p-4 bg-white/20 rounded-xl inline-flex mb-4">
                  <Icon className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold">{module.title}</h2>
              </div>

              <div className="p-6">
                <p className="text-gray-600 dark:text-gray-400">{module.description}</p>
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-medium group-hover:translate-x-2 transition-transform">
                    Open Module →
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-700 border border-amber-200 dark:border-slate-600 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex-shrink-0">
            <FileText className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Integrated Accounting System
            </h3>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              This accounting module provides a complete double-entry bookkeeping system.
              Vouchers are automatically posted to ledgers, maintaining accurate account balances.
              The Chart of Accounts organizes all financial data with proper grouping and categorization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
