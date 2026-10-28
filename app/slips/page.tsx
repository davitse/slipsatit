import Link from 'next/link';
import SlipsClient from '@/components/SlipsClient';
import { admin } from '@/lib/supabase';
import type { Slip } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SlipsPage({ searchParams }: { searchParams: Promise<{ slip?: string }> }) {
  const sp = await searchParams;
  const { data, error } = await admin()
    .from('slips')
    .select('*')
    .eq('extract_status', 'done')
    .order('slip_date', { ascending: false, nullsFirst: false })
    .order('slip_time', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);

  return (
    <main className="page">
      <div className="head-row">
        <div>
          <h1>ตารางสลิป</h1>
          <p className="sub">ตรวจข้อมูลที่ระบบอ่านจากสลิป เทียบกับภาพต้นฉบับ แก้ไขให้ถูกต้อง แล้วกดยืนยัน</p>
        </div>
        <Link href="/reconcile" className="btn ghost">ไปกระทบยอด Statement →</Link>
      </div>
      <SlipsClient slips={(data ?? []) as Slip[]} selectedId={sp.slip} />
    </main>
  );
}
