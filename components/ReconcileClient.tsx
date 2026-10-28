'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ISSUE_KINDS, type AdminStatus, type MatchItem, type MatchKind, type Statement } from '@/lib/types';
import { money, thaiDate } from '@/lib/format';

const KIND: Record<MatchKind, { label: string; cls: string; icon: string }> = {
  matched: { label: 'จับคู่ได้', cls: 'ok', icon: 'M5 12l5 5L20 7' },
  diff: { label: 'ยอดไม่ตรง', cls: 'warn', icon: 'M5 9h14M5 15h14' },
  no_slip: { label: 'ไม่พบสลิป', cls: 'warn', icon: 'M12 8v5M12 17h.01' },
  no_stmt: { label: 'ไม่พบใน Statement', cls: 'warn', icon: 'M12 8v5M12 17h.01' },
  out: { label: 'นอกช่วง Statement', cls: 'wait', icon: 'M6 12h12' },
};
const ADM: Record<AdminStatus, { label: string; cls: string }> = {
  pending: { label: 'รอ admin', cls: 'wait' },
  approved: { label: 'ยืนยันแล้ว', cls: 'ok' },
  flagged: { label: 'ส่งตรวจต่อ', cls: 'warn' },
  na: { label: 'ไม่ต้องตรวจ', cls: 'plain' },
};
const isIssue = (k: MatchKind) => ISSUE_KINDS.includes(k);
const num = (n: number | string | null | undefined) => Number(n ?? 0);

type Phase = 'idle' | 'uploading' | 'parsing' | 'failed';
type Filter = 'all' | 'issue' | 'matched';

async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'ผิดพลาด');
  return j as T;
}

