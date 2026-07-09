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
import { KRUNGSRI_ACCOUNT_ID } from '../src/utils/bankAccounts';
import type { BankAccount, MonthlyIncome } from '../src/types';

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

  // ════════════════════════════════════════════════════════════════════════
  // Task 3 — รายได้/รายจ่าย/ทอง จดรายการผ่านประตูเดียว
  // หัวใจ: แก้ต้นทางแล้วบรรทัดเดิม "ถูกแทนที่" ไม่ใช่มีสองบรรทัด
  // ════════════════════════════════════════════════════════════════════════

  // --- รายได้ (F39): บรรทัดเดียว แก้แล้วแทนที่ ---
  store.setState((s) => ({
    data: {
      ...s.data,
      years: {},
      bankTransactions: [],
      bankAccounts: [{ id: 'acc-1', name: 'หนึ่ง', type: 'salary', balances: {} }],
    },
  }));

  const baseIncome: MonthlyIncome = {
    month: 7,
    salary: 80000,
    bonus: 0,
    commission: 0,
    deductions: { tax: 20000, socialSecurity: 0, providentFund: 0, gsl: 0 },
    deposits: { salary: 'acc-1' },
  };
  store.getState().addIncome(2026, baseIncome);
  const incomeTx = () =>
    (store.getState().data.bankTransactions ?? []).filter(
      (t) => t.source.type === 'income',
    );
  eq('รายได้ → 1 บรรทัด', incomeTx().length, 1);
  eq('รายได้ → +60,000', incomeTx()[0].amount, 60000);
  eq('รายได้ → label เงินเดือน (หลังหัก)', incomeTx()[0].label, 'เงินเดือน (หลังหัก)');
  eq('รายได้ → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  store.getState().addIncome(2026, { ...baseIncome, salary: 90000 });
  eq('แก้เงินเดือน → ยังมี 1 บรรทัด', incomeTx().length, 1);
  eq('แก้เงินเดือน → +70,000 ไม่บวกทบ', incomeTx()[0].amount, 70000);
  eq('แก้เงินเดือน → ยอด 70,000', balOf('acc-1', 2026, 7), 70000);
  eq('แก้เงินเดือน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  store.getState().addIncome(2026, { ...baseIncome, salary: 90000, deposits: {} });
  eq('ถอดบัญชี → ไม่มีบรรทัด', incomeTx().length, 0);
  eq('ถอดบัญชี → ยอดคืน 0', balOf('acc-1', 2026, 7), 0);
  eq('ถอดบัญชี → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- รายจ่ายจ่ายผ่านบัญชี (F34) ---
  store.setState((s) => ({
    data: {
      ...s.data,
      years: {},
      bankTransactions: [],
      bankAccounts: [{ id: 'acc-1', name: 'หนึ่ง', balances: {} }],
    },
  }));
  store.getState().addExpense(2026, 7, {
    category: 'housing',
    name: 'ค่าบ้าน',
    amount: 30000,
    isRecurring: false,
    paymentAccountId: 'acc-1',
  });
  const expTx = () =>
    (store.getState().data.bankTransactions ?? []).filter(
      (t) => t.source.type === 'expense',
    );
  eq('รายจ่าย → 1 บรรทัด', expTx().length, 1);
  eq('รายจ่าย → −30,000', expTx()[0].amount, -30000);
  eq('รายจ่าย → label ชื่อรายการ', expTx()[0].label, 'ค่าบ้าน');
  eq('รายจ่าย → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  const expenseId = store.getState().data.years['2026'].expenses.find(
    (e) => e.month === 7,
  )!.items[0].id;
  store.getState().updateExpense(2026, 7, expenseId, { amount: 35000 });
  eq('แก้ยอดรายจ่าย → ยังมี 1 บรรทัด', expTx().length, 1);
  eq('แก้ยอดรายจ่าย → −35,000', expTx()[0].amount, -35000);
  eq('แก้ยอดรายจ่าย → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  store.getState().deleteExpense(2026, 7, expenseId);
  eq('ลบรายจ่าย → ไม่มีบรรทัด', expTx().length, 0);
  eq('ลบรายจ่าย → ยอดคืน', balOf('acc-1', 2026, 7), 0);
  eq('ลบรายจ่าย → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- ผ่อนหักรายงวด (F35): แต่ละงวดจดรายการ; แก้/ลบงวดใช้ประตูเดียวกับ add
  //     (ถ้า add ไม่จด แต่ update จด → หักซ้ำ — assertion นี้กันไว้) ---
  store.setState((s) => ({
    data: {
      ...s.data,
      years: {},
      bankTransactions: [],
      bankAccounts: [{ id: 'acc-1', name: 'หนึ่ง', balances: {} }],
    },
  }));
  const planId = store.getState().addInstallmentPlan({
    name: 'ผ่อนของ',
    category: 'other',
    totalAmount: 3000,
    totalMonths: 3,
    startYear: 2026,
    startMonth: 7,
    paymentAccountId: 'acc-1',
  });
  eq('ผ่อน → 3 บรรทัด', expTx().length, 3);
  eq('ผ่อน → งวด ก.ค. −1,000', balOf('acc-1', 2026, 7), -1000);
  eq('ผ่อน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  const julItem = store.getState().data.years['2026'].expenses
    .find((e) => e.month === 7)!
    .items.find((it) => it.installment?.planId === planId)!;
  store.getState().updateExpense(2026, 7, julItem.id, { amount: 1500 });
  eq('แก้งวด → ก.ค. −1,500 ไม่หักซ้ำ', balOf('acc-1', 2026, 7), -1500);
  eq('แก้งวด → ยัง 3 บรรทัด', expTx().length, 3);
  eq('แก้งวด → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  store.getState().deleteInstallmentPlan(planId);
  eq('ลบแผน → ไม่มีบรรทัด', expTx().length, 0);
  eq('ลบแผน → ยอดคืน ก.ค.', balOf('acc-1', 2026, 7), 0);
  eq('ลบแผน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  // --- ทองซื้อด้วย Kept (F25): จดที่บัญชีกรุงศรี, ลบ holding คืนยอด ---
  // เริ่มยอดกรุงศรีที่ 0 เพื่อให้เซลล์เป็น journal-only (invariant ต้องจริง);
  // ยอด migrate เดิม (set ตรงๆ ไม่มี journal) ผสมกับ journal = mixed cell — นอก
  // scope ของ F40 (spec §4: ไม่ migrate ยอดยกมา).
  store.setState((s) => ({
    data: {
      ...s.data,
      years: {},
      bankTransactions: [],
      goldHoldings: [],
      bankAccounts: [{ id: KRUNGSRI_ACCOUNT_ID, name: 'กรุงศรี', balances: {} }],
    },
  }));
  const holdingId = store.getState().addGoldHolding({
    purchaseDate: '2026-03-15',
    brand: 'YLG',
    type: 'bar',
    purity: '96.5',
    weightBaht: 1,
    totalCost: 12000,
    paymentMethod: 'kept',
  });
  const goldTx = () =>
    (store.getState().data.bankTransactions ?? []).filter(
      (t) => t.source.type === 'gold',
    );
  eq('ทอง → 1 บรรทัด', goldTx().length, 1);
  eq('ทอง → −12,000', goldTx()[0].amount, -12000);
  eq('ทอง → source holdingId ตรง', goldTx()[0].source.type === 'gold' && goldTx()[0].source.holdingId, holdingId);
  eq('ทอง → ตัดยอดกรุงศรี −12,000', balOf(KRUNGSRI_ACCOUNT_ID, 2026, 3), -12000);
  eq('ทอง → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  store.getState().deleteGoldHolding(holdingId, { revertSideEffects: true });
  eq('ลบทอง → ไม่มีบรรทัด', goldTx().length, 0);
  eq('ลบทอง → คืนยอด 0', balOf(KRUNGSRI_ACCOUNT_ID, 2026, 3), 0);
  eq('ลบทอง → invariant', findLedgerMismatches(ledgerOf()).length, 0);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};
void runStore();
