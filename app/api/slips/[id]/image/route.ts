import { NextResponse } from 'next/server';
import { admin, BUCKET } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// redirect ไป signed URL อายุสั้น เพื่อให้ <img> แสดงรูปจาก bucket ที่เป็น private ได้
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data: row } = await db.from('slips').select('image_path').eq('id', id).single();
  if (!row) return new NextResponse('not found', { status: 404 });
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(row.image_path, 60);
  if (error || !data) return new NextResponse('error', { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
