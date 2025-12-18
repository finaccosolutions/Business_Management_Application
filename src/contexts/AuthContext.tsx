import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userCountry: string | null;
  role: string | null;
  permissions: any;
  signUp: (email: string, password: string, fullName: string, country: string, mobileNumber?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserDetails(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserDetails(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setRole(null);
          setPermissions(null);
          setUserCountry(null);
          setLoading(false);
        }
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(session);
      }
    });

    const staffSubscription = supabase
      .channel('staff_permissions_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'staff_members',
        },
        async (payload) => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && payload.new.auth_user_id === session.user.id) {
            console.log('Permissions updated, refreshing...');
            fetchUserDetails(session.user.id);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      staffSubscription.unsubscribe();
    };
  }, []);

  const fetchUserDetails = async (userId: string) => {
    try {
      // Fetch Profile for Role and Country
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('country, role')
        .eq('id', userId)
        .single();

      setUserCountry(profile?.country || 'IN'); // Default but don't error out
      const userRole = profile?.role || 'staff';
      setRole(userRole);

      // Set Permissions
      if (userRole === 'admin') {
        setPermissions({
          works: { create: true, delete: true, edit: true, view_revenue: true, view_all: true },
          customers: { create: true, delete: true, edit: true, view_contact: true, export: true },
          leads: { create: true, delete: true, edit: true, convert: true },
          services: { create: true, delete: true, edit: true, view_pricing: true },
          accounting: { view_dashboard: true, create_voucher: true, edit_voucher: true, delete_voucher: true, view_ledger: true, view_reports: true },
          reports: { view_revenue: true, view_staff_performance: true, export: true },
          invoices: { create: true, edit: true, delete: true, view_all: true }
        });
      } else {
        const { data: staffData } = await supabase
          .from('staff_members')
          .select('detailed_permissions')
          .eq('auth_user_id', userId)
          .single();

        setPermissions(staffData?.detailed_permissions || {});
      }

    } catch (error) {
      console.error('Error fetching user details:', error);
      setUserCountry('IN');
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, country: string, mobileNumber?: string) => {
    const cleanEmail = email.toLowerCase().trim();
    console.log('Signing up:', cleanEmail);
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName,
          country: country,
          mobile_number: mobileNumber || '',
        },
      },
    });

    if (error) throw error;
    if (data.user && !data.session) {
      throw new Error('Please check your email to confirm your account');
    }
  };

  const signIn = async (email: string, password: string) => {
    const cleanEmail = email.toLowerCase().trim();
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
      options: {
        // Force refresh session to ensure role is updated? No, standard sign in.
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: any) {
      // Ignore "Auth session missing" errors as it means we are effectively signed out
      if (error.message === 'Auth session missing!') {
        console.warn('Auth session missing during sign out, forcing local cleanup.');
      } else {
        console.error('Error signing out:', error);
      }
    } finally {
      // Always cleanup local state
      setSession(null);
      setUser(null);
      setUserCountry(null);
      setRole(null);
      setPermissions(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userCountry, role, permissions, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}