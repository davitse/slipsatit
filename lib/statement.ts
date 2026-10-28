// แยกรายการจากข้อความของ Statement (PDF ที่เป็นข้อความ ไม่ใช่ภาพสแกน)
// หลักการ: แต่ละรายการขึ้นต้นด้วยวันที่ และมีตัวเลขเงิน 2 ตัวท้ายสุดคือ "จำนวน" กับ "ยอดคงเหลือ"
// ทิศทาง (เข้า/ออก) ดูจากการเปลี่ยนของยอดคงเหลือเทียบรายการก่อนหน้า จึงไม่ผูกกับคอลัมน์ของธนาคารใดธนาคารหนึ่ง
import { findAcc, findBank, normalize } from './parse.ts';

export type StmtRow = {
  seq: number;
  tx_date: string;
  tx_time: string | null;
  description: string;
  amount: number;
  direction: 'out' | 'in';
  balance: number | null;
};

export type ParsedStatement = {
  bank: string | null;
  acc_last4: string | null;
  rows: StmtRow[];
};

const MONTHS: Record<string, number> = {
  มค: 1, กพ: 2, มีค: 3, เมย: 4, พค: 5, มิย: 6, กค: 7, สค: 8, กย: 9, ตค: 10, พย: 11, ธค: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONEY = /-?\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g;
const toNum = (s: string) => Number(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;

function fixYear(y: number): number {
  if (y >= 2400) return y - 543;
  if (y >= 100) return y;
  return y >= 40 ? 2500 + y - 543 : 2000 + y; // ปี 2 หลัก: 69 -> พ.ศ. 2569, 26 -> ค.ศ. 2026
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** วันที่ที่ต้นบรรทัด (ภายใน 14 ตัวอักษรแรก) คืนค่าวันที่ และตำแหน่งที่วันที่จบ */
function leadingDate(line: string): { date: string; end: number } | null {
  const head = line.slice(0, 18);
  let m = /^[^\dก-๙A-Za-z]{0,3}(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(head);
  if (m) {
    const d = iso(fixYear(Number(m[3])), Number(m[2]), Number(m[1]));
    return d ? { date: d, end: m[0].length } : null;
  }
  m = /^[^\dก-๙A-Za-z]{0,3}(\d{1,2})\s*([ก-๙A-Za-z.]{2,6})\s*(\d{2,4})/.exec(head);
  if (m) {
    const key = m[2].replace(/[.\s]/g, '').toLowerCase();
    const mon = MONTHS[key] ?? MONTHS[key.slice(0, 3)];
    if (!mon) return null;
    const d = iso(fixYear(Number(m[3])), mon, Number(m[1]));
    return d ? { date: d, end: m[0].length } : null;
  }
  return null;
}

const FOOTER = /รวม|ยอดยกมา|ยอดยกไป|Balance\s*Forward|Total|หน้า|Page|สรุป|คงเหลือยก/i;
const IN_RE = /ฝาก|รับโอน|โอนเข้า|เงินเข้า|ดอกเบี้ย|Deposit|Credit|Interest|Transfer\s*(?:from|in)\b/i;
const OUT_RE = /ถอน|โอน|ชำระ|หัก|ซื้อ|ค่าธรรมเนียม|Withdraw|Debit|Payment|Transfer/i;

type Block = { date: string; time: string | null; text: string };

export function parseStatementText(raw: string): ParsedStatement {
  const text = normalize(raw);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // ส่วนหัว = บรรทัดก่อนรายการแรก (กันไปจับเลขบัญชีปลายทางในรายการ)
  const firstTx = lines.findIndex((l) => leadingDate(l) !== null);
  const header = lines.slice(0, firstTx >= 0 ? Math.min(firstTx, 40) : 40).join('\n');
  const bank = findBank(header);
  let acc_last4: string | null = null;
  const masked = findAcc(header);
  if (masked) acc_last4 = masked.replace(/\D/g, '').slice(-4) || null;
  if (!acc_last4) {
    const full = /\b(\d{3})-(\d)-(\d{5})-(\d)\b/.exec(header);
    if (full) acc_last4 = full[3].slice(-4);
  }

  // แบ่งเป็นบล็อกรายการ
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let cont = 0;
  for (const line of lines) {
    const d = leadingDate(line);
    if (d) {
      const rest = line.slice(d.end);
      const t = /^\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?/.exec(rest);
      cur = { date: d.date, time: t ? `${t[1].padStart(2, '0')}:${t[2]}` : null, text: t ? rest.slice(t[0].length) : rest };
      blocks.push(cur);
      cont = 0;
    } else if (cur && cont < 2 && !FOOTER.test(line)) {
      cur.text += ' ' + line;
      cont++;
    }
  }

  // เรียงตามเวลาจากเก่าไปใหม่ (บางธนาคารเรียงใหม่ไปเก่า)
  if (blocks.length > 1 && blocks[0].date > blocks[blocks.length - 1].date) blocks.reverse();

  const rows: StmtRow[] = [];
  let prevBalance: number | null = null;
  for (const b of blocks) {
    const nums = (b.text.match(MONEY) ?? []).map(toNum);
    if (/ยอดยกมา|Balance\s*Forward|Opening/i.test(b.text) && nums.length >= 1) {
      if (prevBalance === null) prevBalance = nums[nums.length - 1]; // ยอดยกมาใช้ตัดสินทิศทางของรายการแรก
      continue;
    }
    if (nums.length < 2) continue;
    const balance = nums[nums.length - 1];
    const amountCandidates = nums.slice(0, -1).filter((n) => n !== 0);
    if (!amountCandidates.length) continue;
    const amount = Math.abs(amountCandidates[amountCandidates.length - 1]);
    const description = b.text.replace(MONEY, ' ').replace(/\s+/g, ' ').trim();

    let direction: 'out' | 'in' | null = null;
    if (prevBalance !== null) {
      const delta = round2(balance - prevBalance);
      if (Math.abs(delta - amount) < 0.015) direction = 'in';
      else if (Math.abs(delta + amount) < 0.015) direction = 'out';
    }
    if (!direction) direction = IN_RE.test(description) ? 'in' : OUT_RE.test(description) ? 'out' : 'out';

    rows.push({ seq: rows.length + 1, tx_date: b.date, tx_time: b.time, description, amount: round2(amount), direction, balance });
    prevBalance = balance;
  }

  return { bank, acc_last4, rows };
}
