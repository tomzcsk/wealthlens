/**
 * Verification: replaceAllData ต้องเก็บบัญชีกับสมุดรายการ "คู่กันเสมอ"
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-replace-lockstep.ts
 *
 * บั๊ก: bankAccounts มี fallback (payload → migrate → local) แต่ bankTransactions
 * มาจาก ...data ตรง ๆ ไม่มี fallback. restore backup เก่าที่ไม่มี bankAccounts →
 * บัญชี fallback เป็น local (ยอดยังอยู่) แต่สมุดรายการกลายเป็น undefined →
 * บัญชีมียอดโดยไม่มีรายการรองรับ (invariant F40 พัง จากประตูหลัง)
 *
 * mergeData (exportImport.ts:590) ทำ lock-step ถูกแล้ว: สมุดมาจากแหล่งเดียวกับ
 * บัญชี. ไฟล์นี้ตรึงให้ replaceAllData ทำเหมือนกัน.
 */
import type { WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(a)} (expected ${JSON.stringify(b)})`);
};

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const run = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const s = useFinanceStore;

  const seedLocal = (): void =>
    s.setState((st) => ({
      data: {
        ...st.data,
        bankAccounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 1000 } } }],
        bankTransactions: [
          { id: 't1', accountId: 'a', year: 2026, month: 7, amount: 1000, label: 'ฝาก', source: { type: 'manual' } },
        ],
        years: {},
      } as WealthLensData,
    }));

  const d = () => s.getState().data;
  const txLen = (): number => (d().bankTransactions ?? []).length;
  const acctIds = (): string[] => (d().bankAccounts ?? []).map((a) => a.id);
  /** บัญชีที่มีเซลล์ยอด ≠ 0 แต่ไม่มี tx ในเซลล์นั้น = invariant พัง (นับเฉพาะเซลล์ที่ควรมีรายการ) */
  const orphanBalances = (): number => {
    const data = d();
    let bad = 0;
    for (const acc of data.bankAccounts ?? []) {
      for (const [y, months] of Object.entries(acc.balances)) {
        for (const [m, val] of Object.entries(months)) {
          if (val === 0) continue;
          const hasTx = (data.bankTransactions ?? []).some(
            (t) => t.accountId === acc.id && String(t.year) === y && String(t.month) === m,
          );
          // เซลล์ที่มียอดแต่ไม่มี tx: ยอมรับได้เฉพาะถ้า "ทั้งบัญชีไม่มี tx เลย"
          // (ยอดยกมาแบบ pre-F40) — แต่ถ้าบัญชีมี tx บางเซลล์ เซลล์นี้ที่หายคือบั๊ก
          const accountHasAnyTx = (data.bankTransactions ?? []).some((t) => t.accountId === acc.id);
          if (!hasTx && accountHasAnyTx) bad += 1;
        }
      }
    }
    return bad;
  };

  // ===================================================================
  // Task 1 — restore payload ก่อน F33 (ไม่มี bankAccounts/tx) → preserve คู่กัน
  // ===================================================================
  seedLocal();
  s.getState().replaceAllData({
    version: '1.0.0', lastUpdated: '2025-01-01T00:00:00.000Z',
    years: { '2025': { income: [], expenses: [], savings: [] } },
  } as WealthLensData);
  eq('payload ก่อน F33 → บัญชี local ยังอยู่', acctIds().join(','), 'a');
  eq('payload ก่อน F33 → สมุด local ยังอยู่ (ไม่หาย)', txLen(), 1);
  eq('payload ก่อน F33 → ไม่มีบัญชีมียอดแต่ไม่มีสมุด', orphanBalances(), 0);

  // ===================================================================
  // Task 2 — restore payload ใหม่ (มีทั้งบัญชีและสมุด) → เอาจาก payload ทั้งคู่
  // ===================================================================
  seedLocal();
  s.getState().replaceAllData({
    version: '1.0.0', lastUpdated: '2026-07-01T00:00:00.000Z',
    years: {},
    bankAccounts: [{ id: 'b', name: 'B', balances: { '2026': { '8': 500 } } }],
    bankTransactions: [
      { id: 't2', accountId: 'b', year: 2026, month: 8, amount: 500, label: 'ฝาก', source: { type: 'manual' } },
    ],
  } as WealthLensData);
  eq('payload ใหม่ → บัญชีจาก payload', acctIds().join(','), 'b');
  eq('payload ใหม่ → สมุดจาก payload', txLen(), 1);
  eq('payload ใหม่ → tx ชี้บัญชี b', (d().bankTransactions ?? [])[0]?.accountId, 'b');
  eq('payload ใหม่ → invariant ตรง', orphanBalances(), 0);

  // ===================================================================
  // Task 3 — payload มีบัญชีใหม่แต่ไม่มีสมุด (บัญชีเพิ่งสร้าง ยังไม่มีรายการ)
  //   → สมุดต้อง "ไม่ใช่ local เก่า" ไม่งั้นสมุดของบัญชีที่หายไปค้างกับบัญชีใหม่
  // ===================================================================
  seedLocal();
  s.getState().replaceAllData({
    version: '1.0.0', lastUpdated: '2026-07-01T00:00:00.000Z',
    years: {},
    bankAccounts: [{ id: 'c', name: 'C', balances: {} }],
  } as WealthLensData);
  eq('payload บัญชีใหม่ไม่มีสมุด → บัญชีจาก payload', acctIds().join(','), 'c');
  eq('payload บัญชีใหม่ไม่มีสมุด → สมุดเก่าไม่ค้าง (0 บรรทัด)', txLen(), 0);
  const danglingT3 = (d().bankTransactions ?? []).filter(
    (t) => !(d().bankAccounts ?? []).some((a) => a.id === t.accountId),
  ).length;
  eq('payload บัญชีใหม่ไม่มีสมุด → ไม่มี tx กำพร้าชี้บัญชีเก่า', danglingT3, 0);

  // ===================================================================
  // Task 4 — payload พัง: มีสมุดผีแต่ไม่มีบัญชี (และไม่มี keptBalances)
  //   `...data` spread ต้องไม่พาสมุดผีเข้ามาค้าง
  // ===================================================================
  s.setState((st) => ({
    data: { ...st.data, bankAccounts: undefined, bankTransactions: undefined, years: {} } as WealthLensData,
  }));
  s.getState().replaceAllData({
    version: '1.0.0', lastUpdated: '2026-07-01T00:00:00.000Z', years: {},
    bankTransactions: [
      { id: 'ghost', accountId: 'nowhere', year: 2026, month: 7, amount: 500, label: 'ผี', source: { type: 'manual' } },
    ],
  } as WealthLensData);
  const danglingT4 = (d().bankTransactions ?? []).filter(
    (t) => !(d().bankAccounts ?? []).some((a) => a.id === t.accountId),
  ).length;
  eq('payload สมุดผีไม่มีบัญชี → ไม่พาสมุดผีเข้ามา', danglingT4, 0);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
