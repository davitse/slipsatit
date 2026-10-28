import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase';
import { matchAll } from '@/lib/match';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// จับคู่รายการเงินออกใน Statement กับสลิปที่อ่านแล้ว แล้วบันทึกผลลง matches
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { dayTol?: number; amtTol?: number; includeFee?: boolean };
    const dayTol = [0, 1, 2].includes(Number(body.dayTol)) ? Number(body.dayTol) : 1;
    const amtTol = [0, 1].includes(Number(body.amtTol)) ? Number(body.amtTol) : 0;
    const includeFee = body.includeFee !== false;

    const db = admin();
    const { data: st } = await db.from('statements').select('*').eq('id', id).single();
    if (!st || st.status !== 'done' || !st.period_start || !st.period_end) {
      return NextResponse.json({ error: 'Statement ยังไม่พร้อมจับคู่' }, { status: 409 });
    }
    if (st.finalized_at) return NextResponse.json({ error: 'Statement นี้ยืนยันผลขั้นสุดท้ายแล้ว' }, { status: 409 });

    const { data: rows, error: rErr } = await db.from('statement_rows').select('id, tx_date, amount').eq('statement_id', id).eq('direction', 'out');
    if (rErr) throw rErr;
    const { data: slips, error: sErr } = await db
      .from('slips')
      .select('id, slip_date, amount, fee')
      .eq('extract_status', 'done')
      .gte('slip_date', addDays(st.period_start, -3))
      .lte('slip_date', addDays(st.period_end, 31));
    if (sErr) throw sErr;

    const result = matchAll(
      (rows ?? []).map((r) => ({ id: r.id, tx_date: r.tx_date, amount: Number(r.amount) })),
      (slips ?? []).map((s) => ({ id: s.id, slip_date: s.slip_date, amount: s.amount === null ? null : Number(s.amount), fee: s.fee === null ? null : Number(s.fee) })),
      { dayTol, amtTol, includeFee, start: st.period_start, end: st.period_end },
    );

    await db.from('matches').delete().eq('statement_id', id);
    if (result.length) {
      const { error: insErr } = await db.from('matches').insert(
        result.map((m) => ({ statement_id: id, row_id: m.row_id, slip_id: m.slip_id, kind: m.kind, sort_date: m.sort_date, admin_status: m.kind === 'out' ? 'na' : 'pending' })),
      );
      if (insErr) throw insErr;
    }
    await db.from('statements').update({ day_tol: dayTol, amt_tol: amtTol, include_fee: includeFee, matched_at: new Date().toISOString(), finalized_at: null }).eq('id', id);

    const counts: Record<string, number> = {};
    for (const m of result) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
    return NextResponse.json({ ok: true, total: result.length, counts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'จับคู่ไม่สำเร็จ' }, { status: 500 });
  }
}
