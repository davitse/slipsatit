import { NextResponse } from 'next/server';
import { admin, BUCKET } from '@/lib/supabase';
import { ALLOWED_MIME } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ขั้นที่ 1: สร้างแถวสลิป + signed upload URL ให้เบราว์เซอร์อัปโหลดไฟล์ตรงเข้า Supabase Storage
// (เลี่ยงข้อจำกัดขนาด body 4.5 MB ของ Vercel Functions)
export async function POST(req: Request) {
  try {
    const { file_name, content_type } = (await req.json()) as { file_name?: string; content_type?: string };
    if (!file_name || !content_type || !ALLOWED_MIME.includes(content_type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, WebP และ PDF' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const ext = content_type === 'application/pdf' ? 'pdf' : content_type.split('/')[1];
    const path = `${id}/slip.${ext}`;
    const db = admin();

    const { error: insErr } = await db.from('slips').insert({
      id,
      file_name: file_name.slice(0, 200),
      mime_type: content_type,
      image_path: path,
      extract_status: 'processing',
    });
    if (insErr) throw insErr;

    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ id, path, token: data.token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ผิดพลาด' }, { status: 500 });
  }
}
