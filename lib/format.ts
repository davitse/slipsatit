const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function money(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 'YYYY-MM-DD' -> '02 ต.ค. 2569' */
export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '-';
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y + 543}`;
}

/** 'YYYY-MM' -> 'ตุลาคม 2569' */
export function thaiMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} ${y + 543}`;
}

export function parseAmount(s: string): number | null {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) && String(s).trim() !== '' ? n : null;
}
