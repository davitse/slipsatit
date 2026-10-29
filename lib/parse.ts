// แยกฟิลด์จากข้อความที่ OCR (Tesseract) อ่านได้จากสลิปโอนเงิน
// ไม่ import อะไรจากไฟล์อื่น เพื่อให้ทดสอบด้วย node ได้โดยตรง

export type Parsed = {
  slip_date: string | null;
  slip_time: string | null;
  ref: string | null;
  tx_type: string | null;
  from_bank: string | null;
  from_name: string | null;
  from_acc: string | null;
  to_bank: string | null;
  to_name: string | null;
  to_acc: string | null;
  amount: number | null;
  fee: number;
  memo: string | null;
  category: string | null;
  confidence: number;
};

const MONTHS: Record<string, number> = {
  มค: 1, กพ: 2, มีค: 3, เมย: 4, พค: 5, มิย: 6, กค: 7, สค: 8, กย: 9, ตค: 10, พย: 11, ธค: 12,
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4, พฤษภาคม: 5, มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8,
  กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const BANKS: [RegExp, string][] = [
  [/ไทยพาณิชย์|\bSCB\b/i, 'ไทยพาณิชย์'],
  [/กสิกร|K\s?PLUS|\bKBANK\b/i, 'กสิกรไทย'],
  [/กรุงไทย|\bKTB\b/i, 'กรุงไทย'],
  [/กรุงเทพ|\bBBL\b|Bangkok\s*Bank/i, 'กรุงเทพ'],
  [/ออมสิน|\bGSB\b/i, 'ออมสิน'],
  [/กรุงศรี|krungsri|\bBAY\b/i, 'กรุงศรี'],
  [/ทหารไทย|ธนชาต|\bttb\b|\bTMB\b/i, 'ทีเอ็มบีธนชาต'],
  [/ก\.?ส\.?ก\.?|\bBAAC\b|เพื่อการเกษตร/i, 'ธ.ก.ส.'],
  [/อาคารสงเคราะห์|\bGHB\b/i, 'ธอส.'],
];

const TITLE = '(?:นางสาว|นาย|นาง|น\\.ส\\.|นส\\.|ด\\.ช\\.|ด\\.ญ\\.|เด็กชาย|เด็กหญิง|MISS|MRS\\.?|MR\\.?|MS\\.?|บริษัท|บร[ิ]?ษัท|บจก\\.?|หจก\\.?|ห้างหุ้นส่วน|ร้าน|การไฟฟ้า|การประปา)';

const CATEGORY_RULES: [RegExp, string][] = [
  [/บัตรเครดิต|บัตรกรุงไทย|\bKTC\b|credit\s*card/i, 'ชำระบัตรเครดิต'],
  [/การไฟฟ้า|การประปา|ค่าน้ำ|ค่าไฟ|อินเทอร์เน็ต|internet|true|ais|dtac/i, 'สาธารณูปโภค'],
  [/น้ำมัน|ปั๊ม|ทางด่วน|แท็กซี่|taxi|grab|bolt|ค่ารถ|เดินทาง/i, 'เดินทาง'],
  [/เงินเดือน|ค่าจ้าง|ค่าแรง/i, 'ค่าจ้าง'],
  [/วัสดุ|อุปกรณ์|ซัพพลาย|supply|ฮาร์ดแวร์|เครื่องเขียน/i, 'วัสดุอุปกรณ์'],
  [/ข้าว|อาหาร|กาแฟ|ชา|ก๋วยเตี๋ยว|ร้านอาหาร|เครื่องดื่ม|cafe|coffee|food|หมู|ไก่/i, 'อาหาร'],
  [/ค่าบริการ|พิมพ์|ค่าเช่า|ซ่อม|บริการ/i, 'ค่าบริการ'],
];

export function normalize(raw: string): string {
  return raw
    .replace(/ํา/g, 'ำ') // ํา -> ำ
    .replace(/(^|[\s\d])๓(?=\s*\.?\s*ค\.)/g, '$1ต') // OCR อ่าน "ต.ค." เป็น "๓.ค." (ต้องทำก่อนแปลงเลขไทย)
    .replace(/(\d{1,3})\.(\d{3})\.(\d{2})(?!\d)/g, '$1,$2.$3') // 22.237.64 -> 22,237.64
    .replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ');
}

function parseDate(text: string): { date: string | null; end: number } {
  const re = /(\d{1,2})\s*([ก-๙A-Za-z.]{2,12})\s*(\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[2].replace(/[.\s]/g, '').toLowerCase();
    const mon = MONTHS[key] ?? MONTHS[key.slice(0, 3)];
    if (!mon) continue;
    let y = Number(m[3]);
    if (y < 100) y += 2500;
    if (y >= 2400) y -= 543;
    const d = Number(m[1]);
    if (y < 2000 || y > 2100 || d < 1 || d > 31) continue;
    return { date: `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`, end: m.index + m[0].length };
  }
  return { date: null, end: -1 };
}

function parseTime(text: string, afterDate: number): string | null {
  const m = /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/.exec(text);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  if (afterDate >= 0) {
    const near = text.slice(afterDate, afterDate + 24);
    const n = /([01]?\d|2[0-3])\.([0-5]\d)\b/.exec(near);
    if (n) return `${n[1].padStart(2, '0')}:${n[2]}`;
  }
  return null;
}

const NUM = /\d{1,3}(?:,\d{3})+\.\d{1,2}|\d+\.\d{1,2}/g;
const toNum = (s: string) => Number(s.replace(/,/g, ''));

function parseAmounts(lines: string[]): { amount: number | null; fee: number } {
  let amount: number | null = null;
  let fee = 0;
  lines.forEach((line, i) => {
    const nums = (line.match(NUM) ?? []).map(toNum);
    const next = (lines[i + 1]?.match(NUM) ?? []).map(toNum);
    if (/ค่าธรรมเนียม|Fee/i.test(line)) {
      const f = nums[0] ?? next[0];
      if (f !== undefined && fee === 0) fee = f;
    } else if (/จำนวน|Amount|ยอดโอน|ยอดเงิน/i.test(line) && amount === null) {
      const a = nums[0] ?? next[0];
      if (a !== undefined) amount = a;
    }
  });
  if (amount === null) {
    const all = lines
      .filter((l) => !/ค่าธรรมเนียม|Fee|อ้างอิง|Ref/i.test(l))
      .flatMap((l) => (l.match(NUM) ?? []).map(toNum))
      .filter((n) => n > 0);
    if (all.length) amount = all[0];
  }
  return { amount, fee };
}

function parseRef(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (/อ.{0,3}างอิง|เลขที่รายการ|รหัสรายการ|Ref|Transaction\s*ID/i.test(lines[i])) {
      const afterColon = lines[i].split(/[:：]/).slice(1).join('') || lines[i].replace(/^.*?(อ.{0,3}างอิง|รายการ|Ref|ID)/i, '');
      const cand = (afterColon || lines[i + 1] || '').replace(/[^A-Za-z0-9]/g, '');
      if (cand.length >= 10) return cand.slice(0, 40);
    }
  }
  return null;
}

