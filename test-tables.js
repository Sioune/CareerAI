import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tables = [
  'users',
  'resume_versions',
  'rewrite_suggestions',
  'clarification_questions',
  'user_feedbacks',
  'event_logs'
];

for (const table of tables) {
  try {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table "${table}": error`, error.code, error.message);
    } else {
      console.log(`Table "${table}": success, data length:`, data.length);
    }
  } catch (err) {
    console.log(`Table "${table}": catch error`, err);
  }
}
