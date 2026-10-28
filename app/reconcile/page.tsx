import ReconcileClient from '@/components/ReconcileClient';
import { listStatements, loadItems } from '@/lib/reconcile';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ statement?: string }> }) {
  const sp = await searchParams;
  const statements = await listStatements();
  const statement = statements.find((s) => s.id === sp.statement) ?? statements[0] ?? null;
  const items = statement?.matched_at ? await loadItems(statement.id) : [];

  return (
    <main className="page">
      <div className="head-row">
        <div>
          <h1>ตรวจรายการจับคู่</h1>
          <p className="sub">อัปโหลด Statement จับคู่กับสลิปที่อ่านไว้ แล้วให้ admin ยืนยันผลขั้นสุดท้าย</p>
        </div>
      </div>
      <ReconcileClient
        key={`${statement?.id ?? 'none'}:${statement?.matched_at ?? ''}`}
        statements={statements}
        statement={statement}
        items={items}
      />
    </main>
  );
}
