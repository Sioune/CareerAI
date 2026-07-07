import { createClient } from '@supabase/supabase-js';

// Dynamically check both process.env (Node) and import.meta.env (Vite)
const supabaseUrl = 
  (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_URL : null) || 
  (import.meta as any).env?.VITE_SUPABASE_URL || 
  'https://placeholder-project.supabase.co';

const supabaseAnonKey = 
  (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_ANON_KEY : null) || 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
  'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
