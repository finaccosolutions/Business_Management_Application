import { useState } from 'react';
import { BookOpen, Receipt, FileText, ArrowRight } from 'lucide-react';

interface AccountingProps {
  onNavigate: (page: string) => void;
}

export default function Accounting({ onNavigate }: AccountingProps) {
  const modules = [
    {
      id: 'vouchers',
      title: 'Vouchers',
      description: 'Manage all accounting vouchers including invoices and journal entries',
      icon: Receipt,
      color: 'from-blue-500 to-blue-600',
      submodules: [
        { name: 'Invoices', description: 'Sales invoices and billing' },
        { name: 'Journal Entries', description: 'Payment, receipt, and other vouchers' },
      ],
    },
    {
      id: 'chart-of-accounts',
      title: 'Chart of Accounts',
      description: 'Manage account groups, ledgers, and master data',
      icon: BookOpen,
      color: 'from-green-500 to-green-600',
      submodules: [
        { name: 'Account Ledgers', description: 'All accounting heads and balances' },
        { name: 'Account Groups', description: 'Organize accounts by type' },
        { name: 'Masters', description: 'Tax rates, payment terms, banks' },
      ],
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              onClick={() => onNavigate(module.id)}
              className="group bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] overflow-hidden border border-gray-200 dark:border-slate-700 text-left"
            >
              <div className={`bg-gradient-to-r ${module.color} p-6`}>
                <div className="flex items-center justify-between">
                  <div className="p-4 bg-white/20 rounded-xl">
                    <Icon className="w-10 h-10 text-white" />
                  </div>
                  <ArrowRight className="w-6 h-6 text-white/80 group-hover:translate-x-2 transition-transform" />
                </div>
                <h2 className="text-2xl font-bold text-white mt-4">{module.title}</h2>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-gray-600 dark:text-gray-400">{module.description}</p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Features
                  </p>
                  {module.submodules.map((sub, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                    >
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5 flex-shrink-0"></div>
                      <div>
                        <span className="font-medium">{sub.name}</span>
                        <span className="text-gray-500 dark:text-gray-400"> - {sub.description}</span>
                      </div>
                    </div>
                  ))}
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
