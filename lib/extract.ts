import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES } from './types';

const tool: Anthropic.Tool = {
  name: 'record_slip',
  description: 'บันทึกข้อมูลที่อ่านได้จากสลิปโอนเงิน',
  input_schema: {
    type: 'object',
    properties: {
      is_slip: { type: 'boolean', description: 'true ถ้าเป็นสลิปโอนเงิน/ชำระเงินจากธนาคารหรือแอปเงิน' },
      slip_date: { type: ['string', 'null'], description: 'วันที่ทำรายการ รูปแบบ YYYY-MM-DD เป็น ค.ศ. (ถ้าเป็น พ.ศ. ให้ลบ 543)' },
      slip_time: { type: ['string', 'null'], description: 'เวลา HH:MM แบบ 24 ชั่วโมง' },
      ref: { type: ['string', 'null'], description: 'เลขที่อ้างอิง/รหัสอ้างอิงของรายการ' },
      tx_type: { type: ['string', 'null'], description: 'ประเภทรายการ เช่น โอนเงิน, พร้อมเพย์, ชำระเงิน' },
      from_bank: { type: ['string', 'null'], description: 'ธนาคารผู้โอน (ชื่อสั้น เช่น กสิกรไทย)' },
      from_name: { type: ['string', 'null'] },
      from_acc: { type: ['string', 'null'], description: 'เลขบัญชีผู้โอน ตามที่แสดงในสลิป (อาจปิดบังบางหลัก)' },
      to_bank: { type: ['string', 'null'], description: 'ธนาคารผู้รับ' },
      to_name: { type: ['string', 'null'] },
      to_acc: { type: ['string', 'null'], description: 'เลขบัญชี/เบอร์พร้อมเพย์ผู้รับ ตามที่แสดงในสลิป' },
      amount: { type: ['number', 'null'], description: 'จำนวนเงินเป็นตัวเลข หน่วยบาท' },
      fee: { type: ['number', 'null'], description: 'ค่าธรรมเนียม ถ้าไม่ระบุให้เป็น 0' },
      memo: { type: ['string', 'null'], description: 'บันทึกช่วยจำ/memo ในสลิป' },
      category: { type: ['string', 'null'], enum: [...CATEGORIES, null], description: 'หมวดหมู่ที่เหมาะสมที่สุดจากรายการที่กำหนด' },
      confidence: { type: 'integer', minimum: 0, maximum: 100, description: 'ความมั่นใจโดยรวมในการอ่าน (0-100)' },
    },
    required: ['is_slip', 'confidence'],
  },
};

const PROMPT = `อ่านสลิปโอนเงินนี้แล้วเรียก record_slip เท่านั้น
- ห้ามเดาข้อมูลที่มองไม่เห็นในภาพ ให้ใส่ null
- เลขบัญชีให้คัดลอกตามที่แสดง (รวมตัว x ที่ปิดบัง) ห้ามเติมตัวเลขเอง
- ปีในสลิปไทยมักเป็น พ.ศ. ให้แปลงเป็น ค.ศ. ในฟิลด์ slip_date
- ถ้าภาพไม่ใช่สลิปโอนเงิน ให้ is_slip เป็น false
- ธนาคารผู้โอนให้ดูจากโลโก้/ส่วนหัวของสลิป (เช่น SCB = ไทยพาณิชย์, KBank = กสิกรไทย) ตอบเป็นชื่อสั้นแบบไทย
- ธนาคารผู้รับ: ถ้าสลิปไม่ได้ระบุชื่อธนาคารผู้รับ (บางแอปแสดงแค่ชื่อและเลขบัญชี/เบอร์) ให้ใส่ null ห้ามเดา
- ชื่อผู้โอน/ผู้รับ คัดลอกตามที่แสดง รวมคำนำหน้าและชื่อย่อ (เช่น "นาย สมเดช นักคะลา")
- รหัส/เลขที่อ้างอิงอาจมีทั้งตัวอักษรและตัวเลข ให้คัดลอกตรงตัวอักษร ระวังสับสนระหว่าง I/l/1 และ O/0
- ฟิลด์ที่สลิปไม่มี เช่น ค่าธรรมเนียมหรือบันทึกช่วยจำ ให้ใส่ null (ค่าธรรมเนียมใช้ 0)
- confidence ต่ำ (ต่ำกว่า 80) ถ้าภาพเบลอ ตัดขอบ หรืออ่านตัวเลขสำคัญไม่ชัด`;

export type Extracted = {
  is_slip: boolean;
  slip_date?: string | null;
  slip_time?: string | null;
  ref?: string | null;
  tx_type?: string | null;
  from_bank?: string | null;
  from_name?: string | null;
  from_acc?: string | null;
  to_bank?: string | null;
  to_name?: string | null;
  to_acc?: string | null;
  amount?: number | null;
  fee?: number | null;
  memo?: string | null;
  category?: string | null;
  confidence: number;
};

export async function extractSlip(bytes: Buffer, mime: string): Promise<Extracted> {
  const client = new Anthropic(); // อ่าน ANTHROPIC_API_KEY จาก env
  const data = bytes.toString('base64');
  const media: Anthropic.ContentBlockParam =
    mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : {
          type: 'image',
          source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/webp', data },
        };

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'record_slip' },
    messages: [{ role: 'user', content: [media, { type: 'text', text: PROMPT }] }],
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('โมเดลไม่ได้ส่งผลลัพธ์กลับมา');
  const out = block.input as Extracted;

  if (out.slip_date && !/^\d{4}-\d{2}-\d{2}$/.test(out.slip_date)) out.slip_date = null;
  if (out.slip_time && !/^\d{1,2}:\d{2}/.test(out.slip_time)) out.slip_time = null;
  if (out.slip_time) out.slip_time = out.slip_time.slice(0, 5).padStart(5, '0');
  out.confidence = Math.max(0, Math.min(100, Math.round(Number(out.confidence) || 0)));
  return out;
}
