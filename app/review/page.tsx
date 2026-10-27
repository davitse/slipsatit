import Link from 'next/link';
import ReviewClient from '@/components/ReviewClient';
import { admin } from '@/lib/supabase';
import type { Slip } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
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
          <h1>ตรวจรายการจากสลิป</h1>
          <p className="sub">เลือกแถวในตารางเพื่อดูฟิลด์ที่ระบบอ่านได้ แก้ไขให้ตรงกับสลิป แล้วกดยืนยัน</p>
        </div>
        <Link href="/dashboard" className="btn ghost">ไปที่แดชบอร์ด →</Link>
      </div>
      <ReviewClient slips={(data ?? []) as Slip[]} />
    </main>
  );
}
