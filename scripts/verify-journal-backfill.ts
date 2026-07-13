/**
 * Verification for F41 — journal backfill.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts
 *
 * กฎเหล็ก: ยอดทุกบัญชี "ก่อน" ต้องเท่ากับ "หลัง" ทุกเคส — เครื่องมือนี้เขียน
 * คำอธิบายให้ยอดที่มีอยู่ ไม่ใช่เพิ่มเงิน.
 */
import { findLedgerMismatches, type BankLedger } from '../src/utils/bankMovements';
import {
  buildBackfillTransactions,
  planBackfill,
} from '../src/utils/journalBackfill';
import { validateBackup } from '../src/utils/exportImport';
import type { BankAccount, BankTransaction } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- localStorage shim (MUST be set before the store is imported) ---
// The store is pulled in via dynamic import() inside runStore() so zustand's
// persist middleware finds a working localStorage the moment it initialises.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

/** snapshot ยอดทุกบัญชีแบบ deep เพื่อพิสูจน์ว่าไม่ถูกแตะ. */
const balancesSnapshot = (accounts: readonly BankAccount[]): string =>
  JSON.stringify(accounts.map((a) => [a.id, a.balances]));

const tx = (
  id: string,
  accountId: string,
  year: number,
  month: number,
  amount: number,
  source: BankTransaction['source'],
): BankTransaction => ({ id, accountId, year, month, amount, label: 'x', source });

// --- เดือนที่มียอด ไม่มีรายการ → 1 บรรทัดเท่ายอด ---
const l1: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2025': { '3': 17250 } } }],
  transactions: [],
};
const before1 = balancesSnapshot(l1.accounts);
const p1 = planBackfill(l1);
eq('1 บรรทัด', p1.lines.length, 1);
eq('amount = ยอดเดือน', p1.lines[0].amount, 17250);
eq('cellCount', p1.cellCount, 1);
eq('accountCount', p1.accountCount, 1);
eq('planBackfill ไม่แตะยอด', balancesSnapshot(l1.accounts), before1);

// --- เดือนผสม: ยอด 5,000 + บรรทัดทอง −100,000 → backfill +105,000 ---
const l2: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 5000 } } }],
  transactions: [tx('t1', 'a', 2026, 7, -100000, { type: 'gold', holdingId: 'g1' })],
};
const p2 = planBackfill(l2);
eq('เดือนผสม → ส่วนต่าง', p2.lines[0].amount, 105000);

// --- invariant หลังเติมบรรทัด ---
const filled: BankLedger = {
  accounts: l2.accounts,
  transactions: [
    ...l2.transactions,
    ...buildBackfillTransactions(p2, (_l, i) => `bf-${i}`),
  ],
};
eq('เติมแล้ว invariant ผ่าน', findLedgerMismatches(filled).length, 0);

// --- เดือนที่รายการครบแล้ว → ไม่สร้าง ---
const l3: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 1000 } } }],
  transactions: [tx('t1', 'a', 2026, 7, 1000, { type: 'manual' })],
};
eq('ส่วนต่าง 0 → ไม่สร้าง', planBackfill(l3).lines.length, 0);

// --- ยอด 0 → ไม่สร้าง ---
const l4: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 0 } } }],
  transactions: [],
};
eq('ยอด 0 → ไม่สร้าง', planBackfill(l4).lines.length, 0);

// --- ยอดติดลบ → บรรทัดติดลบ ---
const l5: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '2': -3000 } } }],
  transactions: [],
};
eq('ยอดติดลบ', planBackfill(l5).lines[0].amount, -3000);

// --- เศษทศนิยม: ยอด 711366.21 กับรายการ 711366.21 → ไม่เกิดบรรทัดจากเศษ float ---
const l6: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '1': 711366.21 } } }],
  transactions: [tx('t1', 'a', 2026, 1, 711366.21, { type: 'manual' })],
};
eq('เศษ float ไม่สร้างบรรทัด', planBackfill(l6).lines.length, 0);

// --- หลายบัญชี หลายเดือน ---
const l7: BankLedger = {
  accounts: [
    { id: 'a', name: 'A', balances: { '2025': { '1': 100, '2': 200 } } },
    { id: 'b', name: 'B', balances: { '2025': { '1': 300 } } },
  ],
  transactions: [],
};
const p7 = planBackfill(l7);
eq('3 เซลล์', p7.cellCount, 3);
eq('2 บัญชี', p7.accountCount, 2);

