/**
 * Verification for F39 — income → bank deposit.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
 *
 * โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite. Task 1 คุม
 * pure util, Task 2 คุม store reconcile (localStorage shim ต้องตั้งก่อน import
 * store), Task 3 คุม export/import round-trip.
 */
import {
  computeIncomeDeposits,
  isSalaryUnderwater,
} from '../src/utils/incomeDeposits';
import type { MonthlyIncome } from '../src/types';

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

// =====================================================================
// Task 1 — pure util
// =====================================================================

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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
