export type Slip = {
  id: string;
  created_at: string;
  file_name: string;
  mime_type: string;
  image_path: string;
  extract_status: 'processing' | 'done' | 'failed';
  error: string | null;
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
  fee: number | null;
  memo: string | null;
  category: string | null;
  confidence: number | null;
  status: 'pending' | 'verified';
};

export const CATEGORIES = [
  'อาหาร',
  'วัสดุอุปกรณ์',
  'ค่าจ้าง',
  'สาธารณูปโภค',
  'ชำระบัตรเครดิต',
  'ค่าบริการ',
  'เดินทาง',
  'อื่น ๆ',
];

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_BYTES = 10 * 1024 * 1024;

// ---------- กระทบยอด Statement ----------
export type MatchKind = 'matched' | 'diff' | 'no_slip' | 'no_stmt' | 'out';
export type AdminStatus = 'pending' | 'approved' | 'flagged' | 'na';

export type Statement = {
  id: string;
  created_at: string;
  file_name: string;
  file_path: string;
  status: 'processing' | 'done' | 'failed';
  error: string | null;
  bank: string | null;
  acc_last4: string | null;
  period_start: string | null;
  period_end: string | null;
  out_count: number | null;
  out_total: number | null;
  day_tol: number | null;
  amt_tol: number | null;
  include_fee: boolean | null;
  matched_at: string | null;
  finalized_at: string | null;
};

export type StatementRow = {
  id: string;
  statement_id: string;
  seq: number;
  tx_date: string;
  tx_time: string | null;
  description: string | null;
  amount: number;
  direction: 'out' | 'in';
  balance: number | null;
};

export type MatchRecord = {
  id: string;
  statement_id: string;
  row_id: string | null;
  slip_id: string | null;
  kind: MatchKind;
  admin_status: AdminStatus;
  admin_note: string | null;
  decided_at: string | null;
  sort_date: string | null;
};

export type MatchItem = MatchRecord & { row: StatementRow | null; slip: Slip | null };

export const ISSUE_KINDS: MatchKind[] = ['diff', 'no_slip', 'no_stmt'];
