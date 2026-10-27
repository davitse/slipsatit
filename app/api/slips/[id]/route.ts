import { NextResponse } from 'next/server';
import { admin, BUCKET } from '@/lib/supabase';
import { parseAmount } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TEXT_FIELDS = ['slip_time', 'ref', 'tx_type', 'from_bank', 'from_name', 'from_acc', 'to_bank', 'to_name', 'to_acc', 'memo', 'category'] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, string>;
  const patch: Record<string, string | number | null> = {};

  for (const k of TEXT_FIELDS) if (k in body) patch[k] = body[k]?.trim() ? body[k].trim() : null;
  if ('slip_date' in body) {
    patch.slip_date = /^\d{4}-\d{2}-\d{2}$/.test(body.slip_date) ? body.slip_date : null;
  }
  if ('amount' in body) patch.amount = parseAmount(body.amount);
  if ('fee' in body) patch.fee = parseAmount(body.fee) ?? 0;
  if (body.status === 'verified' || body.status === 'pending') patch.status = body.status;

  const { data, error } = await admin().from('slips').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ slip: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data } = await db.from('slips').select('image_path').eq('id', id).single();
  if (data?.image_path) await db.storage.from(BUCKET).remove([data.image_path]);
  const { error } = await db.from('slips').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
