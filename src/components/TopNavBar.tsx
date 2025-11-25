// src/components/TopNavBar.tsx
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  Search,
  Bell,
  User,
  Moon,
  Sun,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface SearchResult {
  id: string;
  type: string;
  name: string;
  subtitle?: string;
}

interface TopNavBarProps {
  onNavigate?: (page: string) => void;
  sidebarCollapsed?: boolean;
}

export default function TopNavBar({ onNavigate, sidebarCollapsed }: TopNavBarProps = {}) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchNotifications();
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const performSearch = async (query: string) => {
    try {
      const searchTerm = `%${query}%`;
      
      const [customers, services, leads, works] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, email')
          .ilike('name', searchTerm)
          .limit(5),
        supabase
          .from('services')
          .select('id, name, description')
          .ilike('name', searchTerm)
          .limit(5),
        supabase
          .from('leads')
          .select('id, name, company_name')
          .ilike('name', searchTerm)
          .limit(5),
        supabase
          .from('works')
          .select('id, title, description')
          .ilike('title', searchTerm)
          .limit(5),
      ]);

      const results: SearchResult[] = [
        ...(customers.data || []).map(c => ({
          id: c.id,
          type: 'customer',
          name: c.name,
          subtitle: c.email,
        })),
        ...(services.data || []).map(s => ({
          id: s.id,
          type: 'service',
          name: s.name,
          subtitle: s.description,
        })),
        ...(leads.data || []).map(l => ({
          id: l.id,
          type: 'lead',
          name: l.name,
          subtitle: l.company_name,
        })),
        ...(works.data || []).map(w => ({
          id: w.id,
          type: 'work',
          name: w.title,
          subtitle: w.description,
        })),
      ];

      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (error) {
      console.error('Error searching:', error);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user!.id)
        .eq('is_read', false);

      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

    const handleSearchResultClick = (result: SearchResult) => {
  setShowSearchResults(false);
  setSearchQuery('');

  if (onNavigate) {
    const navigationState = {
      selectedId: result.id,
      itemType: result.type,
      shouldShowDetails: true,
    };
    
    // Store in sessionStorage for the page component to read
    sessionStorage.setItem('searchNavigationState', JSON.stringify(navigationState));

    switch (result.type) {
      case 'customer':
        onNavigate('customers');
        break;
      case 'service':
        onNavigate('services');
        break;
      case 'lead':
        onNavigate('leads');
        break;
      case 'work':
        onNavigate('works');
        break;
      default:
        break;
    }
  }
};


  return (
    <div className={`fixed top-0 left-0 right-0 h-14 sm:h-16 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 z-30 transition-all duration-300 ${sidebarCollapsed ? 'lg:left-20' : 'lg:left-64'} lg:z-40`}>
      <div className="h-full px-2 sm:px-4 flex items-center justify-between gap-2">
        {/* Search Bar */}
        <div className="flex-1 max-w-2xl lg:max-w-xl" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
              className="w-full pl-8 sm:pl-10 pr-2 sm:pr-4 py-1.5 sm:py-2 text-sm sm:text-base bg-slate-700 dark:bg-slate-800 text-white placeholder-slate-400 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            
            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 sm:w-full bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 max-h-60 sm:max-h-96 overflow-y-auto z-50">
                {searchResults.map((result) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                    onClick={() => handleSearchResultClick(result)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {result.name}
                        </p>
                        {result.subtitle && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full capitalize">
                        {result.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 flex-shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />
            ) : (
              <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative flex-shrink-0" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors relative flex-shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white text-[10px] sm:text-xs rounded-full flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 md:w-96 max-w-md bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 z-50">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-600 dark:text-slate-400">
                        No notifications yet
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => !notification.is_read && markNotificationAsRead(notification.id)}
                        className={`p-4 border-b border-slate-100 dark:border-slate-700 last:border-b-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                          !notification.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm text-slate-900 dark:text-white">
                              {notification.title}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                              {new Date(notification.created_at).toLocaleString()}
                            </p>
                          </div>
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1"></div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Menu */}
          <div className="relative flex-shrink-0" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors"
              aria-label="Profile menu"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="hidden md:block text-left min-w-0">
                <p className="text-sm font-medium text-white truncate max-w-[120px]">
                  {userProfile?.full_name || 'User'}
                </p>
                <p className="text-xs text-slate-400 truncate max-w-[120px]">{userProfile?.email}</p>
              </div>
              <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400 hidden md:block" />
            </button>

            {/* Profile Dropdown */}
            {showProfileMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 sm:w-64 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 z-50">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {userProfile?.full_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {userProfile?.email}
                  </p>
                </div>
                <div className="py-2">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      if (onNavigate) onNavigate('profile');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center space-x-2"
                  >
                    <User className="w-4 h-4" />
                    <span>My Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      if (onNavigate) onNavigate('settings');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center space-x-2"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 py-2">
                  <button
                    onClick={async () => {
                      setShowProfileMenu(false);
                      await signOut();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
