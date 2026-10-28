// จับคู่รายการเงินออกใน Statement กับสลิป ด้วยวันที่และจำนวนเงิน (รหัสอ้างอิงจาก OCR ไม่แม่นพอจะใช้เป็นคีย์)

export type MatchKind = 'matched' | 'diff' | 'no_slip' | 'no_stmt' | 'out';

export type MRow = { id: string; tx_date: string; amount: number };
export type MSlip = { id: string; slip_date: string | null; amount: number | null; fee: number | null };
export type MatchOpts = {
  dayTol: number; // วันที่ต่างกันได้ไม่เกินกี่วัน
  amtTol: number; // จำนวนเงินต่างกันได้ไม่เกินกี่บาท (0 = ตรงทุกสตางค์)
  includeFee: boolean; // นับค่าธรรมเนียมในสลิปรวมกับยอดโอนเมื่อเทียบ Statement
  start: string; // ช่วงของ Statement
  end: string;
};
export type MatchOut = { row_id: string | null; slip_id: string | null; kind: MatchKind; sort_date: string };

const DAY = 86400000;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY;
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ส่วนต่างที่น้อยที่สุดระหว่างยอด Statement กับยอดสลิป (ลองทั้งแบบไม่รวมและรวมค่าธรรมเนียม) */
export function amountGap(stmt: number, slip: { amount: number | null; fee: number | null }, includeFee: boolean): number {
  const a = slip.amount ?? 0;
  const f = slip.fee ?? 0;
  const plain = Math.abs(r2(stmt - a));
  if (includeFee && f > 0) return Math.min(plain, Math.abs(r2(stmt - (a + f))));
  return plain;
}

export function matchAll(rows: MRow[], slips: MSlip[], o: MatchOpts): MatchOut[] {
  const out: MatchOut[] = [];
  const candidates = slips.filter((s) => s.slip_date && s.amount !== null);
  const used = new Set<string>();
  const sortedRows = [...rows].sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  const left: MRow[] = [];

  const pick = (row: MRow, ok: (gap: number) => boolean) => {
    let best: { s: MSlip; dd: number; gap: number } | null = null;
    for (const s of candidates) {
      if (used.has(s.id)) continue;
      const dd = dayDiff(row.tx_date, s.slip_date as string);
      if (dd > o.dayTol) continue;
      const gap = amountGap(row.amount, s, o.includeFee);
      if (!ok(gap)) continue;
      if (!best || dd < best.dd || (dd === best.dd && gap < best.gap)) best = { s, dd, gap };
    }
    return best;
  };

  // รอบที่ 1: ยอดตรงตามเกณฑ์
  for (const row of sortedRows) {
    const b = pick(row, (g) => g <= o.amtTol + 0.0001);
    if (b) {
      used.add(b.s.id);
      out.push({ row_id: row.id, slip_id: b.s.id, kind: 'matched', sort_date: row.tx_date });
    } else left.push(row);
  }

  // รอบที่ 2: พบคู่ที่น่าจะใช่แต่ยอดต่างกัน (ไม่เกิน 5% หรือ ฿20)
  const stillLeft: MRow[] = [];
  for (const row of left) {
    const lim = Math.max(20, row.amount * 0.05);
    const b = pick(row, (g) => g <= lim);
    if (b) {
      used.add(b.s.id);
      out.push({ row_id: row.id, slip_id: b.s.id, kind: 'diff', sort_date: row.tx_date });
    } else stillLeft.push(row);
  }

  for (const row of stillLeft) out.push({ row_id: row.id, slip_id: null, kind: 'no_slip', sort_date: row.tx_date });

  const lastOut = addDays(o.end, 31);
  for (const s of candidates) {
    if (used.has(s.id)) continue;
    const d = s.slip_date as string;
    if (d >= o.start && d <= o.end) out.push({ row_id: null, slip_id: s.id, kind: 'no_stmt', sort_date: d });
    else if (d > o.end && d <= lastOut) out.push({ row_id: null, slip_id: s.id, kind: 'out', sort_date: d });
    else if (d < o.start && dayDiff(d, o.start) <= o.dayTol) out.push({ row_id: null, slip_id: s.id, kind: 'out', sort_date: d });
  }

  return out.sort((a, b) => a.sort_date.localeCompare(b.sort_date));
}
