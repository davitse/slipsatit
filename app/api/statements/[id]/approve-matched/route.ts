import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ยืนยันรายการที่จับคู่ได้ทั้งหมดในครั้งเดียว
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = admin();
    const { data: st } = await db.from('statements').select('finalized_at').eq('id', id).single();
    if (!st) return NextResponse.json({ error: 'ไม่พบ Statement' }, { status: 404 });
    if (st.finalized_at) return NextResponse.json({ error: 'ยืนยันผลขั้นสุดท้ายแล้ว' }, { status: 409 });
    const { data, error } = await db
      .from('matches')
      .update({ admin_status: 'approved', decided_at: new Date().toISOString() })
      .eq('statement_id', id).eq('kind', 'matched').eq('admin_status', 'pending')
      .select('id');
    if (error) throw error;
    return NextResponse.json({ updated: (data ?? []).map((r) => r.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ผิดพลาด' }, { status: 500 });
  }
}
