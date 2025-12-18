import { useState, useEffect } from 'react';
import {
  FileText,
  BookOpen,
  Receipt
} from 'lucide-react';
import Invoices from './Invoices';
import Vouchers from './Vouchers';
import ChartOfAccounts from './ChartOfAccounts';

interface AccountingProps {
  onNavigate: (page: string, params?: any) => void;
  initialTab?: string;
}

export default function Accounting({ onNavigate, initialTab = 'invoices' }: AccountingProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const tabs = [
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'vouchers', label: 'Vouchers', icon: Receipt },
    { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen },
    // Future tabs:
    // { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/50">
      {/* Module Header & Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-0">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Accounting</h1>

          <div className="flex space-x-8 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm whitespace-nowrap transition-all duration-200 ease-in-out
                    ${isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className={`
                    -ml-0.5 mr-2 h-5 w-5 transition-colors duration-200
                    ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}
                  `} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        {activeTab === 'invoices' && (
          <div className="animate-fade-in">
            <Invoices onNavigate={onNavigate} />
          </div>
        )}

        {activeTab === 'vouchers' && (
          <div className="animate-fade-in">
            <Vouchers onNavigate={onNavigate} />
          </div>
        )}

        {activeTab === 'chart-of-accounts' && (
          <div className="animate-fade-in">
            <ChartOfAccounts onNavigate={onNavigate} />
          </div>
        )}
      </div>
    </div>
  );
}
