/**
 * Verification: ลบบัญชีธนาคารต้องไม่ทิ้ง pointer กำพร้า
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-delete-bank-account.ts
 *
 * บั๊ก: `deleteBankAccount` กรองบัญชีทิ้งอย่างเดียว — ของที่ชี้มาหามันยังชี้อยู่:
 * รายการเดินบัญชี, `income.deposits`/`depositSideEffects`,
 * `expense.paymentAccountId`/`sideEffects`, `gold.sideEffects.accountId`.
 * แล้ว `applyBankDelta` หาบัญชีไม่เจอก็เงียบ (return accounts.slice()) →
 * แก้รายได้ทีหลัง "เงินหายเงียบ ๆ" โดยไม่มี error
 *
 * ทางแก้ที่เลือก: **ปฏิเสธการลบ** เมื่อยังมีต้นทางผูกอยู่ แล้วบอกผู้ใช้ว่าผูกที่ไหน
 *
 * เส้นแบ่ง blocking vs กวาดได้:
 *  - blocking = ต้นทางอยู่ "นอก" บัญชี (รายได้/รายจ่าย/ทอง/ขาโอนที่คู่กับบัญชีอื่น)
 *    ลบบัญชีแล้ว pointer เหล่านี้ค้าง → ต้องให้ผู้ใช้ไปถอดเองก่อน
 *  - กวาดได้ = บรรทัดที่บัญชีเป็นเจ้าของเอง (manual/adjustment/backfill)
 *    ไม่มีใครนอกบัญชีอ้างถึง → ลบไปพร้อมบัญชีได้ ไม่เหลือกำพร้า
 */
