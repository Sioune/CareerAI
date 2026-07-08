import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

try {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error("Error querying users:", error);
  } else {
    console.log("Users in Supabase:", JSON.stringify(data, null, 2));
  }
} catch (err) {
  console.error("Catch error querying users:", err);
}
