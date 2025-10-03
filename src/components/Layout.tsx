// src/components/Layout.tsx (Updated)
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TopNavBar from './TopNavBar';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Briefcase,
  ClipboardList,
  FileText,
  Bell,
  LogOut,
  Menu,
  X,
  BarChart3,
  UsersRound,
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
  { name: 'Invoices', icon: FileText, id: 'invoices' },
  { name: 'Reports', icon: BarChart3, id: 'reports' },
  { name: 'Reminders', icon: Bell, id: 'reminders' },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
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
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setSidebarOpen(false);
                  }}
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
      <TopNavBar />

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