const MASK = /\b[xX*]{1,3}(?:[-\s]?[xX*0-9]{1,7}){1,3}\b/g;
export function findAcc(text: string): string | null {
  const card = /\b(\d{4,6})[xX*%#•]{4,8}(\d{4})\b/.exec(text); // เลขบัตร เช่น 430445XXXXXX8029
  if (card) return `${card[1]}${'x'.repeat(16 - card[1].length - 4)}${card[2]}`;
  const hits = (text.match(MASK) ?? []).filter((s) => /[xX*]/.test(s) && (s.match(/\d/g) ?? []).length >= 3);
  return hits.length ? hits[0].replace(/\s+/g, '').replace(/[X*]/g, 'x') : null;
}

export function findBank(text: string): string | null {
  for (const [re, name] of BANKS) if (re.test(text)) return name;
  return null;
}

const LBL = '[^A-Za-zก-๙]{0,3}';
const END = '(?=[\\s:：@]|$)';

function extractName(line: string, requireTitle: boolean): string | null {
  const t = new RegExp(`(${TITLE}[^\\n]*)`, 'i').exec(line);
  if (!t && requireTitle) return null;
  let name = t ? t[1] : line.replace(new RegExp(`^${LBL}(จาก|ไปยัง|ถึง|From|To|ผู้รับ|ผู้โอน)${END}`, 'i'), '');
  name = name
    .replace(/บรษัท/g, 'บริษัท') // แก้คำที่ OCR มักอ่านพลาด
    .replace(/[ขจ]ำกัด/g, 'จำกัด')
    .replace(/["'“”‘’`]/g, '')
    .replace(/[@|\[\]{}_=~^<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-zก-๙]+/, '')
    .trim();
  return name.length >= 3 ? name : null;
}

const reTitleStart = new RegExp(`^.{0,4}?${TITLE}`, 'i');

function sections(lines: string[]) {
  const reFrom = new RegExp(`^${LBL}(จาก|From)${END}`, 'i');
  const reTo = new RegExp(`^${LBL}(ไปยัง|โอนไปยัง|ถึง|To|ผู้รับ)${END}`, 'i');
  let iFrom = lines.findIndex((l) => reFrom.test(l));
  let iTo = lines.findIndex((l, i) => i > iFrom && reTo.test(l));
  let labelled = true;
  if (iFrom < 0 || iTo < 0) {
    // OCR อ่านป้าย "จาก/ไปยัง" ไม่ออก: ใช้บรรทัดชื่อ (ขึ้นต้นด้วยคำนำหน้า) แทน ผู้โอนมาก่อนผู้รับ
    labelled = false;
    const names = lines.map((l, i) => (reTitleStart.test(l) ? i : -1)).filter((i) => i >= 0);
    if (names.length >= 2) {
      iFrom = names[0];
      iTo = names[1];
    } else if (names.length === 1) {
      // ชื่อที่อ่านได้ 1 ชื่อถือเป็นผู้รับ ส่วนผู้โอนคือบรรทัดระหว่างรหัสอ้างอิงกับชื่อผู้รับ
      iTo = names[0];
      const r = lines.findIndex((l) => /อ.{0,3}างอิง|Ref/i.test(l));
      iFrom = r >= 0 && r < iTo ? r + 1 : 0;
    }
  }
  const stop = (from: number) => {
    for (let i = from + 1; i < lines.length; i++) {
      if (new RegExp(`^${LBL}(จำนวน|ค่าธรรมเนียม|Amount|Fee|บันทึก|Memo|หมายเหตุ)`, 'i').test(lines[i])) return i;
    }
    return Math.min(lines.length, from + 6);
  };
  const fromSec = iFrom >= 0 ? lines.slice(iFrom, iTo > iFrom ? iTo : iFrom + 4) : [];
  const toSec = iTo >= 0 ? lines.slice(iTo, stop(iTo)) : [];
  return { fromSec, toSec, labelled };
}

export function parseSlipText(raw: string, ocrConfidence = 70): Parsed {
  const text = normalize(raw);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const { date, end } = parseDate(text);
  const time = parseTime(text, end);
  const { amount, fee } = parseAmounts(lines);
  const ref = parseRef(lines);
  const { fromSec, toSec, labelled } = sections(lines);

  const fromText = fromSec.join('\n');
  const toText = toSec.join('\n');
  const pickName = (sec: string[]) => {
    if (!sec.length) return null;
    // บรรทัดแรก: ตัดป้ายกำกับออกแล้วถ้ามีชื่อให้ใช้เลย ไม่เช่นนั้นหาบรรทัดถัดไปที่ขึ้นต้นด้วยคำนำหน้า/ชื่อ
    // (ถ้าไม่มีป้ายกำกับ รับเฉพาะบรรทัดที่มีคำนำหน้า กันข้อความขยะจาก OCR)
    const first = labelled ? extractName(sec[0], false) : extractName(sec[0], true);
    if (first) return first;
    for (const l of sec.slice(1)) {
      const n = extractName(l, true);
      if (n) return n;
    }
    return null;
  };
  const from_name = pickName(fromSec);
  const to_name = pickName(toSec);
  const from_acc = findAcc(fromText);
  const to_acc = findAcc(toText);

  const header = lines.slice(0, 6).join(' ');
  // ไม่นับบรรทัดชื่อ เพราะชื่อบริษัทอาจมีคำว่าธนาคาร เช่น "บริษัท บัตรกรุงไทย จำกัด"
  const noName = (sec: string[]) => {
    const k = sec.findIndex((x) => reTitleStart.test(x));
    return sec.filter((_, i) => i !== k).join('\n');
  };
  const to_bank = findBank(noName(toSec));
  const from_bank = findBank(noName(fromSec)) ?? findBank(header);

  let tx_type: string | null = null;
  if (/พร้อมเพย์|PromptPay/i.test(text)) tx_type = 'พร้อมเพย์';
  else if (/จ่ายบิล|ชำระบิล/.test(text)) tx_type = 'จ่ายบิล';
  else if (/โอนเงิน/.test(text)) tx_type = 'โอนเงิน';
  else if (/ชำระ/.test(text)) tx_type = 'ชำระเงิน';

  const reMemo = new RegExp(`^${LBL}(บันทึกช่วยจำ|บันทึก|Memo|หมายเหตุ)`, 'i');
  const memoLine = lines.find((l) => reMemo.test(l));
  const memo = memoLine ? memoLine.replace(new RegExp(`^${LBL}(บันทึกช่วยจำ|บันทึก|Memo|หมายเหตุ)\\s*[:：]?\\s*`, 'i'), '').trim() || null : null;

  const hay = `${to_name ?? ''} ${memo ?? ''}`;
  const category = CATEGORY_RULES.find(([re]) => re.test(hay))?.[1] ?? 'อื่น ๆ';

  let score = 0;
  if (date) score += 25;
  if (time) score += 5;
  if (amount !== null) score += 30;
  if (to_name) score += 15;
  if (from_name) score += 5;
  if (ref) score += 5;
  if (from_acc || to_acc) score += 5;
  if (tx_type) score += 5;
  const confidence = Math.max(0, Math.min(100, Math.round(score * (0.7 + 0.3 * (Math.max(0, Math.min(100, ocrConfidence)) / 100)))));

  return {
    slip_date: date, slip_time: time, ref, tx_type,
    from_bank, from_name, from_acc, to_bank, to_name, to_acc,
    amount, fee, memo, category, confidence,
  };
}
