'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ALLOWED_MIME, MAX_BYTES } from '@/lib/types';

type State = 'queued' | 'uploading' | 'reading' | 'done' | 'failed';
type Item = { key: string; file: File; state: State; error?: string };

const MAX_FILES = 20;
const CONCURRENCY = 2;

const LABEL: Record<State, { text: string; cls: string; icon: string }> = {
  queued: { text: 'รอคิว', cls: 'wait', icon: 'M6 12h12' },
  uploading: { text: 'กำลังอัปโหลด', cls: 'run', icon: 'M12 6v6l4 2' },
  reading: { text: 'กำลังอ่านสลิป', cls: 'run', icon: 'M12 6v6l4 2' },
  done: { text: 'อ่านสำเร็จ', cls: 'ok', icon: 'M5 12l5 5L20 7' },
  failed: { text: 'ไม่สำเร็จ', cls: 'warn', icon: 'M12 8v5M12 17h.01' },
};

async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('compress'))), 'image/jpeg', 0.88));
  } catch {
    return file;
  }
}

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function UploadClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function processOne(it: Item) {
    try {
      patch(it.key, { state: 'uploading', error: undefined });
      const blob = await shrink(it.file);
      const init = await fetch('/api/slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: it.file.name, content_type: blob.type || it.file.type }),
      });
      const initJson = await init.json();
      if (!init.ok) throw new Error(initJson.error || 'เริ่มอัปโหลดไม่สำเร็จ');

      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const up = await sb.storage.from('slips').uploadToSignedUrl(initJson.path, initJson.token, blob, {
        contentType: blob.type || it.file.type,
      });
      if (up.error) throw new Error(up.error.message);

      patch(it.key, { state: 'reading' });
      const ex = await fetch(`/api/slips/${initJson.id}/extract`, { method: 'POST' });
      const exJson = await ex.json();
      if (!ex.ok) throw new Error(exJson.error || 'อ่านสลิปไม่สำเร็จ');
      patch(it.key, { state: 'done' });
    } catch (e) {
      patch(it.key, { state: 'failed', error: e instanceof Error ? e.message : 'ผิดพลาด' });
    }
  }

  async function run(batch: Item[]) {
    let i = 0;
    const worker = async () => {
      while (i < batch.length) await processOne(batch[i++]);
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  function add(list: FileList | File[]) {
    const room = MAX_FILES - items.length;
    const batch: Item[] = [];
    for (const f of Array.from(list).slice(0, Math.max(0, room))) {
      const bad = !ALLOWED_MIME.includes(f.type) ? 'รองรับเฉพาะ JPG, PNG, WebP, PDF' : f.size > MAX_BYTES ? 'ไฟล์ใหญ่เกิน 10 MB' : undefined;
      batch.push({ key: crypto.randomUUID(), file: f, state: bad ? 'failed' : 'queued', error: bad });
    }
    if (!batch.length) return;
    setItems((xs) => [...xs, ...batch]);
    void run(batch.filter((b) => b.state === 'queued'));
  }

  function retry(it: Item) {
    patch(it.key, { state: 'queued', error: undefined });
    void run([it]);
  }

  const count = (s: State) => items.filter((i) => i.state === s).length;
  const finished = count('done') + count('failed');
  const pct = items.length ? Math.round((finished / items.length) * 100) : 0;
  const busy = items.some((i) => i.state === 'uploading' || i.state === 'reading' || i.state === 'queued');

  return (
    <div className="cols">
      <div style={{ flex: '999 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section
          className={`drop${over ? ' over' : ''}`}
          aria-label="อัปโหลดไฟล์"
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        >
          <div className="icon">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0f6b5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
          </div>
          <div className="big">ลากสลิปมาวางที่นี่ ได้หลายใบพร้อมกัน</div>
          <div className="small" style={{ fontSize: 16 }}>หรือ</div>
          <input
            ref={input}
            className="sr"
            type="file"
            id="slipfiles"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }}
          />
          <label htmlFor="slipfiles" className="btn">เลือกสลิป (เลือกได้หลายไฟล์)</label>
          <div className="small">รองรับ JPG, PNG, WebP, PDF · ไฟล์ละไม่เกิน 10 MB · อัปโหลดได้ครั้งละ {MAX_FILES} ไฟล์</div>
        </section>

        {items.length > 0 && (
          <section className="card" aria-label="รายการไฟล์ที่อัปโหลด" style={{ overflow: 'hidden' }}>
            <div className="queue-head">
              <div className="row">
                <h2>สลิปที่เลือก {items.length} ใบ</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label htmlFor="slipfiles" className="btn ghost small">+ เพิ่มสลิป</label>
                  <button type="button" className="btn ghost small" disabled={busy} onClick={() => setItems([])}>ล้างรายการ</button>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px 16px', fontSize: 14, color: 'var(--ink-2)', marginBottom: 6 }}>
                  <span>เสร็จแล้ว {finished} จาก {items.length} ใบ</span>
                  <span>สำเร็จ {count('done')} · กำลังทำ {count('uploading') + count('reading')} · รอคิว {count('queued')} · ไม่สำเร็จ {count('failed')}</span>
                </div>
                <div className="bar" role="progressbar" aria-label="ความคืบหน้ารวม" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {items.map((it) => {
              const l = LABEL[it.state];
              return (
                <div className="qrow" key={it.key}>
                  <div className="thumb" aria-hidden="true">{it.file.type === 'application/pdf' ? 'PDF' : 'IMG'}</div>
                  <div className="name">
                    {it.file.name}
                    <div className="meta">{size(it.file.size)}</div>
                    {it.error && <div className="err">{it.error}</div>}
                  </div>
                  <span className={`badge ${l.cls}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={l.icon} /></svg>
                    {l.text}
                  </span>
                  {it.state === 'failed' && ALLOWED_MIME.includes(it.file.type) && it.file.size <= MAX_BYTES && (
                    <button type="button" className="btn ghost small" onClick={() => retry(it)}>ลองใหม่</button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`ลบ ${it.file.name} ออกจากรายการ`}
                    disabled={it.state === 'uploading' || it.state === 'reading'}
                    onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" /><path d="M9 7V4h6v3" />
                    </svg>
                  </button>
                </div>
              );
            })}

            <div className="queue-foot">
              <Link href="/review" className="btn">ดูผลการอ่านสลิป →</Link>
            </div>
          </section>
        )}
      </div>

      <aside style={{ flex: '1 1 340px', maxWidth: 440, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section className="card pad">
          <h2>ข้อมูลที่ระบบอ่านจากสลิป</h2>
          <p className="hint" style={{ marginBottom: 16 }}>แยกเป็นฟิลด์ให้แก้ไขได้ทีละช่องในขั้นตอนตรวจรายการ</p>
          <div className="group-title">ข้อมูลธุรกรรม</div>
          <div className="chips"><span className="chip">วันที่-เวลา</span><span className="chip">เลขที่อ้างอิง</span><span className="chip">ประเภทรายการ</span></div>
          <div className="group-title">ผู้โอน</div>
          <div className="chips"><span className="chip">ธนาคาร</span><span className="chip">ชื่อผู้โอน</span><span className="chip">เลขบัญชี</span></div>
          <div className="group-title">ผู้รับ</div>
          <div className="chips"><span className="chip">ธนาคาร</span><span className="chip">ชื่อผู้รับ</span><span className="chip">เลขบัญชี</span></div>
          <div className="group-title">จำนวนเงิน และข้อมูลเพิ่มเติม</div>
          <div className="chips"><span className="chip">จำนวนเงิน</span><span className="chip">ค่าธรรมเนียม</span><span className="chip">บันทึกช่วยจำ</span><span className="chip soft">หมวดหมู่ (ระบบแนะนำ)</span></div>
        </section>
        <section className="card pad">
          <h2>ถ่ายสลิปอย่างไรให้อ่านแม่น</h2>
          <ul className="tips">
            <li>เห็นสลิปครบทั้งใบ ไม่ตัดขอบ</li>
            <li>แสงพอ ไม่มีเงาหรือแสงสะท้อนทับตัวเลข</li>
            <li>ใช้ภาพจากแอปธนาคารโดยตรงจะแม่นที่สุด</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
