import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pvnbkejjhrwilehsvvkr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2bmJrZWpqaHJ3aWxlaHN2dmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwMTE1OTMsImV4cCI6MjA2NDU4NzU5M30.P_mz5TBcZtfnQ6AMeGGT-pBs3l-DSOOc20-pzbpUpY4';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Database {
  public: {
    Tables: {
      pq_records: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          date: string | null;
          shipper_name: string;
          buyer: string;
          invoice_number: string;
          commodity: string;
          shipping_bill_received: boolean | null;
          pq_status: string | null;
          pq_hardcopy: string | null;
          permit_copy_status: string | null;
          destination_port: string | null;
          remarks: string | null;
          files: any | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          date?: string | null;
          shipper_name: string;
          buyer: string;
          invoice_number: string;
          commodity: string;
          shipping_bill_received?: boolean | null;
          pq_status?: string | null;
          pq_hardcopy?: string | null;
          permit_copy_status?: string | null;
          destination_port?: string | null;
          remarks?: string | null;
          files?: any | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          date?: string | null;
          shipper_name?: string;
          buyer?: string;
          invoice_number?: string;
          commodity?: string;
          shipping_bill_received?: boolean | null;
          pq_status?: string | null;
          pq_hardcopy?: string | null;
          permit_copy_status?: string | null;
          destination_port?: string | null;
          remarks?: string | null;
          files?: any | null;
        };
      };
    };
  };
}
