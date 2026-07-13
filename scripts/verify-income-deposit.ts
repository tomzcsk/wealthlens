/**
 * Verification for F39 — income → bank deposit.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
 *
 * โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite. Task 1 คุม
 * pure util, Task 2 คุม store reconcile (localStorage shim ต้องตั้งก่อน import
 * store — จึงต้อง dynamic import ภายใน run), Task 3 คุม export/import round-trip.
 */
import {
  computeIncomeDeposits,
  isSalaryUnderwater,
} from '../src/utils/incomeDeposits';
import { validateBackup } from '../src/utils/exportImport';
import type { BankAccount, MonthlyIncome, WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- localStorage shim (must be set BEFORE importing the store, Task 2) ---
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const baseIncome: MonthlyIncome = {
  month: 7,
  salary: 80000,
  bonus: 50000,
  commission: 120000,
  otherIncome: 5000,
  deductions: { tax: 12000, socialSecurity: 750, providentFund: 4000, gsl: 3250 },
};
// ยอดหักรวม = 20,000 → เงินเดือนเข้าบัญชี 60,000

const run = async (): Promise<void> => {
  // ===================================================================
  // Task 1 — pure util
  // ===================================================================

  // --- เลือกครบทุกช่อง ---
  const all = computeIncomeDeposits({
    ...baseIncome,
    deposits: { salary: 'acc-salary', bonus: 'acc-cash', commission: 'acc-cash', otherIncome: 'acc-cash' },
  });
  eq('4 refs', all.length, 4);
  eq('เงินเดือน = salary − หัก', all.find((r) => r.source === 'salary')?.amount, 60000);
  eq('เงินเดือนเข้าบัญชีเงินเดือน', all.find((r) => r.source === 'salary')?.accountId, 'acc-salary');
  eq('โบนัสเต็มจำนวน', all.find((r) => r.source === 'bonus')?.amount, 50000);
  eq('คอมเต็มจำนวน', all.find((r) => r.source === 'commission')?.amount, 120000);
  eq('อื่นๆ เต็มจำนวน', all.find((r) => r.source === 'otherIncome')?.amount, 5000);

  // --- ช่องที่ไม่เลือกบัญชี ไม่มี ref ---
  const partial = computeIncomeDeposits({ ...baseIncome, deposits: { salary: 'acc-salary' } });
  eq('เลือกช่องเดียว → 1 ref', partial.length, 1);

  // --- ไม่มี deposits เลย → ไม่มี ref ---
  eq('ไม่มี deposits → 0 ref', computeIncomeDeposits(baseIncome).length, 0);

  // --- ยอด 0 ไม่สร้าง ref (ไม่ต้องเขียน delta 0 ลงบัญชี) ---
  const zeroBonus = computeIncomeDeposits({
    ...baseIncome,
    bonus: 0,
    deposits: { bonus: 'acc-cash' },
  });
  eq('ยอด 0 → ไม่มี ref', zeroBonus.length, 0);

  // --- หักมากกว่าเงินเดือน → ฝาก 0 ไม่ติดลบ ---
  const underwater: MonthlyIncome = {
    ...baseIncome,
    salary: 10000,
    deposits: { salary: 'acc-salary' },
  };
  eq('หัก > เงินเดือน → ไม่มี ref (ฝาก 0)', computeIncomeDeposits(underwater).length, 0);
  eq('isSalaryUnderwater = true', isSalaryUnderwater(underwater), true);
  eq('ปกติ → isSalaryUnderwater = false', isSalaryUnderwater(baseIncome), false);

  // ===================================================================
  // Task 2 — store reconcile (addIncome / updateIncome)
  // ===================================================================
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const store = useFinanceStore;
  const accounts: BankAccount[] = [
    { id: 'acc-salary', name: 'กสิกร', type: 'salary', balances: {} },
    { id: 'acc-cash', name: 'เงินสด', type: 'cash', balances: {} },
  ];
  const resetAccounts = (): void =>
    store.setState((s) => ({
      data: {
        ...s.data,
        bankAccounts: accounts.map((a) => ({ ...a, balances: {} })),
        years: {},
      },
    }));
  resetAccounts();

  const bal = (id: string, y: number, m: number): number =>
    store.getState().data.bankAccounts?.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;

  // --- addIncome ฝากเงินเข้าบัญชี ---
  store.getState().addIncome(2026, {
    ...baseIncome,
    deposits: { salary: 'acc-salary', bonus: 'acc-cash' },
  });
  eq('ฝากเงินเดือน 60,000', bal('acc-salary', 2026, 7), 60000);
  eq('ฝากโบนัส 50,000', bal('acc-cash', 2026, 7), 50000);
  const stored = store.getState().data.years['2026'].income.find((i) => i.month === 7);
  eq('เก็บ depositSideEffects 2 รายการ', stored?.depositSideEffects?.length, 2);

  // --- addIncome ซ้ำ (แก้เงินเดือน) → revert แล้ว apply ใหม่ ไม่บวกซ้ำ ---
  store.getState().addIncome(2026, {
    ...baseIncome,
    salary: 90000,
    deposits: { salary: 'acc-salary', bonus: 'acc-cash' },
  });
  eq('เงินเดือนใหม่ 70,000 ไม่บวกซ้ำ', bal('acc-salary', 2026, 7), 70000);
  eq('โบนัสเท่าเดิม', bal('acc-cash', 2026, 7), 50000);

  // --- updateIncome แก้เฉพาะ deductions → ยอดฝากเงินเดือนเปลี่ยนตาม ---
  // เงินเดือนตอนนี้ 90,000, tax 12,000→22,000 → หักรวม 30,000 → ฝาก 60,000
  store.getState().updateIncome(2026, 7, { deductions: { ...baseIncome.deductions, tax: 22000 } });
  eq('หักเพิ่ม 10,000 → ฝากลดเหลือ 60,000', bal('acc-salary', 2026, 7), 60000);

  // --- ย้ายโบนัสไปอีกบัญชี → A ลด B เพิ่ม ---
  store.getState().updateIncome(2026, 7, { deposits: { salary: 'acc-salary', bonus: 'acc-salary' } });
  eq('เงินสดถูกคืนเป็น 0', bal('acc-cash', 2026, 7), 0);
  eq('บัญชีเงินเดือน = 60,000 + 50,000', bal('acc-salary', 2026, 7), 110000);

  // --- เอาบัญชีออกจากช่อง → คืนยอดที่เคยฝาก ---
  store.getState().updateIncome(2026, 7, { deposits: {} });
  eq('ถอน deposits → บัญชีกลับเป็น 0', bal('acc-salary', 2026, 7), 0);
  const afterStrip = store.getState().data.years['2026'].income.find((i) => i.month === 7);
  eq('ไม่มี depositSideEffects หลังถอน', afterStrip?.depositSideEffects, undefined);

  // --- ข้อมูลเดิมไม่มี deposits → ไม่แตะบัญชี ---
  resetAccounts();
  store.getState().addIncome(2026, baseIncome);
  eq('ไม่มี deposits → ยอดบัญชีไม่ขยับ', bal('acc-salary', 2026, 7), 0);
  eq('ไม่มี depositSideEffects', store.getState().data.years['2026'].income[0].depositSideEffects, undefined);

  // ===================================================================
  // Task 3 — export/import round-trip preserve type/deposits/depositSideEffects
  // ===================================================================
  const payload: WealthLensData = {
    version: '1.0.0',
    lastUpdated: '2026-07-09T00:00:00.000Z',
    bankAccounts: [
      { id: 'acc-salary', name: 'กสิกร', type: 'salary', balances: { '2026': { '7': 60000 } } },
      // acc-cash ต้องมีจริง — depositSideEffects/deposits ชี้มา (referential integrity)
      { id: 'acc-cash', name: 'เงินสด', type: 'cash', balances: { '2026': { '7': 50000 } } },
    ],
    years: {
      '2026': {
        income: [
          {
            ...baseIncome,
            deposits: { salary: 'acc-salary', bonus: 'acc-cash' },
            depositSideEffects: [
              { source: 'salary', accountId: 'acc-salary', amount: 60000 },
              { source: 'bonus', accountId: 'acc-cash', amount: 50000 },
            ],
          },
        ],
        expenses: [],
        savings: [],
      },
    },
  };
  // ผ่าน JSON round-trip เลียนแบบ export → import จริง.
  const result = validateBackup(JSON.parse(JSON.stringify(payload)));
  eq('validateBackup ok', result.ok, true);
  const importedAcct = result.ok ? result.data.bankAccounts?.[0] : undefined;
  eq('preserve BankAccount.type', importedAcct?.type, 'salary');
  const importedIncome = result.ok ? result.data.years['2026'].income[0] : undefined;
  eq('preserve income.deposits.salary', importedIncome?.deposits?.salary, 'acc-salary');
  eq('preserve income.deposits.bonus', importedIncome?.deposits?.bonus, 'acc-cash');
  eq('preserve depositSideEffects length', importedIncome?.depositSideEffects?.length, 2);
  eq(
    'preserve depositSideEffects[0].amount',
    importedIncome?.depositSideEffects?.[0]?.amount,
    60000,
  );

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};
void run();