import { findBankAccountUsage, isBankAccountDeletable } from '../src/utils/bankAccountUsage';
import type { BankAccount, WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
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

const baseData = (): WealthLensData => ({
  version: '1.0.0',
  lastUpdated: '2026-07-10T00:00:00.000Z',
  bankAccounts: [
    { id: 'acc-a', name: 'กสิกร', type: 'salary', balances: {} },
    { id: 'acc-b', name: 'เงินสด', type: 'cash', balances: {} },
  ],
  bankTransactions: [],
  years: {},
});

const run = async (): Promise<void> => {
  // ===================================================================
  // Task 1 — pure helper: หาว่าใครอ้างบัญชีอยู่บ้าง
  // ===================================================================

  // --- ไม่มีใครอ้าง → ลบได้ ---
  eq('บัญชีไม่ถูกอ้าง → ลบได้', isBankAccountDeletable(baseData(), 'acc-a'), true);
  eq('usage ว่าง → 0 รายได้', findBankAccountUsage(baseData(), 'acc-a').incomeMonths.length, 0);

  // --- รายได้ผูกผ่าน deposits ---
  const withIncome = baseData();
  withIncome.years = {
    '2026': {
      income: [
        {
          month: 7, salary: 80000, bonus: 0, commission: 0,
          deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
          deposits: { salary: 'acc-a' },
        },
      ],
      expenses: [], savings: [],
    },
  };
  eq('รายได้ผูกอยู่ → ลบไม่ได้', isBankAccountDeletable(withIncome, 'acc-a'), false);
  eq('นับเดือนรายได้ที่ผูก', findBankAccountUsage(withIncome, 'acc-a').incomeMonths.length, 1);
  eq('บัญชีอื่นไม่ถูกกระทบ', isBankAccountDeletable(withIncome, 'acc-b'), true);

  // --- รายได้ผูกผ่าน depositSideEffects แม้ deposits ถูกถอด ---
  const withSideEffectOnly = baseData();
  withSideEffectOnly.years = {
    '2026': {
      income: [
        {
          month: 7, salary: 80000, bonus: 0, commission: 0,
          deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
          depositSideEffects: [{ source: 'salary', accountId: 'acc-a', amount: 80000 }],
        },
      ],
      expenses: [], savings: [],
    },
  };
  eq('depositSideEffects ค้าง → ลบไม่ได้', isBankAccountDeletable(withSideEffectOnly, 'acc-a'), false);

  // --- รายจ่ายผูกผ่าน paymentAccountId ---
  const withExpense = baseData();
  withExpense.years = {
    '2026': {
      income: [],
      expenses: [
        {
          month: 7,
          items: [
            { id: 'e1', category: 'food', name: 'ข้าว', amount: 100, paymentAccountId: 'acc-a' },
          ],
        },
      ],
      savings: [],
    },
  };
  eq('รายจ่ายผูกอยู่ → ลบไม่ได้', isBankAccountDeletable(withExpense, 'acc-a'), false);
  eq('นับรายจ่ายที่ผูก', findBankAccountUsage(withExpense, 'acc-a').expenses.length, 1);

  // --- ทองผูกผ่าน sideEffects.accountId ---
  const withGold = baseData();
  withGold.goldHoldings = [
    {
      id: 'g1', purchaseDate: '2026-07-01', grams: 1, pricePerGram: 50000,
      totalCost: 50000, paymentMethod: 'kept',
      sideEffects: { accountId: 'acc-a', keptYear: 2026, keptMonth: 7, keptAmount: 50000 },
    },
  ] as WealthLensData['goldHoldings'];
  eq('ทองผูกอยู่ → ลบไม่ได้', isBankAccountDeletable(withGold, 'acc-a'), false);
  eq('นับทองที่ผูก', findBankAccountUsage(withGold, 'acc-a').goldHoldings.length, 1);

  // --- ขาโอนผูกกับบัญชีอื่น → ลบไม่ได้ (ลบขาเดียว เงินหายจากระบบ) ---
  const withTransfer = baseData();
  withTransfer.bankTransactions = [
    { id: 't1', accountId: 'acc-a', year: 2026, month: 7, amount: -500, label: 'โอน',
      source: { type: 'transfer', counterpartAccountId: 'acc-b' } },
  ];
  eq('ขาโอนผูกอยู่ → ลบไม่ได้', isBankAccountDeletable(withTransfer, 'acc-a'), false);
  eq('นับขาโอน', findBankAccountUsage(withTransfer, 'acc-a').transfers, 1);

  // --- บรรทัดที่บัญชีเป็นเจ้าของเอง → ลบได้ (กวาดพร้อมบัญชี) ---
  const withOwnLines = baseData();
  withOwnLines.bankTransactions = [
    { id: 't1', accountId: 'acc-a', year: 2026, month: 7, amount: 500, label: 'ฝาก', source: { type: 'manual' } },
    { id: 't2', accountId: 'acc-a', year: 2026, month: 7, amount: 100, label: 'ยอดเดิม', source: { type: 'backfill' } },
    { id: 't3', accountId: 'acc-a', year: 2026, month: 7, amount: -50, label: 'ปรับยอด', source: { type: 'adjustment' } },
  ];
  eq('มีแต่บรรทัดของตัวเอง → ลบได้', isBankAccountDeletable(withOwnLines, 'acc-a'), true);
  eq('นับบรรทัดของตัวเอง', findBankAccountUsage(withOwnLines, 'acc-a').ownTransactions, 3);

  // --- ข้อมูลเก่าของ Tom: มีแต่ balances + backfill → ต้องลบได้ ---
  const legacy = baseData();
  (legacy.bankAccounts as BankAccount[])[0].balances = { '2026': { '7': 12345 } };
  legacy.bankTransactions = [
    { id: 't1', accountId: 'acc-a', year: 2026, month: 7, amount: 12345, label: 'ยอดที่กรอกไว้เดิม', source: { type: 'backfill' } },
  ];
  eq('บัญชีเก่า (ยอด + backfill) → ลบได้', isBankAccountDeletable(legacy, 'acc-a'), true);

  // ===================================================================
  // Task 2 — store: ปฏิเสธการลบ + กวาดบรรทัดของตัวเองเมื่อลบได้
  // ===================================================================
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const store = useFinanceStore;
  const seed = (d: WealthLensData): void => void store.setState(() => ({ data: d }));
  const accountIds = (): string[] => (store.getState().data.bankAccounts ?? []).map((a) => a.id);

  // --- ลบบัญชีที่รายได้ผูกอยู่ → ปฏิเสธ ไม่มีอะไรเปลี่ยน ---
  seed(withIncome);
  store.getState().deleteBankAccount('acc-a');
  eq('store ปฏิเสธการลบบัญชีที่มีรายได้ผูก', accountIds().includes('acc-a'), true);

  // --- ลบบัญชีที่มีแต่บรรทัดของตัวเอง → ลบได้ + กวาดบรรทัด ---
  seed(withOwnLines);
  store.getState().deleteBankAccount('acc-a');
  eq('ลบบัญชีที่ไม่มีต้นทางผูก', accountIds().includes('acc-a'), false);
  eq('กวาดบรรทัดของบัญชีนั้นทิ้ง', (store.getState().data.bankTransactions ?? []).length, 0);

  // --- ไม่ทิ้งรายการกำพร้า (tx ชี้บัญชีที่ไม่มีแล้ว) ---
  const after = store.getState().data;
  const dangling = (after.bankTransactions ?? []).filter(
    (t) => !(after.bankAccounts ?? []).some((a) => a.id === t.accountId),
  );
  eq('ไม่เหลือ tx ชี้บัญชีที่ถูกลบ', dangling.length, 0);

  // --- บัญชีอื่นและบรรทัดของมันไม่ถูกแตะ ---
  const twoAccounts = baseData();
  twoAccounts.bankTransactions = [
    { id: 't1', accountId: 'acc-a', year: 2026, month: 7, amount: 500, label: 'ฝาก', source: { type: 'manual' } },
    { id: 't2', accountId: 'acc-b', year: 2026, month: 7, amount: 900, label: 'ฝาก', source: { type: 'manual' } },
  ];
  seed(twoAccounts);
  store.getState().deleteBankAccount('acc-a');
  eq('บัญชี b ยังอยู่', accountIds().join(','), 'acc-b');
  eq('บรรทัดของ b ไม่ถูกกวาด', (store.getState().data.bankTransactions ?? []).length, 1);

  // --- ลบบัญชีที่ไม่มีอยู่ → ไม่พัง ---
  store.getState().deleteBankAccount('ไม่มีจริง');
  eq('ลบบัญชีที่ไม่มี → ไม่พัง', (store.getState().data.bankAccounts ?? []).length, 1);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