export default function ReconcileClient({ statements, statement, items: initial }: { statements: Statement[]; statement: Statement | null; items: MatchItem[] }) {
  const router = useRouter();
  const st = statement;

  // ---- อัปโหลด Statement
  const [phase, setPhase] = useState<Phase>('idle');
  const [upErr, setUpErr] = useState('');
  const [fileName, setFileName] = useState('');
  const [password, setPassword] = useState('');
  const [over, setOver] = useState(false);
  const pending = useRef<File | null>(null);

  async function upload(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setPhase('failed'); setUpErr('รองรับเฉพาะไฟล์ PDF'); return; }
    if (file.size > 20 * 1024 * 1024) { setPhase('failed'); setUpErr('ไฟล์ใหญ่เกิน 20 MB'); return; }
    pending.current = file;
    setFileName(file.name);
    setUpErr('');
    try {
      setPhase('uploading');
      const init = await api<{ id: string; path: string; token: string }>('/api/statements', { file_name: file.name, content_type: 'application/pdf' });
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const up = await sb.storage.from('slips').uploadToSignedUrl(init.path, init.token, file, { contentType: 'application/pdf' });
      if (up.error) throw new Error(up.error.message);
      setPhase('parsing');
      await api(`/api/statements/${init.id}/parse`, { password: password || undefined });
      setPhase('idle');
      router.push(`/reconcile?statement=${init.id}`);
      router.refresh();
    } catch (e) {
      setPhase('failed');
      setUpErr(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
    }
  }

  // ---- ตั้งค่า + จับคู่
  const [dayTol, setDayTol] = useState(String(st?.day_tol ?? 1));
  const [amtTol, setAmtTol] = useState(String(st?.amt_tol ?? 0));
  const [includeFee, setIncludeFee] = useState(st?.include_fee ?? true);
  const [matching, setMatching] = useState(false);
  const [matchErr, setMatchErr] = useState('');

  // ---- ผลจับคู่ + admin
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [selId, setSelId] = useState<string | undefined>(initial.find((i) => isIssue(i.kind))?.id ?? initial[0]?.id);
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((i) => [i.id, i.admin_note ?? ''])));
  const [finalized, setFinalized] = useState(!!st?.finalized_at);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const issues = items.filter((i) => isIssue(i.kind));
  const pendingIssues = issues.filter((i) => i.admin_status === 'pending');
  const [modalOpen, setModalOpen] = useState(initial.some((i) => isIssue(i.kind) && i.admin_status === 'pending') && !st?.finalized_at);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!modalOpen) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const shown = useMemo(() => items.filter((i) => filter === 'all' || (filter === 'issue' ? isIssue(i.kind) : i.kind === 'matched')), [items, filter]);
  const sel = items.find((i) => i.id === selId);

  const need = items.filter((i) => i.admin_status !== 'na');
  const done = items.filter((i) => i.admin_status === 'approved' || i.admin_status === 'flagged').length;
  const left = need.length - done;
  const matchedCount = items.filter((i) => i.kind === 'matched').length;
  const stTotal = items.reduce((s, i) => s + (i.row ? num(i.row.amount) : 0), 0);
  const slipTotal = items.reduce((s, i) => s + (i.slip && i.kind !== 'out' ? num(i.slip.amount) : 0), 0);
  const bulk = items.filter((i) => i.kind === 'matched' && i.admin_status === 'pending').length;

  function patchItem(id: string, p: Partial<MatchItem>) { setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))); }

  async function startMatch() {
    if (!st) return;
    if (items.some((i) => i.admin_status === 'approved' || i.admin_status === 'flagged') && !window.confirm('จับคู่ใหม่จะล้างผลที่ admin ตรวจไว้ทั้งหมด ต้องการทำต่อหรือไม่?')) return;
    setMatching(true); setMatchErr('');
    try {
      await api(`/api/statements/${st.id}/match`, { dayTol: Number(dayTol), amtTol: Number(amtTol), includeFee });
      router.replace(`/reconcile?statement=${st.id}`);
      router.refresh();
    } catch (e) {
      setMatchErr(e instanceof Error ? e.message : 'จับคู่ไม่สำเร็จ');
    } finally { setMatching(false); }
  }

  async function act(status: 'approved' | 'flagged' | 'pending') {
    if (!sel) return;
    setBusy(true); setMsg('');
    try {
      const r = await api<{ match: { admin_status: AdminStatus; admin_note: string | null; decided_at: string | null } }>(`/api/matches/${sel.id}`, { admin_status: status, admin_note: notes[sel.id] ?? '' }, 'PATCH');
      patchItem(sel.id, r.match);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'ผิดพลาด'); }
    finally { setBusy(false); }
  }

  async function approveMatched() {
    if (!st) return;
    setBusy(true); setMsg('');
    try {
      const r = await api<{ updated: string[] }>(`/api/statements/${st.id}/approve-matched`);
      const set = new Set(r.updated);
      setItems((xs) => xs.map((x) => (set.has(x.id) ? { ...x, admin_status: 'approved' as AdminStatus } : x)));
    } catch (e) { setMsg(e instanceof Error ? e.message : 'ผิดพลาด'); }
    finally { setBusy(false); }
  }

  async function finalize() {
    if (!st) return;
    setBusy(true); setMsg('');
    try { await api(`/api/statements/${st.id}/finalize`); setFinalized(true); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'ผิดพลาด'); }
    finally { setBusy(false); }
  }

  function reviewIssues() {
    setModalOpen(false); setFilter('issue');
    const first = issues.find((i) => i.admin_status === 'pending') ?? issues[0];
    if (first) setSelId(first.id);
  }

  // ---- ข้อความอธิบายผลเทียบของรายการที่เลือก
  const detail = (() => {
    if (!sel) return null;
    const row = sel.row; const slip = sel.slip;
    const fee = num(slip?.fee);
    let gap: number | null = null;
    if (row && slip) {
      const plain = num(row.amount) - num(slip.amount);
      const withFee = num(row.amount) - (num(slip.amount) + fee);
      gap = st?.include_fee !== false && fee > 0 && Math.abs(withFee) < Math.abs(plain) ? withFee : plain;
      gap = Math.round(gap * 100) / 100;
    }
    const reason: Record<MatchKind, string> = {
      matched: slip && fee > 0 && gap === 0 && Math.abs(num(row?.amount) - num(slip.amount)) > 0.001 ? `วันที่ตรงกัน และยอดตรงกันเมื่อรวมค่าธรรมเนียมในสลิป ฿${money(fee)}` : 'วันที่และจำนวนเงินตรงกัน',
      diff: `พบทั้งสองฝั่งแต่จำนวนเงินต่างกัน Statement ${gap !== null && gap < 0 ? 'ต่ำกว่า' : 'สูงกว่า'}สลิป ฿${money(Math.abs(gap ?? 0))}`,
      no_slip: 'มีรายการเงินออกใน Statement แต่ไม่พบสลิปที่วันที่และยอดตรงกัน',
      no_stmt: `มีสลิปแต่ไม่พบรายการใน Statement ภายในช่วงวันที่ที่ตั้งไว้ (±${st?.day_tol ?? 1} วัน)`,
      out: `วันที่ของสลิปอยู่นอกช่วง Statement (${thaiDate(st?.period_start)} – ${thaiDate(st?.period_end)}) จะนำไปจับคู่ในงวดถัดไป`,
    };
    return { row, slip, fee, gap, reason: reason[sel.kind] };
  })();
  const note = sel ? notes[sel.id] ?? '' : '';
  const needNote = !!sel && isIssue(sel.kind) && !note.trim();

  const busyUp = phase === 'uploading' || phase === 'parsing';

  return (
    <>
      {/* ---------- อัปโหลด Statement ---------- */}
      <section className="card pad" aria-label="อัปโหลด Statement เพื่อกระทบยอด" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px 24px' }}>
          <div>
            <h2 style={{ fontSize: 20 }}>กระทบยอดกับ Statement (PDF)</h2>
            <p className="hint" style={{ margin: 0 }}>อัปโหลด statement จากธนาคาร ระบบจะจับคู่กับสลิปที่อ่านไว้ แล้วส่งให้ admin ตรวจสอบ</p>
          </div>
          {statements.length > 1 && (
            <div className="field" style={{ minWidth: 240 }}>
              <label htmlFor="stsel">Statement ที่แสดง</label>
              <select id="stsel" value={st?.id ?? ''} onChange={(e) => router.push(`/reconcile?statement=${e.target.value}`)}>
                {statements.map((s) => <option key={s.id} value={s.id}>{s.file_name} · {thaiDate(s.created_at)}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
          <div
            className={`drop${over ? ' over' : ''}`}
            style={{ flex: '1 1 320px', minWidth: 0, padding: 24 }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
          >
            <div className="big" style={{ fontSize: 18 }}>ลากไฟล์ Statement (PDF) มาวางที่นี่</div>
            <input className="sr" type="file" id="stmtfile" accept="application/pdf" disabled={busyUp} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <label htmlFor="stmtfile" className="btn" style={{ minHeight: 44 }}>{busyUp ? (phase === 'uploading' ? 'กำลังอัปโหลด…' : 'กำลังอ่าน Statement…') : 'เลือกไฟล์ PDF'}</label>
            <div className="small">PDF ที่ดาวน์โหลดจากแอปหรือเว็บธนาคาร (ไม่ใช่ภาพสแกน) · ไม่เกิน 20 MB</div>
            <div className="field" style={{ width: '100%', maxWidth: 280, textAlign: 'left' }}>
              <label htmlFor="pdfpass">รหัสผ่านไฟล์ PDF (ถ้ามี)</label>
              <input id="pdfpass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {phase === 'failed' && (
              <div role="alert" style={{ color: 'var(--amber-fg)', fontSize: 14, background: 'var(--amber-bg)', padding: '8px 12px', borderRadius: 8, textAlign: 'left' }}>
                {upErr}
                {pending.current && <> <button type="button" className="rowbtn" style={{ minHeight: 32, marginLeft: 8, fontWeight: 600 }} onClick={() => pending.current && void upload(pending.current)}>ลองใหม่{fileName ? ` (${fileName})` : ''}</button></>}
              </div>
            )}
          </div>

          {st && (
            <div style={{ flex: '1.5 1 420px', minWidth: 0, background: 'var(--ground)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px', marginBottom: 16 }}>
                <div className="thumb" aria-hidden="true">PDF</div>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{st.file_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 14 }}>อัปโหลดเมื่อ {thaiDate(st.created_at)}</div>
                </div>
                <span className="badge ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>อ่าน Statement สำเร็จ</span>
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 24px' }}>
                <div><dt style={{ fontSize: 14, color: 'var(--muted)' }}>ธนาคาร · เลขบัญชี</dt><dd style={{ margin: 0, fontWeight: 500 }}>{st.bank ?? 'ไม่ระบุ'}{st.acc_last4 ? ` · xxx-x-x${st.acc_last4}-x` : ''}</dd></div>
                <div><dt style={{ fontSize: 14, color: 'var(--muted)' }}>ช่วงเวลา</dt><dd style={{ margin: 0, fontWeight: 500 }}>{thaiDate(st.period_start)} – {thaiDate(st.period_end)}</dd></div>
                <div><dt style={{ fontSize: 14, color: 'var(--muted)' }}>รายการเงินออก</dt><dd style={{ margin: 0, fontWeight: 500 }}>{st.out_count ?? 0} รายการ</dd></div>
                <div><dt style={{ fontSize: 14, color: 'var(--muted)' }}>ยอดเงินออกรวม</dt><dd style={{ margin: 0, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>฿{money(num(st.out_total))}</dd></div>
              </dl>
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted)' }}>รายการเงินเข้าไม่ถูกนำมาเทียบกับสลิป</p>
            </div>
          )}
        </div>

        {st && (
          <>
            <details style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>ตั้งค่าการจับคู่</summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', padding: '8px 0 4px', alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '0 1 240px' }}>
                  <label htmlFor="daytol">วันที่ต่างกันได้ไม่เกิน</label>
                  <select id="daytol" value={dayTol} onChange={(e) => setDayTol(e.target.value)}>
                    <option value="0">ตรงวันเดียวกัน</option><option value="1">±1 วัน</option><option value="2">±2 วัน</option>
                  </select>
                </div>
                <div className="field" style={{ flex: '0 1 280px' }}>
                  <label htmlFor="amttol">จำนวนเงิน</label>
                  <select id="amttol" value={amtTol} onChange={(e) => setAmtTol(e.target.value)}>
                    <option value="0">ตรงกันทุกสตางค์</option><option value="1">ต่างกันได้ไม่เกิน ฿1.00</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                  <input type="checkbox" checked={includeFee} onChange={(e) => setIncludeFee(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
                  นับค่าธรรมเนียมในสลิปรวมกับยอดโอน
                </label>
              </div>
            </details>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 560 }}>
                {matchErr ? <span style={{ color: 'var(--amber-fg)' }}>{matchErr}</span> : 'ถ้ามีรายการไม่ตรงกัน ระบบจะแจ้งเตือน admin ทันทีเมื่อเปิดผลจับคู่'}
              </div>
              <button type="button" className="btn" disabled={matching || finalized} onClick={startMatch}>
                {matching ? 'กำลังจับคู่…' : st.matched_at ? 'จับคู่ใหม่กับสลิป' : 'เริ่มจับคู่กับสลิป'}
              </button>
            </div>
          </>
        )}
      </section>

      {!st && (
        <section className="card empty"><p>ยังไม่มี Statement ให้กระทบยอด อัปโหลดไฟล์ PDF จากธนาคารด้านบนเพื่อเริ่มต้น</p></section>
      )}

      {/* ---------- ผลจับคู่ ---------- */}
      {st?.matched_at && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p className="sub" style={{ fontSize: 16 }}>{st.bank ?? 'Statement'}{st.acc_last4 ? ` xxx-x-x${st.acc_last4}-x` : ''} · {thaiDate(st.period_start)} – {thaiDate(st.period_end)}</p>
            <button type="button" className="btn ghost" onClick={() => setModalOpen(true)} style={{ borderColor: 'var(--amber-line)', background: '#fff8e6', color: '#5a3a00' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              แจ้งเตือน ({issues.length})
            </button>
          </div>

          {finalized && (
            <div role="status" style={{ background: 'var(--accent-soft)', border: '1px solid #8cbfb4', borderRadius: 12, padding: '16px 20px', color: 'var(--accent-dark)', fontWeight: 600 }}>
              Admin ยืนยันผลขั้นสุดท้ายแล้ว · ผ่าน {items.filter((i) => i.admin_status === 'approved').length} รายการ · ส่งตรวจต่อ {items.filter((i) => i.admin_status === 'flagged').length} รายการ
            </div>
          )}

          <section className="kpis" aria-label="สรุปผลจับคู่">
            <div className="kpi">
              <div className="lbl">จับคู่ได้</div>
              <div className="val">{matchedCount} <small>จาก {items.length} รายการ</small></div>
              <div className="note">ยอดและวันที่ตรงกัน</div>
            </div>
            <div className="kpi alert">
              <div className="lbl">ไม่ตรงกัน ต้องตรวจ</div>
              <div className="val">{issues.length} <small>รายการ</small></div>
              <div className="note" style={{ color: '#5a3a00' }}>ยอดไม่ตรง {items.filter((i) => i.kind === 'diff').length} · ไม่พบสลิป {items.filter((i) => i.kind === 'no_slip').length} · ไม่พบใน Statement {items.filter((i) => i.kind === 'no_stmt').length}</div>
            </div>
            <div className="kpi" style={{ flex: '1.3 1 300px' }}>
              <div className="lbl">เทียบยอดรวม (ในช่วง Statement)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', margin: '8px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
                <div><div style={{ fontSize: 13, color: 'var(--muted)' }}>Statement</div><div style={{ fontSize: 20, fontWeight: 700 }}>฿{money(stTotal)}</div></div>
                <div><div style={{ fontSize: 13, color: 'var(--muted)' }}>สลิป</div><div style={{ fontSize: 20, fontWeight: 700 }}>฿{money(slipTotal)}</div></div>
                <div><div style={{ fontSize: 13, color: 'var(--muted)' }}>ส่วนต่าง</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber-fg)' }}>฿{money(Math.abs(stTotal - slipTotal))}</div></div>
              </div>
              <div className="note">ไม่นับสลิปที่อยู่นอกช่วง Statement</div>
            </div>
          </section>

          <section className="card" aria-label="การยืนยันของ admin" style={{ padding: '20px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 32px' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15, marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>Admin ตรวจแล้ว {done} จาก {need.length} รายการ</span>
                <span style={{ color: 'var(--muted)' }}>เหลือ {left}</span>
              </div>
              <div className="bar" role="progressbar" aria-label="ความคืบหน้าการตรวจของ admin" aria-valuemin={0} aria-valuemax={need.length} aria-valuenow={done}>
                <div style={{ width: `${need.length ? Math.round((done / need.length) * 100) : 0}%` }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button type="button" className="btn ghost" disabled={bulk === 0 || finalized || busy} onClick={approveMatched}>ยืนยันที่จับคู่ได้ทั้งหมด ({bulk})</button>
              <button type="button" className="btn" disabled={left > 0 || finalized || busy} onClick={finalize}>ยืนยันผลขั้นสุดท้าย</button>
            </div>
            {left > 0 && <div style={{ flex: '1 1 100%', fontSize: 14, color: 'var(--muted)' }}>กดยืนยันผลขั้นสุดท้ายได้เมื่อ admin ตรวจครบทุกรายการ (ยืนยัน หรือส่งตรวจต่อพร้อมเหตุผล)</div>}
            {msg && <div role="alert" style={{ flex: '1 1 100%', fontSize: 14, color: 'var(--amber-fg)' }}>{msg}</div>}
          </section>

          <div className="cols">
            <section className="card" aria-label="ตารางผลจับคู่" style={{ flex: '999 1 640px', minWidth: 0, overflow: 'hidden' }}>
              <div className="toolbar">
                <h2 style={{ fontSize: 20 }}>รายการทั้งหมด</h2>
                <div role="group" aria-label="กรองผลจับคู่" className="chips">
                  {([['all', `ทั้งหมด (${items.length})`], ['issue', `ไม่ตรงกัน (${issues.length})`], ['matched', `จับคู่ได้ (${matchedCount})`]] as [Filter, string][]).map(([k, label]) => (
                    <button key={k} type="button" className="filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="tbl-wrap">
                <table style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th scope="col">วันที่</th><th scope="col">Statement</th><th scope="col" className="num">ยอด Statement</th>
                      <th scope="col">สลิป</th><th scope="col" className="num">ยอดสลิป</th><th scope="col">ผลจับคู่</th><th scope="col">Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((i) => {
                      const k = KIND[i.kind]; const a = ADM[i.admin_status];
                      return (
                        <tr key={i.id} className={i.id === selId ? 'sel' : undefined}>
                          <td><button type="button" className="rowbtn" aria-current={i.id === selId} onClick={() => setSelId(i.id)}>{thaiDate(i.sort_date)}</button></td>
                          <td>{i.row?.description || (i.row ? 'รายการเงินออก' : '—')}</td>
                          <td className="num" style={{ fontWeight: 400 }}>{i.row ? money(num(i.row.amount)) : '—'}</td>
                          <td>{i.slip?.to_name ?? '—'}</td>
                          <td className="num" style={{ fontWeight: 400 }}>{i.slip ? money(num(i.slip.amount)) : '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className={`badge ${k.cls}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={k.icon} /></svg>{k.label}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}><span className={`badge ${a.cls}`}>{a.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {sel && detail && (
              <aside aria-label="รายละเอียดการเทียบรายการที่เลือก" style={{ flex: '1 1 420px', maxWidth: 500, minWidth: 0 }}>
                <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <h2>เทียบ Statement กับสลิป · {thaiDate(sel.sort_date)}</h2>
                    <span className={`badge ${KIND[sel.kind].cls}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={KIND[sel.kind].icon} /></svg>{KIND[sel.kind].label}</span>
                  </div>
                  <p style={{ color: 'var(--ink-2)' }}>{detail.reason}</p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: '1 1 180px', minWidth: 0, background: 'var(--ground)', borderRadius: 12, padding: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Statement</div>
                      {detail.row ? (
                        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15 }}>
                          <div><dt style={{ fontSize: 13, color: 'var(--muted)' }}>รายการ</dt><dd style={{ margin: 0 }}>{detail.row.description || '—'}{detail.row.tx_time ? ` · ${detail.row.tx_time}` : ''}</dd></div>
                          <div><dt style={{ fontSize: 13, color: 'var(--muted)' }}>จำนวนเงินออก</dt><dd style={{ margin: 0, fontWeight: 700 }}>฿{money(num(detail.row.amount))}</dd></div>
                        </dl>
                      ) : <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed #8ca39b', borderRadius: 8, fontSize: 14 }}>ไม่พบรายการใน Statement</div>}
                    </div>
                    <div style={{ flex: '1 1 180px', minWidth: 0, background: 'var(--ground)', borderRadius: 12, padding: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>สลิป</div>
                      {detail.slip ? (
                        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15 }}>
                          <div><dt style={{ fontSize: 13, color: 'var(--muted)' }}>ผู้รับ · เวลา</dt><dd style={{ margin: 0 }}>{detail.slip.to_name ?? '—'} · {detail.slip.slip_time ?? '--:--'}</dd></div>
                          <div><dt style={{ fontSize: 13, color: 'var(--muted)' }}>จำนวนเงิน + ค่าธรรมเนียม</dt><dd style={{ margin: 0, fontWeight: 700 }}>฿{money(num(detail.slip.amount))} + ฿{money(detail.fee)}</dd></div>
                          <div><dt style={{ fontSize: 13, color: 'var(--muted)' }}>เลขที่อ้างอิง · ความมั่นใจ</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{detail.slip.ref ?? '—'} · {detail.slip.confidence ?? '-'}%</dd></div>
                        </dl>
                      ) : <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed #8ca39b', borderRadius: 8, fontSize: 14 }}>ไม่พบสลิปที่ตรงกัน</div>}
                    </div>
                  </div>

                  {detail.gap !== null && detail.gap !== 0 && (
                    <div style={{ background: '#fff8e6', border: '1px solid #e8cf94', borderRadius: 10, padding: '10px 14px', color: '#5a3a00' }}>ส่วนต่าง <strong>{detail.gap > 0 ? '+' : '−'}{money(Math.abs(detail.gap))}</strong> บาท</div>
                  )}

                  <div className="field">
                    <label htmlFor="adminnote">บันทึกของ admin{isIssue(sel.kind) ? ' (จำเป็นสำหรับรายการที่ไม่ตรง)' : ' (ไม่บังคับ)'}</label>
                    <textarea id="adminnote" rows={3} value={note} disabled={finalized || sel.admin_status === 'na'} onChange={(e) => setNotes({ ...notes, [sel.id]: e.target.value })} />
                    {needNote && sel.admin_status === 'pending' && <div className="warn-text" style={{ color: 'var(--amber-fg)', fontSize: 13, marginTop: 4 }}>ต้องบันทึกเหตุผลก่อนยืนยันรายการที่ไม่ตรงกัน</div>}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' }}>
                    {sel.admin_status === 'pending' && !finalized && (
                      <>
                        <button type="button" className="btn ghost" disabled={busy} onClick={() => act('flagged')}>ส่งตรวจต่อ</button>
                        <button type="button" className="btn" disabled={busy || needNote} onClick={() => act('approved')}>ยืนยันรายการนี้</button>
                      </>
                    )}
                    {(sel.admin_status === 'approved' || sel.admin_status === 'flagged') && !finalized && (
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => act('pending')}>ยกเลิกการตรวจ ({ADM[sel.admin_status].label})</button>
                    )}
                    {sel.admin_status === 'na' && <div style={{ color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>รายการนี้ไม่ต้องให้ admin ยืนยันในงวดนี้</div>}
                  </div>
                </section>
              </aside>
            )}
          </div>
        </>
      )}

      {/* ---------- popup แจ้งเตือนรายการไม่ตรง ---------- */}
      {modalOpen && issues.length > 0 && (
        <div className="modal-bg">
          <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-desc" className="modal">
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 'none', width: 48, height: 48, borderRadius: '50%', background: 'var(--amber-bg)', color: 'var(--amber-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>
              </div>
              <div>
                <h2 id="alert-title" style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>พบ {issues.length} รายการที่ไม่ตรงกับ Statement</h2>
                <p id="alert-desc" style={{ color: 'var(--ink-2)' }}>Admin ต้องตรวจและยืนยันรายการเหล่านี้ก่อนปิดงวด{pendingIssues.length < issues.length ? ` (ตรวจแล้ว ${issues.length - pendingIssues.length})` : ''}</p>
              </div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {issues.map((i) => (
                <li key={i.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', padding: '10px 14px', borderRadius: 10, background: 'var(--ground)' }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{thaiDate(i.sort_date)}</span>
                  <span style={{ flex: '1 1 160px', minWidth: 0 }}>{i.row?.description || (i.slip ? `สลิป ${i.slip.to_name ?? ''}` : 'รายการเงินออก')}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(num(i.row?.amount ?? i.slip?.amount))}</span>
                  <span className="badge warn" style={{ fontSize: 13 }}>{KIND[i.kind].label}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setModalOpen(false)}>ปิดไว้ก่อน</button>
              <button type="button" ref={primaryRef} className="btn" onClick={reviewIssues}>ตรวจรายการที่ไม่ตรง</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
