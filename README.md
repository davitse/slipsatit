# SlipSatit

ระบบอ่านสลิปโอนเงิน: อัปโหลดสลิปได้หลายใบ → Claude อ่านเป็นฟิลด์ → ตรวจ/แก้ไขในตาราง → ดูยอดรวมบนแดชบอร์ด

- **Frontend/Backend:** Next.js (App Router) + TypeScript
- **Database + Storage:** Supabase (Postgres, bucket `slips` แบบ private)
- **อ่านสลิป:** Claude vision (`@anthropic-ai/sdk`, ใช้ tool call เพื่อให้ได้ JSON ตาม schema)
- **Deploy:** Vercel

## SRS ↔ ส่วนของโค้ด

| ข้อ | อยู่ที่ |
|---|---|
| อัปโหลดหลายสลิป / ตารางรายการ | `components/UploadClient.tsx`, `components/ReviewClient.tsx` |
| แยกฟิลด์ตาม attribute | `lib/extract.ts` (schema), `supabase/migrations/0001_init.sql` (คอลัมน์) |
| แดชบอร์ดยอดรวม | `app/dashboard/page.tsx` |
| Git / Supabase / Vercel | README นี้ |

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ https://supabase.com
2. รัน `supabase/migrations/0001_init.sql` (SQL Editor หรือ `supabase db push`)
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
