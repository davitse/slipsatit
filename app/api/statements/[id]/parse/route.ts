import { NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { admin, BUCKET } from '@/lib/supabase';
import { parseStatementText } from '@/lib/statement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PDF = 20 * 1024 * 1024;

// ขั้นที่ 2: อ่านข้อความจาก PDF แล้วแยกเป็นรายการ (ไม่ใช้ AI ไม่เสียค่าใช้จ่าย)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const fail = async (message: string, status = 422) => {
    await db.from('statements').update({ status: 'failed', error: message }).eq('id', id);
    return NextResponse.json({ error: message }, { status });
  };

  try {
    const { password } = (await req.json().catch(() => ({}))) as { password?: string };
    const { data: st, error } = await db.from('statements').select('*').eq('id', id).single();
    if (error || !st) return NextResponse.json({ error: 'ไม่พบ Statement' }, { status: 404 });

    const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(st.file_path);
    if (dlErr || !file) return fail('ไม่พบไฟล์ที่อัปโหลด', 502);
    if (file.size > MAX_PDF) return fail('ไฟล์ใหญ่เกิน 20 MB', 413);

    let text = '';
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()), password ? { password } : {});
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join('\n') : out.text;
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'PasswordException') {
        return fail(password ? 'รหัสผ่านไฟล์ PDF ไม่ถูกต้อง' : 'ไฟล์ PDF มีรหัสผ่าน กรุณากรอกรหัสผ่านไฟล์แล้วลองใหม่');
      }
      return fail('เปิดไฟล์ PDF ไม่ได้ ไฟล์อาจเสียหาย');
    }

    if (text.trim().length < 20) {
      return fail('ไม่พบข้อความใน PDF (อาจเป็นไฟล์สแกนภาพ ซึ่งยังไม่รองรับ) ลองดาวน์โหลด Statement แบบ PDF จากแอปหรือเว็บธนาคารโดยตรง');
    }

    const parsed = parseStatementText(text);
    const outRows = parsed.rows.filter((r) => r.direction === 'out');
    if (!parsed.rows.length || !outRows.length) {
      return fail('อ่านรายการเงินออกจาก Statement ไม่ได้ รูปแบบไฟล์อาจยังไม่รองรับ (ต้องมีวันที่ จำนวนเงิน และยอดคงเหลือในแต่ละรายการ)');
    }

    await db.from('statement_rows').delete().eq('statement_id', id);
    await db.from('matches').delete().eq('statement_id', id);
    for (let i = 0; i < parsed.rows.length; i += 400) {
      const chunk = parsed.rows.slice(i, i + 400).map((r) => ({ ...r, statement_id: id }));
      const { error: insErr } = await db.from('statement_rows').insert(chunk);
      if (insErr) throw insErr;
    }

    const dates = parsed.rows.map((r) => r.tx_date).sort();
    const outTotal = Math.round(outRows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const { data: updated, error: upErr } = await db
      .from('statements')
      .update({
        status: 'done', error: null, bank: parsed.bank, acc_last4: parsed.acc_last4,
        period_start: dates[0], period_end: dates[dates.length - 1],
        out_count: outRows.length, out_total: outTotal, matched_at: null, finalized_at: null,
      })
      .eq('id', id)
      .select()
      .single();
    if (upErr) throw upErr;
    return NextResponse.json({ statement: updated });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'อ่าน Statement ไม่สำเร็จ', 502);
  }
}
