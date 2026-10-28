import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// admin ยืนยันผลขั้นสุดท้าย ทำได้เมื่อตรวจครบทุกรายการ
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = admin();
    const { data: st } = await db.from('statements').select('id, matched_at, finalized_at').eq('id', id).single();
    if (!st) return NextResponse.json({ error: 'ไม่พบ Statement' }, { status: 404 });
    if (!st.matched_at) return NextResponse.json({ error: 'ยังไม่ได้จับคู่' }, { status: 409 });
    if (st.finalized_at) return NextResponse.json({ ok: true, finalized_at: st.finalized_at });

    const { count, error: cErr } = await db.from('matches').select('id', { count: 'exact', head: true }).eq('statement_id', id).eq('admin_status', 'pending');
    if (cErr) throw cErr;
    if ((count ?? 0) > 0) return NextResponse.json({ error: `ยังเหลือ ${count} รายการที่ admin ยังไม่ได้ตรวจ` }, { status: 409 });

    const finalized_at = new Date().toISOString();
    const { error } = await db.from('statements').update({ finalized_at }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true, finalized_at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ผิดพลาด' }, { status: 500 });
  }
}
