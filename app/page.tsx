import UploadClient from '@/components/UploadClient';

export default function Home() {
  return (
    <main className="page">
      <div>
        <h1>อัปโหลดสลิปโอนเงิน</h1>
        <p className="sub">วางไฟล์สลิป ระบบจะอ่านข้อมูลในสลิปและสร้างเป็นตารางรายการให้ตรวจสอบต่อได้ทันที</p>
      </div>
      <UploadClient />
    </main>
  );
}
