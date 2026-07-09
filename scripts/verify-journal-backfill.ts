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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
