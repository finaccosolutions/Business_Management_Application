import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TopNavBar from './TopNavBar';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Briefcase,
  ClipboardList,
  Bell,
  LogOut,
  Menu,
  X,
  BarChart3,
  UsersRound,
  Calculator,
  ChevronDown,
  ChevronRight,
  Receipt,
  BookOpen,
  FileText,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
  { name: 'Leads', icon: Users, id: 'leads' },
  { name: 'Customers', icon: UserCog, id: 'customers' },
  { name: 'Staff', icon: UsersRound, id: 'staff' },
  { name: 'Services', icon: Briefcase, id: 'services' },
  { name: 'Works', icon: ClipboardList, id: 'works' },
  {
    name: 'Accounting',
    icon: Calculator,
    id: 'accounting',
    subItems: [
      { name: 'Vouchers', icon: Receipt, id: 'vouchers' },
      { name: 'Chart of Accounts', icon: BookOpen, id: 'chart-of-accounts' },
      { name: 'Masters', icon: FileText, id: 'accounting-masters' },
    ],
  },
  { name: 'Reports', icon: BarChart3, id: 'reports' },
  { name: 'Reminders', icon: Bell, id: 'reminders' },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountingExpanded, setAccountingExpanded] = useState(
    ['accounting', 'vouchers', 'chart-of-accounts', 'accounting-masters', 'invoices', 'ledger'].includes(currentPage)
  );

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleNavClick = (id: string) => {
    if (id === 'accounting') {
      setAccountingExpanded(!accountingExpanded);
    } else {
      onNavigate(id);
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 z-30 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">WorkFlow Pro</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
        >
          {sidebarOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <Menu className="w-6 h-6 text-white" />
          )}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-64 bg-slate-800 dark:bg-slate-900 border-r border-slate-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-700">
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
              WorkFlow Pro
            </h1>
            <p className="text-sm text-slate-400 mt-1">Business Management</p>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              const isAccountingSubpage = ['vouchers', 'chart-of-accounts', 'accounting-masters', 'invoices', 'ledger'].includes(currentPage);
              const isAccountingActive = item.id === 'accounting' && (isActive || isAccountingSubpage);

              if (item.subItems) {
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                        isAccountingActive
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                          : 'text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className={`w-5 h-5 ${isAccountingActive ? '' : 'text-slate-400'}`} />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      {accountingExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {accountingExpanded && (
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-700 pl-2">
                        {item.subItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive = currentPage === subItem.id;
                          return (
                            <button
                              key={subItem.id}
                              onClick={() => {
                                onNavigate(subItem.id);
                                setSidebarOpen(false);
                              }}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                                isSubActive
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-slate-300 hover:bg-slate-700 hover:translate-x-1'
                              }`}
                            >
                              <SubIcon className={`w-4 h-4 ${isSubActive ? '' : 'text-slate-400'}`} />
                              <span className="text-sm font-medium">{subItem.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md transform scale-[1.02]'
                      : 'text-slate-300 hover:bg-slate-700 hover:translate-x-1'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? '' : 'text-slate-400'}`} />
                  <span className="font-medium">{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-700">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-900/20 transition-all duration-200 hover:translate-x-1"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Top Navigation Bar */}
      <TopNavBar onNavigate={onNavigate} />

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
