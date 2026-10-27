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
  'ค่าบริการ',
  'เดินทาง',
  'อื่น ๆ',
];

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_BYTES = 10 * 1024 * 1024;
