import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          company_name: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          company_name?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          company_name?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      services: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          is_recurring: boolean;
          recurrence_type: string | null;
          default_price: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      leads: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          company_name: string | null;
          status: string;
          source: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      customers: {
        Row: {
          id: string;
          user_id: string;
          lead_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          company_name: string | null;
          address: string | null;
          gst_number: string | null;
          pan_number: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      works: {
        Row: {
          id: string;
          user_id: string;
          customer_id: string;
          customer_service_id: string | null;
          service_id: string;
          title: string;
          description: string | null;
          status: string;
          priority: string;
          assigned_to: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          customer_id: string;
          work_id: string | null;
          invoice_number: string;
          invoice_date: string;
          due_date: string;
          subtotal: number;
          tax_amount: number;
          total_amount: number;
          status: string;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          work_id: string | null;
          title: string;
          message: string;
          reminder_date: string;
          is_read: boolean;
          created_at: string;
        };
      };
    };
  };
};
