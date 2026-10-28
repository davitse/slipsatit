'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ALLOWED_MIME, MAX_BYTES } from '@/lib/types';
import { ocrImage } from '@/lib/ocr';
import { money, thaiDate } from '@/lib/format';
import type { Slip } from '@/lib/types';

type State = 'queued' | 'uploading' | 'reading' | 'done' | 'failed';
type Item = { key: string; file: File; state: State; error?: string; slip?: Slip };

const MAX_FILES = 20;
const CONCURRENCY = 2;

const LABEL: Record<State, { text: string; cls: string; icon: string }> = {
  queued: { text: 'รอคิว', cls: 'wait', icon: 'M6 12h12' },
  uploading: { text: 'กำลังอัปโหลด', cls: 'run', icon: 'M12 6v6l4 2' },
  reading: { text: 'กำลังอ่านสลิป (OCR)', cls: 'run', icon: 'M12 6v6l4 2' },
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

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function val(v: string | null | undefined) {
  return v && v.trim() ? v : '—';
}

function SlipDetail({ s }: { s: Slip }) {
  const groups: [string, [string, string][]][] = [
    ['ข้อมูลธุรกรรม', [['วันที่-เวลา', `${thaiDate(s.slip_date)} · ${s.slip_time ?? '--:--'}`], ['เลขที่อ้างอิง', val(s.ref)], ['ประเภทรายการ', val(s.tx_type)]]],
    ['ผู้โอน', [['ชื่อ', val(s.from_name)], ['ธนาคาร', val(s.from_bank)], ['เลขบัญชี', val(s.from_acc)]]],
    ['ผู้รับ', [['ชื่อ', val(s.to_name)], ['ธนาคาร', val(s.to_bank)], ['เลขบัญชี', val(s.to_acc)]]],
    ['จำนวนเงิน', [['จำนวนเงิน', `฿${money(s.amount)}`], ['ค่าธรรมเนียม', `฿${money(s.fee)}`]]],
    ['ข้อมูลเพิ่มเติม', [['บันทึกช่วยจำ', val(s.memo)], ['หมวดหมู่', val(s.category)]]],
  ];
  const low = (s.confidence ?? 100) < 80;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {groups.map(([title, fields]) => (
          <div key={title} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-dark)', marginBottom: 8 }}>{title}</div>
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
              {fields.map(([k, v]) => (
                <div key={k}><dt style={{ fontSize: 13, color: 'var(--muted)' }}>{k}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: low ? 'var(--amber-fg)' : 'var(--muted)' }}>
        ความมั่นใจในการอ่าน {s.confidence ?? '-'}%{low ? ' (ต่ำ) ' : ' · '}เลขที่อ้างอิงและชื่ออาจคลาดเคลื่อนเล็กน้อย ให้ admin ตรวจเทียบกับภาพสลิปที่ตารางสลิป
      </p>
    </div>
  );
}

export default function UploadClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
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
      // OCR ในเบราว์เซอร์ (ฟรี) เฉพาะรูปภาพ ส่วน PDF ให้เซิร์ฟเวอร์จัดการ (ต้องเปิดโหมดสำรอง)
      let ocr: { text: string; confidence: number } | null = null;
      let ocrError = false;
      if (blob.type.startsWith('image/')) {
        try {
          ocr = await ocrImage(blob);
        } catch {
          ocrError = true;
        }
      }
      const ex = await fetch(`/api/slips/${initJson.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ocr ? { text: ocr.text, ocr_confidence: ocr.confidence } : ocrError ? { ocr_error: true } : {}),
      });
      const exJson = await ex.json();
      if (!ex.ok) throw new Error(exJson.error || 'อ่านสลิปไม่สำเร็จ');
      patch(it.key, { state: 'done', slip: exJson.slip as Slip });
      setOpenKey((k) => k ?? it.key);
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
              <Link href="/slips" className="btn ghost">ให้ admin ตรวจสอบที่ตารางสลิป</Link>
              <Link href="/reconcile" className="btn">ไปกระทบยอดกับ Statement →</Link>
            </div>
          </section>
        )}

        {items.some((i) => i.slip) && (
          <section className="card" aria-label="ตารางสลิปที่อ่านได้" style={{ overflow: 'hidden' }}>
            <div className="toolbar">
              <h2 style={{ fontSize: 20 }}>สลิปที่อ่านได้ ({items.filter((i) => i.slip).length} ใบ)</h2>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>กด "รายละเอียด" เพื่อดูข้อมูลทุกฟิลด์ที่อ่านได้จากสลิป</span>
            </div>
            <div className="tbl-wrap">
              <table style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th scope="col">วันที่-เวลา</th><th scope="col">ผู้รับ</th><th scope="col">ธนาคารผู้รับ</th>
                    <th scope="col">หมวดหมู่</th><th scope="col" className="num">จำนวนเงิน (บาท)</th><th scope="col">ความมั่นใจ</th><th scope="col"><span className="sr">รายละเอียด</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter((i) => i.slip).map((i) => {
                    const s = i.slip as Slip;
                    const open = openKey === i.key;
                    const low = (s.confidence ?? 100) < 80;
                    return (
                      <FragmentRow key={i.key}>
                        <tr className={open ? 'sel' : undefined}>
                          <td style={{ whiteSpace: 'nowrap' }}>{thaiDate(s.slip_date)} · {s.slip_time ?? '--:--'}</td>
                          <td>{val(s.to_name)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{val(s.to_bank)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{val(s.category)}</td>
                          <td className="num">{money(s.amount)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}><span className={`badge ${low ? 'warn' : 'ok'}`}>{s.confidence ?? '-'}%</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpenKey(open ? null : i.key)}>{open ? 'ซ่อน' : 'รายละเอียด'}</button>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={7} style={{ background: 'var(--ground)', padding: 16 }}>
                              <SlipDetail s={s} />
                              <div style={{ marginTop: 12 }}><Link href={`/slips?slip=${s.id}`}>ตรวจสอบ/แก้ไขสลิปนี้ที่ตารางสลิป →</Link></div>
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <aside style={{ flex: '1 1 340px', maxWidth: 440, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section className="card pad">
          <h2>ข้อมูลที่ระบบอ่านจากสลิป</h2>
          <p className="hint" style={{ marginBottom: 16 }}>แสดงให้ admin ตรวจที่ตารางสลิป แล้วนำไปเทียบกับ Statement และสรุปบนแดชบอร์ด</p>
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
