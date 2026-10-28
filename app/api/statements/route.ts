import { NextResponse } from 'next/server';
import { admin, BUCKET } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ขั้นที่ 1: สร้างแถว Statement + signed upload URL ให้เบราว์เซอร์อัปโหลด PDF ตรงเข้า Supabase Storage
export async function POST(req: Request) {
  try {
    const { file_name, content_type } = (await req.json()) as { file_name?: string; content_type?: string };
    if (!file_name || content_type !== 'application/pdf') {
      return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ PDF' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const path = `statements/${id}.pdf`;
    const db = admin();
    const { error: insErr } = await db.from('statements').insert({ id, file_name: file_name.slice(0, 200), file_path: path, status: 'processing' });
    if (insErr) throw insErr;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ id, path, token: data.token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ผิดพลาด' }, { status: 500 });
  }
}
