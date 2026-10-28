'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, type Slip } from '@/lib/types';
import { money, thaiDate } from '@/lib/format';

const FIELDS: { title: string; items: { key: string; label: string; full?: boolean; kind?: 'date' | 'category' }[] }[] = [
  { title: 'ข้อมูลธุรกรรม', items: [
    { key: 'slip_date', label: 'วันที่ทำรายการ (ค.ศ.)', kind: 'date' },
    { key: 'slip_time', label: 'เวลา' },
    { key: 'ref', label: 'เลขที่อ้างอิง', full: true },
    { key: 'tx_type', label: 'ประเภทรายการ', full: true },
  ] },
  { title: 'ผู้โอน', items: [
    { key: 'from_bank', label: 'ธนาคาร' },
    { key: 'from_acc', label: 'เลขบัญชี' },
    { key: 'from_name', label: 'ชื่อผู้โอน', full: true },
  ] },
  { title: 'ผู้รับ', items: [
    { key: 'to_bank', label: 'ธนาคาร' },
    { key: 'to_acc', label: 'เลขบัญชี' },
    { key: 'to_name', label: 'ชื่อผู้รับ', full: true },
  ] },
  { title: 'จำนวนเงิน', items: [
    { key: 'amount', label: 'จำนวนเงิน (บาท)' },
    { key: 'fee', label: 'ค่าธรรมเนียม (บาท)' },
  ] },
  { title: 'ข้อมูลเพิ่มเติม', items: [
    { key: 'memo', label: 'บันทึกช่วยจำ', full: true },
    { key: 'category', label: 'หมวดหมู่', full: true, kind: 'category' },
  ] },
];

const KEYS = FIELDS.flatMap((g) => g.items.map((i) => i.key));
const toDraft = (s: Slip): Record<string, string> =>
  Object.fromEntries(KEYS.map((k) => [k, String((s as unknown as Record<string, unknown>)[k] ?? '')]));

type Filter = 'all' | 'pending' | 'verified';

