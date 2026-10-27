import { NextResponse } from 'next/server';
import { admin, BUCKET } from '@/lib/supabase';
import { extractSlip } from '@/lib/extract';
import { MAX_BYTES } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ขั้นที่ 2: ดึงไฟล์จาก Storage ส่งให้ Claude อ่าน แล้วบันทึกฟิลด์ลงตาราง
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const fail = async (message: string, status = 502) => {
    await db.from('slips').update({ extract_status: 'failed', error: message }).eq('id', id);
    return NextResponse.json({ error: message }, { status });
  };

  try {
    const { data: row, error } = await db.from('slips').select('*').eq('id', id).single();
    if (error || !row) return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 });

    const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(row.image_path);
    if (dlErr || !file) return fail('ไม่พบไฟล์ที่อัปโหลด');
    if (file.size > MAX_BYTES) return fail('ไฟล์ใหญ่เกิน 10 MB', 413);

    const ex = await extractSlip(Buffer.from(await file.arrayBuffer()), row.mime_type);
    if (!ex.is_slip) return fail('ไม่ใช่สลิปโอนเงิน', 422);

    const { data: updated, error: upErr } = await db
      .from('slips')
      .update({
        extract_status: 'done',
        error: null,
        slip_date: ex.slip_date ?? null,
        slip_time: ex.slip_time ?? null,
        ref: ex.ref ?? null,
        tx_type: ex.tx_type ?? null,
        from_bank: ex.from_bank ?? null,
        from_name: ex.from_name ?? null,
        from_acc: ex.from_acc ?? null,
        to_bank: ex.to_bank ?? null,
        to_name: ex.to_name ?? null,
        to_acc: ex.to_acc ?? null,
        amount: ex.amount ?? null,
        fee: ex.fee ?? 0,
        memo: ex.memo ?? null,
        category: ex.category ?? null,
        confidence: ex.confidence,
      })
      .eq('id', id)
      .select()
      .single();
    if (upErr) throw upErr;
    return NextResponse.json({ slip: updated });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'อ่านสลิปไม่สำเร็จ');
  }
}
