import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'slips';

/** Server-side client (service role). ใช้ใน route handler / server component เท่านั้น */
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}
