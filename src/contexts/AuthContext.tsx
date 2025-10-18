import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getPhoneCode } from '../config/countryConfig';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userCountry: string | null;
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserCountry(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserCountry(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserCountry = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('country')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setUserCountry(data?.country || 'IN');
    } catch (error) {
      console.error('Error fetching user country:', error);
      setUserCountry('IN'); // Default to India
    }
  };

  const signUp = async (email: string, password: string, fullName: string, country: string, mobileNumber?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          country: country,
          mobile_number: mobileNumber,
        },
      },
    });

    if (error) throw error;

    // Check if email confirmation is required
    if (data.user && !data.session) {
      throw new Error('Please check your email to confirm your account');
    }

    // Create profile with country and mobile number
    if (data.user) {
      const phoneCode = getPhoneCode(country);
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: email,
        full_name: fullName,
        country: country,
        phone_country_code: phoneCode,
        mobile_number: mobileNumber || '',
      });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUserCountry(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userCountry, signUp, signIn, signOut }}>
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