import Link from 'next/link';
import { admin } from '@/lib/supabase';
import { money, thaiDate, thaiMonth } from '@/lib/format';
import { CATEGORIES, type Slip } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Search = { month?: string; bank?: string; category?: string };

function group(slips: Slip[], key: 'category' | 'to_name') {
  const m = new Map<string, { count: number; value: number }>();
  for (const s of slips) {
    const k = s[key] || 'ไม่ระบุ';
    const g = m.get(k) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += s.amount ?? 0;
    m.set(k, g);
  }
  return [...m.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.value - a.value);
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { data, error } = await admin()
    .from('slips')
    .select('*')
    .eq('extract_status', 'done')
    .order('slip_date', { ascending: false, nullsFirst: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  const all = (data ?? []) as Slip[];
  const day = (s: Slip) => (s.slip_date ?? s.created_at).slice(0, 10);
  const months = [...new Set(all.map((s) => day(s).slice(0, 7)))].sort().reverse();
  const month = sp.month && months.includes(sp.month) ? sp.month : months[0];
  const banks = [...new Set(all.map((s) => s.from_bank).filter(Boolean))] as string[];

  const slips = all.filter(
    (s) => day(s).slice(0, 7) === month && (!sp.bank || s.from_bank === sp.bank) && (!sp.category || s.category === sp.category),
  );

  const total = slips.reduce((a, s) => a + (s.amount ?? 0), 0);
  const fee = slips.reduce((a, s) => a + (s.fee ?? 0), 0);
  const pending = slips.filter((s) => s.status === 'pending').length;
  const top = slips.reduce<Slip | null>((m, s) => (!m || (s.amount ?? 0) > (m.amount ?? 0) ? s : m), null);

  const bins = [[1, 7], [8, 14], [15, 21], [22, 31]].map(([a, b]) => {
    const rs = slips.filter((s) => { const d = Number(day(s).slice(8, 10)); return d >= a && d <= b; });
    return { range: `${a}–${b}`, value: rs.reduce((x, s) => x + (s.amount ?? 0), 0), count: rs.length };
  });
  const wmax = Math.max(1, ...bins.map((b) => b.value));
  const cats = group(slips, 'category');
  const bks = group(slips, 'to_name').slice(0, 8);
  const cmax = Math.max(1, ...cats.map((c) => c.value));
  const bmax = Math.max(1, ...bks.map((c) => c.value));

  return (
    <main className="page">
      <div className="head-row">
        <div>
          <h1>ภาพรวมยอดสลิป</h1>
          <p className="sub">สรุปยอดรวมจากสลิปที่อัปโหลดและอ่านข้อมูลแล้ว</p>
        </div>
        <form method="get" className="filters">
          <div>
            <label htmlFor="flt-month">ช่วงเวลา</label>
            <select id="flt-month" name="month" defaultValue={month} className="filters-select">
              {months.map((m) => <option key={m} value={m}>{thaiMonth(m)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="flt-bank">ธนาคารผู้โอน</label>
            <select id="flt-bank" name="bank" defaultValue={sp.bank ?? ''}>
              <option value="">ทุกธนาคาร</option>
              {banks.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="flt-cat">หมวดหมู่</label>
            <select id="flt-cat" name="category" defaultValue={sp.category ?? ''}>
              <option value="">ทุกหมวดหมู่</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" className="btn small">แสดงผล</button>
        </form>
      </div>

      {!month || !slips.length ? (
        <section className="card empty">
          <p>ยังไม่มีข้อมูลสลิปในช่วงที่เลือก</p>
          <Link href="/" className="btn">ไปอัปโหลดสลิป</Link>
        </section>
      ) : (
        <>
          <section className="kpis" aria-label="ตัวเลขสรุป">
            <div className="kpi main">
              <div className="lbl">ยอดรวมทั้งหมด</div>
              <div className="val">฿{money(total)}</div>
              <div className="note">{thaiMonth(month)} · ไม่รวมค่าธรรมเนียม ฿{money(fee)}</div>
            </div>
            <div className="kpi">
              <div className="lbl">จำนวนสลิป</div>
              <div className="val">{slips.length} <small>ใบ</small></div>
              <div className="note">เฉลี่ย ฿{money(total / slips.length)} ต่อใบ</div>
            </div>
            <div className="kpi">
              <div className="lbl">รายการสูงสุด</div>
              <div className="val">฿{money(top?.amount)}</div>
              <div className="note">{top?.to_name ?? '-'} · {thaiDate(top ? day(top) : null)}</div>
            </div>
            <div className="kpi alert">
              <div className="lbl">รอตรวจสอบ</div>
              <div className="val">{pending} <small>ใบ</small></div>
              <Link href="/review" className="note">ไปตรวจรายการ</Link>
            </div>
          </section>

          <div className="grid2">
            <section className="card" aria-label="ยอดรวมรายสัปดาห์">
              <h2>ยอดรวมรายสัปดาห์</h2>
              <p className="hint">หน่วย: บาท · แบ่งตามวันที่ในเดือน</p>
              <div className="vbars">
                {bins.map((b) => (
                  <div className="vbar" key={b.range} title={`วันที่ ${b.range}: ${money(b.value)} บาท (${b.count} ใบ)`}>
                    <div className="v">{b.value ? money(b.value).replace(/\.00$/, '') : '-'}</div>
                    <div className="b" style={{ height: b.value ? Math.max(4, Math.round((b.value / wmax) * 160)) : 0 }} />
                  </div>
                ))}
              </div>
              <div className="vlabels">{bins.map((b) => <div key={b.range}>วันที่ {b.range}</div>)}</div>
            </section>

            <section className="card" aria-label="ยอดรวมตามหมวดหมู่">
              <h2>ยอดรวมตามหมวดหมู่</h2>
              <p className="hint">เรียงจากมากไปน้อย · หน่วย: บาท</p>
              <div className="hbars">
                {cats.map((c) => (
                  <div className="hbar" key={c.name} title={`${c.name}: ${money(c.value)} บาท (${c.count} ใบ)`}>
                    <div className="top">
                      <span>{c.name}</span>
                      <span><strong>{money(c.value)}</strong> <span className="m">· {((c.value / total) * 100).toFixed(1)}%</span></span>
                    </div>
                    <div className="track"><div style={{ width: `${Math.max(2, Math.round((c.value / cmax) * 100))}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid2">
            <section className="card" aria-label="ยอดรวมตามผู้รับ">
              <h2>ยอดรวมตามผู้รับ</h2>
              <p className="hint">สูงสุด 8 ราย · จำนวนสลิป และยอดเงิน (บาท)</p>
              <div className="hbars">
                {bks.map((c) => (
                  <div className="hbar" key={c.name} title={`${c.name}: ${money(c.value)} บาท (${c.count} ใบ)`}>
                    <div className="top">
                      <span>{c.name} <span className="m">({c.count} ใบ)</span></span>
                      <strong>{money(c.value)}</strong>
                    </div>
                    <div className="track"><div style={{ width: `${Math.max(2, Math.round((c.value / bmax) * 100))}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card latest" aria-label="สลิปล่าสุด" style={{ flex: '1.5 1 520px' }}>
              <div className="tl">
                <h2>สลิปล่าสุด</h2>
                <Link href="/review">ดูทั้งหมด</Link>
              </div>
              <div className="tbl-wrap">
                <table style={{ minWidth: 520 }}>
                  <thead>
                    <tr><th scope="col">วันที่</th><th scope="col">ผู้รับ</th><th scope="col">หมวดหมู่</th><th scope="col" className="num">จำนวนเงิน (บาท)</th></tr>
                  </thead>
                  <tbody>
                    {slips.slice(0, 5).map((s) => (
                      <tr key={s.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{thaiDate(day(s))}</td>
                        <td>{s.to_name ?? '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{s.category ?? '-'}</td>
                        <td className="num">{money(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