// --- Export/Import round-trip เก็บ source: {type:'backfill'} ---
// F40 (validateBackup) preserve bankTransactions ทั้งก้อนอยู่แล้ว — บรรทัด
// backfill จึงรอด round-trip โดยไม่ต้องแก้โค้ด exportImport. assertion นี้กันไว้
// เผื่อวันหน้ามีใคร "validate เข้ม" แล้วเผลอ drop source ที่ไม่รู้จัก.
const bfTx: BankTransaction = tx('bf-rt', 'a', 2025, 3, 17250, { type: 'backfill' });
const restored = validateBackup({
  version: '1.3.0',
  lastUpdated: '2026-07-09T00:00:00.000Z',
  years: {},
  // บัญชี 'a' ต้องมีจริง — bfTx.accountId ชี้มา (referential integrity)
  bankAccounts: [{ id: 'a', name: 'A', balances: { '2025': { '3': 17250 } } }],
  bankTransactions: [bfTx],
});
eq('validateBackup ok', restored.ok, true);
const survived = restored.ok
  ? restored.data.bankTransactions?.find((t) => t.id === 'bf-rt')
  : undefined;
eq('backfill รอด round-trip', survived?.source.type, 'backfill');
eq('backfill amount รอด', survived?.amount, 17250);

// ════════════════════════════════════════════════════════════════════════
// Task 2 — store-level: apply / undo / idempotent / round-trip
// กฎเหล็ก: ยอดทุกบัญชีก่อน = หลัง ทุกเคส (deep snapshot).
// harness เดียวกับ scripts/verify-bank-transactions.ts (localStorage shim +
// dynamic import — static import ของ store พังใต้ node).
// ════════════════════════════════════════════════════════════════════════
const runStore = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const store = useFinanceStore;
  const snap = (): string =>
    JSON.stringify(
      (store.getState().data.bankAccounts ?? []).map((a) => [a.id, a.balances]),
    );
  const txs = (): BankTransaction[] => store.getState().data.bankTransactions ?? [];
  const backfills = (): BankTransaction[] =>
    txs().filter((t) => t.source.type === 'backfill');

  store.setState((s) => ({
    data: {
      ...s.data,
      years: {},
      bankTransactions: [
        // เดือนผสม: กรุงศรีมียอด 5,000 และบรรทัดทอง −100,000
        {
          id: 'g1',
          accountId: 'acc-1',
          year: 2026,
          month: 7,
          amount: -100000,
          label: 'ซื้อทอง',
          source: { type: 'gold', holdingId: 'h1' },
        },
      ],
      bankAccounts: [
        {
          id: 'acc-1',
          name: 'หนึ่ง',
          balances: { '2025': { '3': 17250 }, '2026': { '7': 5000 } },
        },
        { id: 'acc-2', name: 'สอง', balances: { '2026': { '1': -3000 } } },
      ],
    },
  }));

  const before = snap();

  // --- apply ---
  store.getState().applyJournalBackfill();
  eq('สร้าง 3 บรรทัด', backfills().length, 3);
  eq('ยอดไม่ขยับเลย', snap(), before);
  eq(
    'invariant ทั้งระบบ',
    findLedgerMismatches({
      accounts: store.getState().data.bankAccounts ?? [],
      transactions: txs(),
    }).length,
    0,
  );
  const mixed = backfills().find((t) => t.year === 2026 && t.month === 7);
  eq('เดือนผสม → +105,000', mixed?.amount, 105000);

  // --- idempotent ---
  store.getState().applyJournalBackfill();
  eq('รันซ้ำ → จำนวนบรรทัดเท่าเดิม', backfills().length, 3);
  eq('รันซ้ำ → ยอดเท่าเดิม', snap(), before);

  // --- deleteBankTransaction ปฏิเสธ backfill ---
  const bfId = backfills()[0].id;
  store.getState().deleteBankTransaction(bfId);
  eq('ลบ backfill ไม่ได้', backfills().length, 3);

  // --- undo ---
  store.getState().undoJournalBackfill();
  eq('undo → ไม่เหลือ backfill', backfills().length, 0);
  eq('undo → บรรทัดทองยังอยู่', txs().length, 1);
  eq('undo → ยอดเท่าเดิม', snap(), before);

  // --- round-trip ---
  store.getState().applyJournalBackfill();
  store.getState().undoJournalBackfill();
  store.getState().applyJournalBackfill();
  eq('round-trip → 3 บรรทัด', backfills().length, 3);
  eq('round-trip → ยอดเท่าเดิม', snap(), before);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};
void runStore();
