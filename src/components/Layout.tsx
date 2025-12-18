import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import TopNavBar from './TopNavBar';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Briefcase,
  ClipboardList,
  Bell,
  LogOut,
  BarChart3,
  UsersRound,
  Calculator,
  ChevronsLeft,
  ChevronsRight,
  Shield,
  Calendar as CalendarIcon,
} from 'lucide-react';


interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const allNavigation = [
  { name: 'Dashboard', icon: LayoutDashboard, id: 'dashboard', roles: ['admin'] },
  { name: 'My Dashboard', icon: LayoutDashboard, id: 'staff-dashboard', roles: ['staff'] },
  { name: 'Leads', icon: Users, id: 'leads', roles: ['admin', 'staff'] },
  { name: 'Customers', icon: UserCog, id: 'customers', roles: ['admin', 'staff'] },
  { name: 'Staff Management', icon: UsersRound, id: 'staff', roles: ['admin'] },
  { name: 'Services', icon: Briefcase, id: 'services', roles: ['admin', 'staff'] },
  { name: 'Works Management', icon: ClipboardList, id: 'works', roles: ['admin', 'staff'] },
  { name: 'Accounting', icon: Calculator, id: 'accounting', roles: ['admin', 'staff'] },
  { name: 'Reports', icon: BarChart3, id: 'reports', roles: ['admin'] },
  { name: 'Reminders', icon: Bell, id: 'reminders', roles: ['admin', 'staff'] },
  { name: 'Admin Panel', icon: Shield, id: 'admin', roles: ['admin'] },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { signOut, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchPermissions() {
      if (!user) return;
      try {
        // 1. Get Profile for Role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!mounted) return;

        const role = profile?.role || 'admin';
        setUserRole(role);

        // 2. If Staff, get allowed modules
        if (role === 'staff') {
          const { data: staff } = await supabase
            .from('staff_members')
            .select('allowed_modules')
            .eq('auth_user_id', user.id)
            .single();

          if (mounted) {
            const defaults = ['staff-dashboard', 'works', 'customers', 'leads', 'services', 'calendar'];
            setAllowedModules(staff?.allowed_modules || defaults);
          }
        } else {
          // Admin
          setAllowedModules([]); // Not used
        }
      } catch (err) {
        console.error("Error fetching permissions", err);
      } finally {
        if (mounted) setLoadingPermissions(false);
      }
    }

    fetchPermissions();

    return () => { mounted = false; };
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleNavClick = (id: string) => {
    onNavigate(id);
    setSidebarOpen(false);
  };

  const getFilteredNavigation = () => {
    if (loadingPermissions) return [];

    return allNavigation.filter(item => {
      // 1. Check Role Match
      if (!item.roles.includes(userRole || 'admin')) return false;

      // 2. If Admin, show everything that matches 'admin' role.
      if (userRole === 'admin') return true;

      // 3. If Staff
      if (item.id === 'staff-dashboard') return true;

      // Check allowed list
      return allowedModules.includes(item.id);
    });
  };

  const visibleNavigation = getFilteredNavigation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">

      {/* Sidebar */}
      <aside
        className={`fixed top-0 lg:top-0 bottom-0 left-0 z-40 bg-slate-800 dark:bg-slate-900 border-r border-slate-700 transform transition-all duration-300 ease-in-out lg:translate-x-0 pt-16 lg:pt-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const isAccountingChild = ['vouchers', 'chart-of-accounts', 'accounting-masters'].includes(currentPage);
              const isActive = currentPage === item.id || (item.id === 'accounting' && isAccountingChild);

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center space-x-2 sm:space-x-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 min-w-0 ${isActive
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
      <TopNavBar
        onNavigate={onNavigate}
        sidebarCollapsed={sidebarCollapsed}
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Content */}
      <main className={`pt-16 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div>{children}</div>
      </main>
    </div>
  );
}
