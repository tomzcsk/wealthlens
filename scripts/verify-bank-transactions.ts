/**
 * Verification for F40 — bank transaction journal.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
 */
import {
  applyBankMovement,
  findLedgerMismatches,
  reconcileBankMovements,
  revokeBankMovements,
  type BankLedger,
} from '../src/utils/bankMovements';
import type { BankAccount } from '../src/types';

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

const accounts: BankAccount[] = [
  { id: 'a', name: 'A', balances: {} },
  { id: 'b', name: 'B', balances: {} },
];
const empty: BankLedger = { accounts, transactions: [] };
const bal = (l: BankLedger, id: string, y = 2026, m = 7): number =>
  l.accounts.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;

// --- apply: ยอด + รายการ เขียนพร้อมกัน ---
const l1 = applyBankMovement(empty, {
  accountId: 'a', year: 2026, month: 7, amount: 1000,
  label: 'ฝากเงิน', source: { type: 'manual' },
});
eq('ยอดขึ้น', bal(l1, 'a'), 1000);
eq('มี 1 บรรทัด', l1.transactions.length, 1);
eq('บรรทัดถูกบัญชี', l1.transactions[0].accountId, 'a');
eq('invariant', findLedgerMismatches(l1).length, 0);

// --- amount 0 → ไม่สร้างบรรทัด ---
const l0 = applyBankMovement(empty, {
  accountId: 'a', year: 2026, month: 7, amount: 0,
  label: 'ว่าง', source: { type: 'manual' },
});
eq('amount 0 → ไม่มีบรรทัด', l0.transactions.length, 0);
eq('amount 0 → ยอดไม่ขยับ', bal(l0, 'a'), 0);

// --- revoke: ลบบรรทัด + คืนยอด ---
const l2 = revokeBankMovements(l1, (tx) => tx.source.type === 'manual');
eq('revoke ลบบรรทัด', l2.transactions.length, 0);
eq('revoke คืนยอด', bal(l2, 'a'), 0);
eq('invariant หลัง revoke', findLedgerMismatches(l2).length, 0);

// --- reconcile: แทนที่ของเดิม ไม่ใช่เพิ่มใหม่ (หัวใจของฟีเจอร์) ---
const salaryMatch = (tx: { source: { type: string } }): boolean =>
  tx.source.type === 'income';
const first = reconcileBankMovements(empty, salaryMatch, [
  { accountId: 'a', year: 2026, month: 7, amount: 60000, label: 'เงินเดือน (หลังหัก)',
    source: { type: 'income', year: 2026, month: 7, field: 'salary' } },
]);
const second = reconcileBankMovements(first, salaryMatch, [
  { accountId: 'a', year: 2026, month: 7, amount: 70000, label: 'เงินเดือน (หลังหัก)',
    source: { type: 'income', year: 2026, month: 7, field: 'salary' } },
]);
eq('reconcile → ยังมี 1 บรรทัด', second.transactions.length, 1);
eq('reconcile → ยอดใหม่ ไม่บวกทบ', bal(second, 'a'), 70000);
eq('reconcile → invariant', findLedgerMismatches(second).length, 0);

// --- reconcile ด้วย movements ว่าง = revoke ---
const cleared = reconcileBankMovements(second, salaryMatch, []);
eq('reconcile ว่าง → ลบบรรทัด', cleared.transactions.length, 0);
eq('reconcile ว่าง → คืนยอด', bal(cleared, 'a'), 0);

// --- findLedgerMismatches จับยอดที่ไม่ตรงได้จริง ---
const broken: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 999 } } }],
  transactions: [
    { id: 't1', accountId: 'a', year: 2026, month: 7, amount: 100,
      label: 'x', source: { type: 'manual' } },
  ],
};
eq('จับ mismatch ได้', findLedgerMismatches(broken).length, 1);

// --- เดือนที่ไม่มีรายการเลย ไม่ถูกตรวจ (เดือนเก่า) ---
const legacy: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2025': { '3': 17250 } } }],
  transactions: [],
};
eq('เดือนเก่าไม่มีรายการ → ไม่ถือว่าผิด', findLedgerMismatches(legacy).length, 0);

