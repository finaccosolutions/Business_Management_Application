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
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
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
    ],
  },
  { name: 'Reports', icon: BarChart3, id: 'reports' },
  { name: 'Reminders', icon: Bell, id: 'reminders' },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountingExpanded, setAccountingExpanded] = useState(
    ['accounting', 'vouchers', 'chart-of-accounts'].includes(currentPage)
  );
  const [showAccountingDropdown, setShowAccountingDropdown] = useState(false);

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
      {/* Mobile Header - Only menu button and logo */}
      <div className="lg:hidden fixed top-0 left-0 z-50 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0 bg-slate-800"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? (
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          ) : (
            <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          )}
        </button>
        <h1 className="text-base sm:text-xl font-bold text-white ml-3">WorkFlow Pro</h1>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 lg:top-0 bottom-0 left-0 z-40 bg-slate-800 dark:bg-slate-900 border-r border-slate-700 transform transition-all duration-300 ease-in-out lg:translate-x-0 pt-14 lg:pt-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'lg:w-20' : 'w-64 sm:w-72 lg:w-64'}`}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 sm:p-6 border-b border-slate-700 hidden lg:flex lg:items-center lg:justify-between">
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
                  WorkFlow Pro
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">Business Management</p>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronsRight className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronsLeft className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>

          <nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto overflow-x-hidden">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              const isAccountingSubpage = ['vouchers', 'chart-of-accounts'].includes(currentPage);
              const isAccountingActive = item.id === 'accounting' && (isActive || isAccountingSubpage);

 if (item.subItems) {
  return (
    <div key={item.id} className="relative w-full">
      <button
        onClick={() => {
          handleNavClick(item.id);
        }}
        onMouseEnter={() => !sidebarOpen && sidebarCollapsed && setShowAccountingDropdown(true)}
        onMouseLeave={() => !sidebarOpen && sidebarCollapsed && setShowAccountingDropdown(false)}
        className={`w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 ${
          isAccountingActive
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
            : 'text-slate-300 hover:bg-slate-700'
        }`}
        title={sidebarCollapsed ? item.name : ''}
      >
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${isAccountingActive ? '' : 'text-slate-400'}`} />
          {!sidebarCollapsed && (
            <>
              <span className="font-medium text-sm sm:text-base truncate">{item.name}</span>
              <div className="ml-auto">
                {accountingExpanded ? (
                  <ChevronDown className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                )}
              </div>
            </>
          )}
        </div>
      </button>

      {/* Expanded list for non-collapsed sidebar (desktop) */}
      {accountingExpanded && !sidebarCollapsed && (
        <div className="ml-3 sm:ml-4 mt-1 space-y-1 border-l-2 border-slate-700 pl-2">
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
                className={`w-full flex items-center space-x-2 sm:space-x-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-all duration-200 min-w-0 ${
                  isSubActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-700 hover:translate-x-1'
                }`}
                title={subItem.name}
              >
                <SubIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isSubActive ? '' : 'text-slate-400'}`} />
                <span className="text-xs sm:text-sm font-medium truncate">{subItem.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Hover dropdown for collapsed desktop sidebar */}
      {sidebarCollapsed && !sidebarOpen && showAccountingDropdown && (
        <div className="absolute left-full top-0 ml-2 w-48 bg-slate-800 dark:bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 py-1">
          {item.subItems.map((subItem) => {
            const SubIcon = subItem.icon;
            const isSubActive = currentPage === subItem.id;
            return (
              <button
                key={subItem.id}
                onClick={() => {
                  onNavigate(subItem.id);
                  setSidebarOpen(false);
                  setShowAccountingDropdown(false);
                }}
                onMouseEnter={() => setShowAccountingDropdown(true)}
                onMouseLeave={() => setShowAccountingDropdown(false)}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 text-left transition-all duration-200 ${
                  isSubActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <SubIcon className={`w-4 h-4 flex-shrink-0 ${isSubActive ? '' : 'text-slate-400'}`} />
                <span className="text-sm font-medium">{subItem.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded list below icon for collapsed mobile/small sidebar (click to expand) */}
      {sidebarCollapsed && sidebarOpen && accountingExpanded && (
        <div className="w-full mt-1 space-y-1 pl-3">
          {item.subItems.map((subItem) => {
            const SubIcon = subItem.icon;
            const isSubActive = currentPage === subItem.id;
            return (
              <button
                key={subItem.id}
                onClick={() => {
                  onNavigate(subItem.id);
                  setSidebarOpen(false);
                  setAccountingExpanded(false);
                }}
                className={`w-full flex items-center space-x-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-all duration-200 ${
                  isSubActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
                title={subItem.name}
              >
                <SubIcon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${isSubActive ? '' : 'text-slate-400'}`} />
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
                  className={`w-full flex items-center space-x-2 sm:space-x-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 min-w-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md transform scale-[1.02]'
                      : 'text-slate-300 hover:bg-slate-700 hover:translate-x-1'
                  }`}
                  title={sidebarCollapsed ? item.name : ''}
                >
                  <Icon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${isActive ? '' : 'text-slate-400'}`} />
                  {!sidebarCollapsed && (
                    <span className="font-medium text-sm sm:text-base truncate">{item.name}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-3 sm:p-4 border-t border-slate-700">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-2 sm:space-x-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-red-400 hover:bg-red-900/20 transition-all duration-200 hover:translate-x-1 min-w-0"
              title={sidebarCollapsed ? 'Sign Out' : ''}
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-medium text-sm sm:text-base truncate">Sign Out</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Top Navigation Bar */}
      <TopNavBar onNavigate={onNavigate} sidebarCollapsed={sidebarCollapsed} />

      {/* Main Content */}
      <main className={`pt-14 sm:pt-16 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="p-4 sm:p-6 md:p-8 lg:pl-12 lg:pr-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
