import { admin } from './supabase';
import type { MatchItem, MatchRecord, Slip, Statement, StatementRow } from './types';

/** รายการ Statement ล่าสุดที่อ่านสำเร็จ (ใช้ในหน้า dropdown และเป็นค่าเริ่มต้น) */
export async function listStatements(limit = 12): Promise<Statement[]> {
  const { data, error } = await admin().from('statements').select('*').eq('status', 'done').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Statement[];
}

export async function loadItems(statementId: string): Promise<MatchItem[]> {
  const db = admin();
  const { data: ms, error } = await db.from('matches').select('*').eq('statement_id', statementId).order('sort_date', { ascending: true });
  if (error) throw new Error(error.message);
  const matches = (ms ?? []) as MatchRecord[];
  if (!matches.length) return [];

  const rowIds = matches.map((m) => m.row_id).filter(Boolean) as string[];
  const slipIds = matches.map((m) => m.slip_id).filter(Boolean) as string[];
  const [rows, slips] = await Promise.all([
    rowIds.length ? db.from('statement_rows').select('*').in('id', rowIds) : Promise.resolve({ data: [] as StatementRow[], error: null }),
    slipIds.length ? db.from('slips').select('*').in('id', slipIds) : Promise.resolve({ data: [] as Slip[], error: null }),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (slips.error) throw new Error(slips.error.message);
  const rowMap = new Map((rows.data as StatementRow[]).map((r) => [r.id, r]));
  const slipMap = new Map((slips.data as Slip[]).map((s) => [s.id, s]));
  return matches.map((m) => ({
    ...m,
    row: m.row_id ? rowMap.get(m.row_id) ?? null : null,
    slip: m.slip_id ? slipMap.get(m.slip_id) ?? null : null,
  }));
}