export default function SlipsClient({ slips, selectedId }: { slips: Slip[]; selectedId?: string }) {
  const [rows, setRows] = useState(slips);
  const [filter, setFilter] = useState<Filter>('all');
  const [selId, setSelId] = useState<string | undefined>(slips.find((x) => x.id === selectedId)?.id ?? slips[0]?.id);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const sel = rows.find((r) => r.id === selId);
  useEffect(() => {
    const s = rows.find((r) => r.id === selId);
    if (s) setDraft(toDraft(s));
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  const shown = useMemo(() => rows.filter((r) => filter === 'all' || r.status === filter), [rows, filter]);
  const total = shown.reduce((s, r) => s + (r.amount ?? 0), 0);
  const pending = rows.filter((r) => r.status === 'pending').length;
  const dirty = sel ? JSON.stringify(draft) !== JSON.stringify(toDraft(sel)) : false;
  const lowConf = (sel?.confidence ?? 100) < 80;

  async function save(status?: 'verified') {
    if (!sel) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/slips/${sel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, ...(status ? { status } : {}) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'บันทึกไม่สำเร็จ');
      setRows((xs) => xs.map((x) => (x.id === sel.id ? (j.slip as Slip) : x)));
      setDraft(toDraft(j.slip as Slip));
      setMsg(status ? 'ยืนยันรายการแล้ว' : 'บันทึกแล้ว');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!sel || !window.confirm('ลบสลิปนี้ออกจากระบบ?')) return;
    setBusy(true);
    const res = await fetch(`/api/slips/${sel.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) { setMsg('ลบไม่สำเร็จ'); return; }
    const rest = rows.filter((r) => r.id !== sel.id);
    setRows(rest);
    setSelId(rest[0]?.id);
  }

  if (!rows.length) {
    return (
      <section className="card empty">
        <p>ยังไม่มีสลิปที่อ่านสำเร็จ</p>
        <Link href="/" className="btn">ไปอัปโหลดสลิป</Link>
      </section>
    );
  }

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: `ทั้งหมด (${rows.length})` },
    { key: 'pending', label: `รอตรวจ (${pending})` },
    { key: 'verified', label: `ตรวจแล้ว (${rows.length - pending})` },
  ];

  return (
    <div className="cols">
      <section className="card" aria-label="ตารางรายการจากสลิป" style={{ flex: '999 1 640px', minWidth: 0, overflow: 'hidden' }}>
        <div className="toolbar">
          <h2 style={{ fontSize: 20 }}>รายการสลิป</h2>
          <div role="group" aria-label="กรองตามสถานะ" className="chips">
            {chips.map((c) => (
              <button key={c.key} type="button" className="filter" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>{c.label}</button>
            ))}
          </div>
        </div>
        <div className="tbl-wrap">
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th scope="col">วันที่-เวลา</th>
                <th scope="col">เลขที่อ้างอิง</th>
                <th scope="col">ผู้รับ</th>
                <th scope="col">ธนาคารผู้รับ</th>
                <th scope="col">หมวดหมู่</th>
                <th scope="col" className="num">จำนวนเงิน (บาท)</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={r.id === selId ? 'sel' : undefined}>
                  <td>
                    <button type="button" className="rowbtn" aria-current={r.id === selId} onClick={() => setSelId(r.id)}>
                      {thaiDate(r.slip_date ?? r.created_at)} · {r.slip_time ?? '--:--'}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{r.ref ?? '-'}</td>
                  <td>{r.to_name ?? '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.to_bank ?? '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.category ?? '-'}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'verified'
                      ? <span className="badge ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>ตรวจแล้ว</span>
                      : <span className="badge warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v5M12 17h.01" /></svg>รอตรวจ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>รวม {shown.length} รายการ</td>
                <td className="num">฿{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {sel && (
        <aside aria-label="รายละเอียดฟิลด์ของสลิปที่เลือก" style={{ flex: '1 1 400px', maxWidth: 480, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2>ภาพสลิปต้นฉบับ</h2>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>ความมั่นใจในการอ่าน <strong>{sel.confidence ?? '-'}%</strong></span>
            </div>
            <div className="slip-view">
              {sel.mime_type === 'application/pdf'
                ? <a href={`/api/slips/${sel.id}/image`} target="_blank" rel="noreferrer">เปิดไฟล์ PDF</a>
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={`/api/slips/${sel.id}/image`} alt={`ภาพสลิป ${sel.file_name}`} />}
            </div>
          </section>

          <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h2>ฟิลด์ที่อ่านได้จากสลิป</h2>
              {sel.status === 'verified'
                ? <span className="badge ok">ตรวจแล้ว</span>
                : <span className="badge warn">รอตรวจ</span>}
            </div>

            {FIELDS.map((g) => (
              <fieldset key={g.title}>
                <legend>{g.title}</legend>
                <div className="field-grid">
                  {g.items.map((f) => {
                    const warn = lowConf && (f.key === 'to_name' || f.key === 'amount');
                    return (
                      <div key={f.key} className={`field${f.full ? ' full' : ''}${warn ? ' warn' : ''}`}>
                        <label htmlFor={`f-${f.key}`}>{f.label}</label>
                        {f.kind === 'category' ? (
                          <select id={`f-${f.key}`} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                            <option value="">-</option>
                            {[...new Set([...CATEGORIES, draft[f.key] ?? ''])].filter(Boolean).map((c) => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <input
                            id={`f-${f.key}`}
                            type={f.kind === 'date' ? 'date' : 'text'}
                            inputMode={f.key === 'amount' || f.key === 'fee' ? 'decimal' : undefined}
                            value={draft[f.key] ?? ''}
                            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                          />
                        )}
                        {warn && <div className="warn-text">ความมั่นใจต่ำ ตรวจกับภาพสลิปอีกครั้ง</div>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div role="status" aria-live="polite" style={{ minHeight: 24, fontSize: 14, color: 'var(--ink-2)' }}>{msg}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
              <button type="button" className="btn ghost small" disabled={busy} onClick={remove}>ลบสลิป</button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button type="button" className="btn ghost small" disabled={busy || !dirty} onClick={() => save()}>บันทึกการแก้ไข</button>
                {sel.status === 'pending' && (
                  <button type="button" className="btn" disabled={busy} onClick={() => save('verified')}>ยืนยันรายการนี้</button>
                )}
              </div>
            </div>
          </section>
        </aside>
      )}
    </div>
  );
}
