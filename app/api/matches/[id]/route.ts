import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ISSUE = ['diff', 'no_slip', 'no_stmt'];

// admin ยืนยัน / ส่งตรวจต่อ / ยกเลิก พร้อมบันทึกเหตุผล
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { admin_status?: string; admin_note?: string };
    const status = body.admin_status;
    if (status !== 'pending' && status !== 'approved' && status !== 'flagged') {
      return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }
    const db = admin();
    const { data: m } = await db.from('matches').select('*').eq('id', id).single();
    if (!m) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 });
    if (m.admin_status === 'na') return NextResponse.json({ error: 'รายการนี้ไม่ต้องให้ admin ตรวจ' }, { status: 409 });
    const { data: st } = await db.from('statements').select('finalized_at').eq('id', m.statement_id).single();
    if (st?.finalized_at) return NextResponse.json({ error: 'ยืนยันผลขั้นสุดท้ายแล้ว แก้ไขไม่ได้' }, { status: 409 });

    const note = (body.admin_note ?? m.admin_note ?? '').trim();
    if (status === 'approved' && ISSUE.includes(m.kind) && !note) {
      return NextResponse.json({ error: 'ต้องบันทึกเหตุผลก่อนยืนยันรายการที่ไม่ตรงกัน' }, { status: 400 });
    }
    const { data, error } = await db
      .from('matches')
      .update({ admin_status: status, admin_note: note || null, decided_at: status === 'pending' ? null : new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ match: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ผิดพลาด' }, { status: 500 });
  }
}