// ════════════════════════════════════════════════════════════════════════
// Task 2 — store-level: ฝาก/ถอน/โอน/ปรับยอด จดรายการผ่านประตูเดียว
// (drive the real store; pattern จาก scripts/verify-installment-deduction.ts)
// ════════════════════════════════════════════════════════════════════════
const runStore = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const store = useFinanceStore;
  const ledgerOf = (): BankLedger => ({
    accounts: store.getState().data.bankAccounts ?? [],
    transactions: store.getState().data.bankTransactions ?? [],
  });
  const balOf = (id: string, y: number, m: number): number =>
    store.getState().data.bankAccounts?.find((a) => a.id === id)
      ?.balances[String(y)]?.[String(m)] ?? 0;
  const txCount = (): number =>
    store.getState().data.bankTransactions?.length ?? 0;

  store.setState((s) => ({
    data: {
      ...s.data,
      years: {},
      bankTransactions: [],
      bankAccounts: [
        { id: 'acc-1', name: 'หนึ่ง', type: 'salary', balances: {} },
        { id: 'acc-2', name: 'สอง', type: 'cash', balances: {} },
      ],
    },
  }));

  // --- ฝาก ---
  store.getState().depositBank('acc-1', 2026, 7, 1000);
  eq('ฝาก → ยอด', balOf('acc-1', 2026, 7), 1000);
  eq('ฝาก → 1 บรรทัด', txCount(), 1);
  eq('ฝาก → source manual', store.getState().data.bankTransactions?.[0].source.type, 'manual');
  eq('ฝาก → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- ถอน ---
  store.getState().withdrawBank('acc-1', 2026, 7, 400);
  eq('ถอน → ยอด', balOf('acc-1', 2026, 7), 600);
  eq('ถอน → 2 บรรทัด', txCount(), 2);
  eq('ถอน → amount ติดลบ', store.getState().data.bankTransactions?.[1].amount, -400);
  eq('ถอน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- โอน: 2 บรรทัดคู่กัน ---
  store.getState().transferBankBalance('acc-1', 'acc-2', 2026, 7, 100);
  eq('โอน → ต้นทางลด', balOf('acc-1', 2026, 7), 500);
  eq('โอน → ปลายทางเพิ่ม', balOf('acc-2', 2026, 7), 100);
  eq('โอน → 4 บรรทัด', txCount(), 4);
  eq('โอน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- ปรับยอดเองในเดือนที่มีรายการ → บรรทัด adjustment = ส่วนต่าง ---
  store.getState().setBankBalance('acc-1', 2026, 7, 900);
  const adj = store.getState().data.bankTransactions?.filter((t) => t.source.type === 'adjustment') ?? [];
  eq('ปรับยอด → 1 บรรทัด adjustment', adj.length, 1);
  eq('ปรับยอด → ส่วนต่าง +400', adj[0].amount, 400);
  eq('ปรับยอด → ยอดตรง', balOf('acc-1', 2026, 7), 900);
  eq('ปรับยอด → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // ปรับซ้ำ → แทนที่บรรทัดเดิม ไม่เพิ่มใหม่
  store.getState().setBankBalance('acc-1', 2026, 7, 1000);
  const adj2 = store.getState().data.bankTransactions?.filter((t) => t.source.type === 'adjustment') ?? [];
  eq('ปรับซ้ำ → ยังมี 1 บรรทัด', adj2.length, 1);
  eq('ปรับซ้ำ → ส่วนต่างใหม่', adj2[0].amount, 500);
  eq('ปรับซ้ำ → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- ปรับยอดในเดือนที่ไม่มีรายการเลย → ไม่สร้างบรรทัด (เดือนเก่า) ---
  store.getState().setBankBalance('acc-2', 2025, 3, 17250);
  const marchTx = store.getState().data.bankTransactions?.filter((t) => t.year === 2025) ?? [];
  eq('เดือนเก่า → ไม่มีบรรทัด', marchTx.length, 0);
  eq('เดือนเก่า → ยอดยังเขียนได้', balOf('acc-2', 2025, 3), 17250);
  eq('เดือนเก่า → invariant ยังผ่าน', findLedgerMismatches(ledgerOf()).length, 0);

  // --- clearBankBalance → รายการเดือนนั้นหายหมด ---
  store.getState().clearBankBalance('acc-1', 2026, 7);
  eq('clear → ไม่มีรายการเดือนนั้น',
    (store.getState().data.bankTransactions ?? []).filter((t) => t.accountId === 'acc-1' && t.year === 2026 && t.month === 7).length, 0);
  eq('clear → ยอดหาย', balOf('acc-1', 2026, 7), 0);
  eq('clear → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};
void runStore();
