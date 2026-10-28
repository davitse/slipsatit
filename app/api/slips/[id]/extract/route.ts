import { NextResponse } from 'next/server';
import { admin, BUCKET } from '@/lib/supabase';
import { extractSlip } from '@/lib/extract';
import { parseSlipText } from '@/lib/parse';
import { MAX_BYTES } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Body = { text?: string; ocr_confidence?: number };

// ขั้นที่ 2: รับข้อความที่ OCR ในเบราว์เซอร์อ่านได้ (ฟรี) แล้วแยกเป็นฟิลด์ลงตาราง
// ถ้าอ่านวันที่/จำนวนเงินไม่ได้ และตั้ง OCR_FALLBACK_CLAUDE=true จะใช้ Claude อ่านแทน (เสียค่า API)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const fail = async (message: string, status = 422) => {
    await db.from('slips').update({ extract_status: 'failed', error: message }).eq('id', id);
    return NextResponse.json({ error: message }, { status });
  };

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const { data: row, error } = await db.from('slips').select('*').eq('id', id).single();
    if (error || !row) return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 });

    const fallbackOn = process.env.OCR_FALLBACK_CLAUDE === 'true' && !!process.env.ANTHROPIC_API_KEY;
    let fields: Record<string, unknown> | null = null;

    if (typeof body.text === 'string' && body.text.trim()) {
      const p = parseSlipText(body.text, body.ocr_confidence ?? 70);
      if (p.amount !== null && p.slip_date) fields = { ...p };
    }

    if (!fields && fallbackOn) {
      const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(row.image_path);
      if (dlErr || !file) return fail('ไม่พบไฟล์ที่อัปโหลด', 502);
      if (file.size > MAX_BYTES) return fail('ไฟล์ใหญ่เกิน 10 MB', 413);
      const ex = await extractSlip(Buffer.from(await file.arrayBuffer()), row.mime_type);
      if (!ex.is_slip) return fail('ไม่ใช่สลิปโอนเงิน');
      fields = {
        slip_date: ex.slip_date ?? null, slip_time: ex.slip_time ?? null, ref: ex.ref ?? null, tx_type: ex.tx_type ?? null,
        from_bank: ex.from_bank ?? null, from_name: ex.from_name ?? null, from_acc: ex.from_acc ?? null,
        to_bank: ex.to_bank ?? null, to_name: ex.to_name ?? null, to_acc: ex.to_acc ?? null,
        amount: ex.amount ?? null, fee: ex.fee ?? 0, memo: ex.memo ?? null, category: ex.category ?? null,
        confidence: ex.confidence,
      };
    }

    if (!fields) {
      return fail(
        row.mime_type === 'application/pdf'
          ? 'ไฟล์ PDF ใช้ได้เมื่อเปิดโหมดสำรอง Claude เท่านั้น (OCR ฟรีรองรับเฉพาะรูปภาพ)'
          : 'อ่านวันที่หรือจำนวนเงินจากภาพไม่ได้ ลองถ่ายให้เห็นสลิปชัดและครบทั้งใบ',
      );
    }

    const { data: updated, error: upErr } = await db
      .from('slips')
      .update({ ...fields, extract_status: 'done', error: null })
      .eq('id', id)
      .select()
      .single();
    if (upErr) throw upErr;
    return NextResponse.json({ slip: updated });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'อ่านสลิปไม่สำเร็จ', 502);
  }
}
