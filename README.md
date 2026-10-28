# SlipSatit

ระบบอ่านสลิปโอนเงิน: อัปโหลดสลิปได้หลายใบ → Claude อ่านเป็นฟิลด์ → ตรวจ/แก้ไขในตาราง → ดูยอดรวมบนแดชบอร์ด

- **Frontend/Backend:** Next.js (App Router) + TypeScript
- **Database + Storage:** Supabase (Postgres, bucket `slips` แบบ private)
- **อ่านสลิป:** Tesseract.js OCR ในเบราว์เซอร์ (ฟรี) + ตัวแยกฟิลด์ `lib/parse.ts` ; ตัวสำรองเสียค่า API: Claude vision (`OCR_FALLBACK_CLAUDE=true`)
- **Deploy:** Vercel

## SRS ↔ ส่วนของโค้ด

| ข้อ | อยู่ที่ |
|---|---|
| อัปโหลดหลายสลิป / ตารางรายการ | `components/UploadClient.tsx`, `components/ReviewClient.tsx` |
| แยกฟิลด์ตาม attribute | `lib/parse.ts` (OCR ฟรี), `lib/extract.ts` (Claude สำรอง), `supabase/migrations/0001_init.sql` (คอลัมน์) |
| แดชบอร์ดยอดรวม | `app/dashboard/page.tsx` |
| Git / Supabase / Vercel | README นี้ |

## ผังการทำงาน

1. **อัปโหลดสลิป** (`/`) → OCR ฟรีในเบราว์เซอร์ → ตาราง `slips`
2. **ตรวจรายการจับคู่** (`/reconcile`) → อัปโหลด Statement PDF → อ่านรายการเงินออก (`lib/statement.ts`) → จับคู่กับสลิปด้วยวันที่+จำนวนเงิน (`lib/match.ts`) → admin ยืนยัน/ส่งตรวจต่อพร้อมเหตุผล → ยืนยันผลขั้นสุดท้าย (popup แจ้งเตือนเมื่อมีรายการไม่ตรง)
3. **แดชบอร์ด** (`/dashboard`) สรุปยอดจากสลิป + จำนวนรายการที่ไม่ตรงกับ Statement ล่าสุด

ข้อจำกัดของ Statement: ต้องเป็น PDF ที่มีข้อความ (ไม่ใช่ภาพสแกน) และแต่ละรายการต้องมีวันที่ จำนวนเงิน และยอดคงเหลือ ระบบดูเข้า/ออกจากการเปลี่ยนของยอดคงเหลือ ตัวอ่านเป็นแบบทั่วไป ยังไม่ได้จูนกับรูปแบบของธนาคารใดโดยเฉพาะ

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ https://supabase.com
2. รัน `supabase/migrations/0001_init.sql` และ `0002_reconcile.sql` ตามลำดับ (SQL Editor หรือ `supabase db push`)
3. คัดลอกค่าจาก Project Settings → API ไปใส่ env ตาม `.env.example`

## รันในเครื่อง

```bash
cp .env.example .env.local   # แล้วเติมค่า
npm install
npm run dev
```

## Deploy บน Vercel

1. Import repo นี้ใน Vercel (Framework: Next.js)
2. ตั้ง Environment Variables ให้ครบตาม `.env.example`
   - `SUPABASE_SERVICE_ROLE_KEY` และ `ANTHROPIC_API_KEY` ห้ามขึ้นต้นด้วย `NEXT_PUBLIC_`
3. ตั้ง `APP_USER` / `APP_PASSWORD` เพื่อล็อกเว็บด้วย Basic Auth (แนะนำมาก เพราะระบบยังไม่มีระบบล็อกอินผู้ใช้ และการอ่านสลิปมีค่า API)
4. Deploy

## ข้อควรรู้

- ไฟล์ถูกอัปโหลดจากเบราว์เซอร์เข้า Supabase Storage โดยตรงผ่าน signed URL (Vercel จำกัด body 4.5 MB) แล้วเรียก `/api/slips/[id]/extract` ให้อ่านสลิปทีละใบ
- ตาราง `slips` เปิด RLS และไม่มี policy: เข้าถึงได้เฉพาะจากเซิร์ฟเวอร์ด้วย service role
- ยังไม่มีระบบแยกผู้ใช้ (multi-user) ถ้าต้องใช้หลายคน ให้เพิ่ม Supabase Auth และคอลัมน์ `user_id` + RLS policy
- ค่าที่ OCR ได้อาจผิด จึงมีสถานะ "รอตรวจ/ตรวจแล้ว" และธงเตือนเมื่อความมั่นใจต่ำกว่า 80%

## เวอร์ชัน

- **0.3.0** หน้า "ตรวจรายการจับคู่": อัปโหลด Statement PDF, จับคู่กับสลิป, admin final check, popup แจ้งเตือน (ตัดหน้าตรวจรายการสลิปออก)
- **0.2.0** อ่านสลิปด้วย Tesseract OCR ในเบราว์เซอร์ (ฟรี) แทน Claude เป็นค่าเริ่มต้น
  - รหัสอ้างอิงที่ OCR อ่านอาจคลาดเคลื่อน 2–3 ตัวอักษร จึงไม่ใช้เป็นคีย์จับคู่
  - ต้องตั้ง `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ตามเดิม ส่วน `ANTHROPIC_API_KEY` ไม่จำเป็นอีกต่อไปถ้าไม่เปิดโหมดสำรอง
- **0.1.0** อ่านสลิปด้วย Claude vision
