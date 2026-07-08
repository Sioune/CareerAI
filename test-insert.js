import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testInsert() {
  console.log("Testing insert into event_logs...");
  const logRow = {
    user_id: 1,
    event_type: "test_event",
    meta_data: JSON.stringify({ source: "script" })
  };
  const { data, error } = await supabase.from('event_logs').insert(logRow).select();
  if (error) {
    console.error("event_logs insert error:", error);
  } else {
    console.log("event_logs insert success:", data);
  }
}

await testInsert();
