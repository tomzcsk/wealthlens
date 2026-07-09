# F39 — รายได้เข้าบัญชีอัตโนมัติ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** กรอกรายได้ครั้งเดียว → เงินเข้าบัญชีที่เลือกไว้อัตโนมัติ (เงินเดือนหักยอดหักก่อน, โบนัส/คอม/อื่นๆ เต็มจำนวน) พร้อมสรุปแจกแจงก่อนบันทึกและ reconcile ตอนแก้ย้อนหลัง

**Architecture:** double-entry แบบเดียวกับ F34 — pure util `computeIncomeDeposits()` บอกว่าควรฝากอะไรเท่าไหร่, store เก็บ `depositSideEffects` ว่าฝากจริงไปแล้วเท่าไหร่ (revert ด้วยตัวเลขจริง ไม่คำนวณใหม่), `applyBankDelta` ที่มีอยู่แล้วเป็นตัวเขียนยอดบัญชี

**Tech Stack:** TypeScript strict · React 19 · Zustand · Tailwind · verification ด้วย `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts` (โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite)

**Spec:** `docs/superpowers/specs/2026-07-09-income-deposit-design.md`

---

## Facts ที่ต้องรู้ก่อนเขียนโค้ด (อ่านไฟล์จริงยืนยันเสมอ)

- **`IncomeForm` เรียก `addIncome(year, income)` เท่านั้น** ทั้งตอนสร้างและตอนแก้ — `addIncome` แทนที่แถวของเดือนนั้นถ้ามีอยู่แล้ว (`financeStore.ts:487`) ดังนั้น **reconcile ต้องอยู่ใน `addIncome`** (อ่านแถวเดิมของเดือนนั้น → revert → apply ใหม่) ส่วน `updateIncome` (patch รายฟิลด์) ก็ต้อง reconcile เช่นกันเพราะแก้ `deductions` ได้
- ยอดหักรวม = `tax + socialSecurity + providentFund + gsl` — มี `sumDeductions` แต่เป็น **private** ใน `src/stores/selectors.ts:51` ห้าม import ข้ามไฟล์แบบผิดทิศ ให้เขียนฟังก์ชันของตัวเองใน `utils/incomeDeposits.ts` (util ไม่ควรพึ่ง selectors)
- `applyBankDelta(accounts, accountId, year, month, delta)` มีอยู่แล้วใน `src/utils/bankAccounts.ts:121` — ใช้ตัวนี้ ห้ามเขียนใหม่
- `MonthlyIncome` ไม่มี `investment` ใน deductions แล้ว (ย้ายไป savings) — อย่าเผลอบวก
- `IncomeForm.tsx` ยาว 615 บรรทัดแล้ว — เพิ่ม dropdown + modal สรุปต้อง **แตกเป็น component ลูก** (`IncomeDepositSummary.tsx`) ไม่ยัดเพิ่ม

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/utils/incomeDeposits.ts` | `computeIncomeDeposits`, `isSalaryUnderwater`, `sumIncomeDeductions` (pure) | **สร้างใหม่** |
| `scripts/verify-income-deposit.ts` | assertions ทั้งหมดของฟีเจอร์นี้ | **สร้างใหม่** |
| `src/components/forms/IncomeDepositSummary.tsx` | modal แจกแจงยอดฝากก่อนบันทึก | **สร้างใหม่** |
| `src/types/index.ts` | `BankAccountType`, `IncomeDepositTargets`, `IncomeDepositRef`, field ใหม่ | แก้ |
| `src/stores/financeStore.ts` | reconcile ใน `addIncome` / `updateIncome` | แก้ |
| `src/utils/exportImport.ts` | preserve field ใหม่ | แก้ |
| `src/components/accounts/BankAccountForm.tsx` | dropdown ประเภทบัญชี | แก้ |
| `src/components/accounts/BankAccountCard.tsx` | badge ประเภท | แก้ |
| `src/components/forms/IncomeForm.tsx` | dropdown "เข้าบัญชี" ต่อช่อง + เรียก modal | แก้ |
| `features.json` | บันทึก F39 | แก้ |

**TDD ในโปรเจกต์นี้:** เขียน assertion ลง verify script → รันให้ **fail** → implement → รันให้ **pass** → commit

---

## Task 1: Schema + pure util

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/incomeDeposits.ts`
- Create: `scripts/verify-income-deposit.ts`

- [ ] **Step 1: เขียน verify script ที่ยังไม่ผ่าน**

```ts
/**
 * Verification for F39 — income → bank deposit.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
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

const baseIncome: MonthlyIncome = {
  month: 7,
  salary: 80000,
  bonus: 50000,
  commission: 120000,
  otherIncome: 5000,
  deductions: { tax: 12000, socialSecurity: 750, providentFund: 4000, gsl: 3250 },
};
// ยอดหักรวม = 20,000 → เงินเดือนเข้าบัญชี 60,000

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
```

> ตัดสินใจที่ assertion บังคับไว้: **ยอดฝาก 0 ไม่สร้าง ref** (ทั้งกรณีโบนัส 0 และกรณี underwater) เพราะ `applyBankDelta` ด้วย delta 0 จะสร้าง key เดือนเปล่าๆ ในบัญชีโดยไม่จำเป็น

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts`
Expected: FAIL — `Cannot find module '../src/utils/incomeDeposits'`

- [ ] **Step 3: เพิ่ม types ใน `src/types/index.ts`**

ใต้ `export interface BankAccount { ... }` เพิ่ม:

```ts
/**
 * ประเภทบัญชี — ใช้เลือก default ปลายทางของเงินเดือน และแสดง badge บนการ์ด
 * เท่านั้น. ไม่มีผลต่อการคำนวณยอดใดๆ.
 */
export type BankAccountType = 'salary' | 'savings' | 'cash' | 'other';
```

ใน `interface BankAccount` เพิ่ม:
```ts
  /** ประเภทบัญชี. Optional — บัญชีเดิมไม่มี field นี้ ถือเป็น 'other'. */
  type?: BankAccountType;
```

ใต้ `interface MonthlyIncome` (ก่อนหรือหลังก็ได้) เพิ่ม:
```ts
/** ปลายทางของรายได้แต่ละช่อง (BankAccount.id). undefined = ไม่ลงบัญชี. */
export interface IncomeDepositTargets {
  salary?: string;
  bonus?: string;
  commission?: string;
  otherIncome?: string;
}

/** สิ่งที่ถูกเขียนลงยอดบัญชีไปแล้วจริง — ใช้ revert ตอนแก้/ลบ. */
export interface IncomeDepositRef {
  source: 'salary' | 'bonus' | 'commission' | 'otherIncome';
  accountId: string;
  amount: number;
}
```

ใน `interface MonthlyIncome` เพิ่ม 2 field:
```ts
  /** ปลายทางที่ผู้ใช้เลือกไว้ต่อช่อง. Optional, backward-compat. */
  deposits?: IncomeDepositTargets;
  /**
   * ยอดที่ฝากเข้าบัญชีไปแล้วจริง — เขียนโดย store เท่านั้น ห้ามแก้จากฟอร์ม.
   * ต้องเก็บตัวเลขจริงไว้ เพราะ revert ต้องคืนยอด "ที่เคยฝาก" ไม่ใช่ยอดที่
   * คำนวณใหม่จากค่าปัจจุบัน (ค่าเปลี่ยนไปแล้ว → คืนผิด → ยอดบัญชีเพี้ยนถาวร).
   */
  depositSideEffects?: IncomeDepositRef[];
```

- [ ] **Step 4: implement `src/utils/incomeDeposits.ts`**

```ts
/**
 * WealthLens — แปลงรายได้รายเดือนเป็นยอดฝากเข้าบัญชี (F39).
 *
 * เงินเดือนเข้าบัญชีเป็นยอด "หลังหัก" (สลิปหักภาษี/ประกันสังคม/กองทุน/กยศ
 * ก่อนโอน) ส่วนโบนัส/คอม/รายได้อื่นๆ เข้าเต็มจำนวนตามช่องที่ผู้ใช้เลือก.
 *
 * ยอด 0 ไม่สร้าง ref — เขียน delta 0 ลงบัญชีไม่มีความหมาย มีแต่จะสร้าง
 * key เดือนเปล่าๆ ทิ้งไว้.
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now.
 */
import type {
  IncomeDepositRef,
  MonthlyDeductions,
  MonthlyIncome,
} from '@/types';

/** ยอดหักรวมทั้งสลิป. (`investment` ย้ายไป savings แล้ว — อย่าบวกกลับ.) */
export const sumIncomeDeductions = (d: MonthlyDeductions): number =>
  d.tax + d.socialSecurity + d.providentFund + d.gsl;

/** เงินเดือนหลังหัก — clamp ที่ 0 ไม่ให้ฝากยอดติดลบ. */
export const netSalaryForDeposit = (income: MonthlyIncome): number =>
  Math.max(0, income.salary - sumIncomeDeductions(income.deductions));

/** true เมื่อยอดหักมากกว่าเงินเดือน — UI เตือนก่อนบันทึก. */
export const isSalaryUnderwater = (income: MonthlyIncome): boolean =>
  income.salary - sumIncomeDeductions(income.deductions) < 0;

export const computeIncomeDeposits = (
  income: MonthlyIncome,
): IncomeDepositRef[] => {
  const targets = income.deposits;
  if (!targets) return [];

  const rows: ReadonlyArray<{
    source: IncomeDepositRef['source'];
    accountId: string | undefined;
    amount: number;
  }> = [
    { source: 'salary', accountId: targets.salary, amount: netSalaryForDeposit(income) },
    { source: 'bonus', accountId: targets.bonus, amount: income.bonus },
    { source: 'commission', accountId: targets.commission, amount: income.commission },
    { source: 'otherIncome', accountId: targets.otherIncome, amount: income.otherIncome ?? 0 },
  ];

  const refs: IncomeDepositRef[] = [];
  for (const row of rows) {
    if (!row.accountId || row.amount <= 0) continue;
    refs.push({ source: row.source, accountId: row.accountId, amount: row.amount });
  }
  return refs;
};
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
npm run typecheck
```
Expected: `✅ ผ่านทั้งหมด` + typecheck exit 0

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/incomeDeposits.ts scripts/verify-income-deposit.ts
git commit -m "feat(income): schema + computeIncomeDeposits (F39)"
```

---

## Task 2: Store reconcile

**Files:**
- Modify: `src/stores/financeStore.ts` (`addIncome` ~487, `updateIncome` ~512)
- Modify: `scripts/verify-income-deposit.ts`

- [ ] **Step 1: เพิ่ม store assertions (imports ไว้บนสุด)**

```ts
import { useFinanceStore } from '../src/stores/financeStore';
import type { BankAccount } from '../src/types';
```

ดูวิธี drive store จาก `scripts/verify-installment-deduction.ts` (มี localStorage shim อยู่แล้ว) แล้วเขียน:

```ts
// --- store: addIncome ฝากเงินเข้าบัญชี ---
const store = useFinanceStore;
const accounts: BankAccount[] = [
  { id: 'acc-salary', name: 'กสิกร', type: 'salary', balances: {} },
  { id: 'acc-cash', name: 'เงินสด', type: 'cash', balances: {} },
];
store.setState((s) => ({ data: { ...s.data, bankAccounts: accounts, years: {} } }));

const bal = (id: string, y: number, m: number): number =>
  store.getState().data.bankAccounts?.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;

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
store.getState().updateIncome(2026, 7, { deductions: { ...baseIncome.deductions, tax: 22000 } });
eq('หักเพิ่ม 10,000 → ฝากลดเหลือ 60,000', bal('acc-salary', 2026, 7), 60000);

// --- ย้ายโบนัสไปอีกบัญชี → A ลด B เพิ่ม ---
store.getState().updateIncome(2026, 7, { deposits: { salary: 'acc-salary', bonus: 'acc-salary' } });
eq('เงินสดถูกคืนเป็น 0', bal('acc-cash', 2026, 7), 0);
eq('บัญชีเงินเดือน = 60,000 + 50,000', bal('acc-salary', 2026, 7), 110000);

// --- เอาบัญชีออกจากช่อง → คืนยอดที่เคยฝาก ---
store.getState().updateIncome(2026, 7, { deposits: {} });
eq('ถอน deposits → บัญชีกลับเป็น 0', bal('acc-salary', 2026, 7), 0);

// --- ข้อมูลเดิมไม่มี deposits → ไม่แตะบัญชี ---
store.setState((s) => ({ data: { ...s.data, bankAccounts: accounts, years: {} } }));
store.getState().addIncome(2026, baseIncome);
eq('ไม่มี deposits → ยอดบัญชีไม่ขยับ', bal('acc-salary', 2026, 7), 0);
eq('ไม่มี depositSideEffects', store.getState().data.years['2026'].income[0].depositSideEffects, undefined);
```

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts`
Expected: FAIL ที่ `ฝากเงินเดือน 60,000` — ได้ 0 เพราะ store ยังไม่ทำ side-effect

- [ ] **Step 3: implement reconcile ใน `financeStore.ts`**

เพิ่ม helper ระดับไฟล์ (ใกล้ๆ `expenseDeductionOf` ของ F34 เพื่อให้อ่านคู่กันได้):

```ts
/**
 * คืนยอดที่เคยฝาก แล้วลงยอดใหม่ — reconcile แบบเดียวกับ F34.
 * ต้อง revert ด้วย `oldRefs` (ตัวเลขที่ฝากจริง) ไม่ใช่คำนวณใหม่จาก income
 * ปัจจุบัน เพราะ salary/deductions อาจเปลี่ยนไปแล้ว.
 */
const reconcileIncomeDeposits = (
  accounts: readonly BankAccount[] | undefined,
  year: number,
  month: number,
  oldRefs: IncomeDepositRef[] | undefined,
  newRefs: IncomeDepositRef[],
): BankAccount[] | undefined => {
  if (!accounts) return accounts;
  let next: BankAccount[] = accounts.slice();
  for (const ref of oldRefs ?? []) {
    next = applyBankDelta(next, ref.accountId, year, month, -ref.amount);
  }
  for (const ref of newRefs) {
    next = applyBankDelta(next, ref.accountId, year, month, ref.amount);
  }
  return next;
};
```

`addIncome` — แทนที่ body เดิม (คงพฤติกรรม replace-by-month ไว้):

```ts
      addIncome: (year, income) =>
        set((state) => {
          const years = ensureYear(state.data.years, year);
          const key = String(year);
          const current = years[key];
          const previous = current.income.find((i) => i.month === income.month);

          const newRefs = computeIncomeDeposits(income);
          const nextAccounts = reconcileIncomeDeposits(
            state.data.bankAccounts,
            year,
            income.month,
            previous?.depositSideEffects,
            newRefs,
          );
          const nextRow: MonthlyIncome = {
            ...income,
            ...(newRefs.length > 0 ? { depositSideEffects: newRefs } : {}),
          };

          const nextIncome = previous
            ? current.income.map((i) => (i.month === income.month ? nextRow : i))
            : [...current.income, nextRow];
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              ...(nextAccounts ? { bankAccounts: nextAccounts } : {}),
              lastUpdated: stamp,
              years: { ...years, [key]: { ...current, income: nextIncome } },
            },
            lastUpdated: stamp,
          };
        }),
```

`updateIncome` — คำนวณแถวที่ merge แล้วก่อน แล้ว reconcile ด้วยแถวนั้น:

```ts
      updateIncome: (year, month, patch) =>
        set((state) => {
          const key = String(year);
          const current = state.data.years[key];
          if (!current) return state;
          const previous = current.income.find((i) => i.month === month);
          if (!previous) return state;

          const merged: MonthlyIncome = {
            ...previous,
            ...patch,
            deductions: patch.deductions
              ? { ...previous.deductions, ...patch.deductions }
              : previous.deductions,
          };
          const newRefs = computeIncomeDeposits(merged);
          const nextAccounts = reconcileIncomeDeposits(
            state.data.bankAccounts,
            year,
            month,
            previous.depositSideEffects,
            newRefs,
          );
          const nextRow: MonthlyIncome = { ...merged };
          if (newRefs.length > 0) nextRow.depositSideEffects = newRefs;
          else delete nextRow.depositSideEffects;

          const nextIncome = current.income.map((i) => (i.month === month ? nextRow : i));
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              ...(nextAccounts ? { bankAccounts: nextAccounts } : {}),
              lastUpdated: stamp,
              years: { ...state.data.years, [key]: { ...current, income: nextIncome } },
            },
            lastUpdated: stamp,
          };
        }),
```

import ที่ต้องเพิ่มบนสุดของ `financeStore.ts`:
```ts
import { computeIncomeDeposits } from '@/utils/incomeDeposits';
```
(`applyBankDelta` ถูก import อยู่แล้วจาก F34 — ตรวจก่อน อย่า import ซ้ำ)

- [ ] **Step 4: รันให้ผ่าน + regression**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-income-totals.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-payment.ts
npm run typecheck
```
Expected: ทุกคำสั่ง exit 0 — `verify-income-totals.ts` พิสูจน์ว่าสูตร netAll ของ seed ไม่เพี้ยน

- [ ] **Step 5: Commit**

```bash
git add src/stores/financeStore.ts scripts/verify-income-deposit.ts
git commit -m "feat(income): reconcile ยอดฝากเข้าบัญชีใน addIncome/updateIncome (F39)"
```

---

## Task 3: preserve ตอน import

**Files:**
- Modify: `src/utils/exportImport.ts`
- Modify: `scripts/verify-income-deposit.ts`

- [ ] **Step 1: เพิ่ม assertion**

อ่าน `validateBackup` + `validateExpenseItem` ใน `src/utils/exportImport.ts` เพื่อดูรูป payload จริง (F37 เพิ่ม `loanId` ไว้ที่นั่น ใช้เป็นต้นแบบ) แล้วเขียน round-trip test: payload ที่มี `bankAccounts[0].type = 'salary'` และ `income[0].deposits` + `depositSideEffects` → หลัง `validateBackup` ต้องยังอยู่ครบทั้งสาม field

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts`
Expected: FAIL — field หายหลัง validate

- [ ] **Step 3: preserve ใน `exportImport.ts`**

ในตัว validate ของ income row เพิ่ม (ตามแบบ `loanId` ของ F37):
```ts
  // F39 income→bank: ไม่ preserve = ยอดฝากที่เคยลงบัญชี revert ไม่ได้หลัง restore
  if (isObject(raw.deposits)) {
    item.deposits = raw.deposits as unknown as MonthlyIncome['deposits'];
  }
  if (Array.isArray(raw.depositSideEffects)) {
    item.depositSideEffects = raw.depositSideEffects as unknown as MonthlyIncome['depositSideEffects'];
  }
```
และในตัว validate ของ bank account เพิ่ม:
```ts
  if (isString(raw.type)) {
    account.type = raw.type as BankAccountType;
  }
```
> ถ้า `validateBackup` ยังไม่มีตัว validate แยกสำหรับ income/bankAccounts ให้ตามหาโค้ดที่ copy ทั้ง object แล้วยืนยันว่า field ใหม่รอดอยู่แล้ว — ถ้ารอด ให้เขียน assertion กำกับไว้เฉยๆ แล้วข้าม step นี้ (บอกไว้ในรายงาน)

- [ ] **Step 4: รันให้ผ่าน + commit**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
npm run typecheck
git add src/utils/exportImport.ts scripts/verify-income-deposit.ts
git commit -m "feat(income): preserve deposits/type ตอน import (F39)"
```

---

## Task 4: UI — ประเภทบัญชี

**Files:**
- Modify: `src/components/accounts/BankAccountForm.tsx`
- Modify: `src/components/accounts/BankAccountCard.tsx`

- [ ] **Step 1: `BankAccountForm` — dropdown ประเภท**

state: `const [type, setType] = useState<BankAccountType>(initialAccount?.type ?? 'other');`

dropdown ใต้ช่องชื่อบัญชี:
```tsx
<label className="block text-sm font-medium text-slate-700">
  ประเภทบัญชี
  <select
    value={type}
    onChange={(e) => setType(e.target.value as BankAccountType)}
    className={inputCls}
  >
    <option value="salary">บัญชีเงินเดือน</option>
    <option value="savings">บัญชีออมทรัพย์</option>
    <option value="cash">เงินสด</option>
    <option value="other">อื่นๆ</option>
  </select>
  <span className="mt-1 block text-xs text-slate-500">
    ใช้ตั้งค่าเริ่มต้นว่าเงินเดือนจะเข้าบัญชีไหน
  </span>
</label>
```
ส่ง `type` เข้า action ที่ฟอร์มเรียกอยู่แล้ว (`addBankAccount` / `updateBankAccount`) — อ่านไฟล์ store เพื่อดูว่า input type ต้องเพิ่ม field ไหม แล้วเพิ่มให้ครบ

- [ ] **Step 2: `BankAccountCard` — badge**

```tsx
const TYPE_LABEL: Record<BankAccountType, string> = {
  salary: '💼 เงินเดือน',
  savings: '🏦 ออมทรัพย์',
  cash: '💵 เงินสด',
  other: '',
};
```
แสดง badge ข้างชื่อบัญชีเมื่อ `account.type != null && account.type !== 'other'` ใช้คลาส badge แบบเดียวกับที่การ์ดใช้อยู่แล้ว (ดู badge "รวมทั้งปี")

- [ ] **Step 3: ยืนยัน + commit**

```bash
npm run typecheck && npm run lint && npm run build
git add src/components/accounts/BankAccountForm.tsx src/components/accounts/BankAccountCard.tsx src/stores/financeStore.ts
git commit -m "feat(accounts): ประเภทบัญชี + badge (F39)"
```

---

## Task 5: UI — dropdown ในฟอร์มรายได้ + modal สรุป

**Files:**
- Create: `src/components/forms/IncomeDepositSummary.tsx`
- Modify: `src/components/forms/IncomeForm.tsx`

- [ ] **Step 1: `IncomeDepositSummary.tsx`**

```tsx
/**
 * WealthLens — สรุปยอดฝากเข้าบัญชีก่อนบันทึกรายได้ (F39).
 *
 * เงินจะถูกเขียนลงยอดบัญชีจริง ผู้ใช้จึงต้องเห็นก่อนว่าอะไรเข้าที่ไหนเท่าไหร่
 * — โดยเฉพาะเงินเดือนที่ฝาก "หลังหัก" ซึ่งไม่ตรงกับตัวเลขที่เพิ่งพิมพ์ไป.
 */
import type { ReactNode } from 'react';

import Modal from '@/components/ui/Modal';
import type { BankAccount, IncomeDepositRef } from '@/types';
import { formatTHB } from '@/utils/formatters';

const SOURCE_LABEL: Record<IncomeDepositRef['source'], string> = {
  salary: 'เงินเดือน (หลังหัก)',
  bonus: 'โบนัส',
  commission: 'คอมมิชชั่น',
  otherIncome: 'รายได้อื่นๆ',
};

interface IncomeDepositSummaryProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  refs: ReadonlyArray<IncomeDepositRef>;
  /** ยอดที่เคยฝากไว้ (โหมดแก้ไข) — ใช้โชว์ส่วนต่าง. */
  previousRefs?: ReadonlyArray<IncomeDepositRef>;
  accounts: ReadonlyArray<BankAccount>;
  /** true → เตือนว่ายอดหักมากกว่าเงินเดือน (จะฝาก ฿0). */
  salaryUnderwater: boolean;
  monthLabel: string;
}
```

เนื้อใน: ตารางแถวละ `SOURCE_LABEL[ref.source] → ชื่อบัญชี → +ยอด` (หา `accounts.find(a => a.id === ref.accountId)?.name ?? 'บัญชีที่ถูกลบ'`), แถวรวมด้านล่าง, แถบเตือนสีเหลืองเมื่อ `salaryUnderwater`, และเมื่อ `previousRefs` มีค่าให้แสดง `ยอดฝากเดิม ฿X → ใหม่ ฿Y` เทียบยอดรวม ปุ่ม "ยกเลิก" / "ยืนยันบันทึก"

- [ ] **Step 2: `IncomeForm` — dropdown ต่อช่อง**

state: `const [deposits, setDeposits] = useState<IncomeDepositTargets>(existing?.deposits ?? defaultTargets)`

`defaultTargets` = `{ salary: accounts.find(a => a.type === 'salary')?.id }` (ช่องอื่นเว้นว่าง — ไม่เดาแทนผู้ใช้)

ใต้ input ของแต่ละช่อง (เงินเดือน/โบนัส/คอม/อื่นๆ) วาง select ตัวเล็ก:
```tsx
<select
  value={deposits[field] ?? ''}
  onChange={(e) => setDeposits((p) => ({ ...p, [field]: e.target.value || undefined }))}
  aria-label={`บัญชีปลายทางของ ${label}`}
  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
>
  <option value="">— ไม่ลงบัญชี —</option>
  {accounts.map((a) => (
    <option key={a.id} value={a.id}>{a.name}</option>
  ))}
</select>
```
ซ่อน select ทั้งหมดเมื่อ `accounts.length === 0`

- [ ] **Step 3: `IncomeForm` — เรียก modal ก่อนบันทึก**

`handleSubmit` เดิมเรียก `addIncome(year, income)` ตรงๆ เปลี่ยนเป็น:
```ts
const pendingIncome = { ...income, deposits };
const refs = computeIncomeDeposits(pendingIncome);
if (refs.length === 0) {
  addIncome(year, pendingIncome);   // ไม่มีอะไรจะฝาก → ไม่กวนด้วย modal
  onSaved?.();
  return;
}
setPending(pendingIncome);           // เปิด modal
```
`onConfirm` ของ modal → `addIncome(year, pending)` + toast + `onSaved?.()`
`previousRefs` = `existing?.depositSideEffects`

- [ ] **Step 4: ยืนยัน**

```bash
npm run typecheck && npm run lint && npm run build
for f in scripts/verify-*.ts; do npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null || echo "FAILED $f"; done
```
Expected: exit 0 ทุกคำสั่ง, ไม่มี `FAILED`

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/IncomeForm.tsx src/components/forms/IncomeDepositSummary.tsx
git commit -m "feat(income): dropdown เข้าบัญชี + modal สรุปก่อนบันทึก (F39)"
```

---

## Task 6: ทดสอบในแอปจริง + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 1: ขับ UI จริง**

```bash
npm run dev
```
1. `/accounts` → แก้บัญชี "กสิกรไทย (เงินเดือน)" → ประเภท = บัญชีเงินเดือน → เห็น badge `💼 เงินเดือน`
2. `/monthly` เดือนที่ยังไม่มีรายได้ → กรอกเงินเดือน 80,000 · หัก 20,000 · โบนัส 50,000 (เลือกเงินสด) · คอม (ไม่ลงบัญชี) → กดบันทึก
3. modal ต้องแจกแจง: เงินเดือน → กสิกร +฿60,000 · โบนัส → เงินสด +฿50,000 · รวม ฿110,000
4. ยืนยัน → `/accounts` ยอดกสิกรเดือนนั้น +60,000 เงินสด +50,000
5. กลับไปแก้เงินเดือนเป็น 90,000 → บันทึกอีกครั้ง → ยอดกสิกรต้องเป็น 70,000 **ไม่ใช่ 130,000** (พิสูจน์ reconcile)
6. เอาบัญชีออกจากทุกช่อง → บันทึก → ยอดบัญชีกลับเป็นค่าเดิมก่อนเริ่มทดลอง

**ล้างข้อมูลทดลองให้หมดหลังเทส**

- [ ] **Step 2: อัปเดต `features.json`**

เพิ่มใน `phases[4].features` ต่อจาก F38:

```json
        {
          "id": "F39",
          "name": "รายได้เข้าบัญชีอัตโนมัติ + ประเภทบัญชี",
          "description": "กรอกรายได้ครั้งเดียว → เงินเข้าบัญชีที่เลือกต่อช่อง (เงินเดือน = salary − หัก; โบนัส/คอม/อื่นๆ เต็มจำนวน) พร้อมสรุปก่อนบันทึกและ reconcile ตอนแก้",
          "status": "completed",
          "priority": "P1",
          "phase": "phase_4",
          "acceptanceCriteria": [
            "BankAccount.type?: 'salary'|'savings'|'cash'|'other' (optional) — ใช้ default + badge เท่านั้น",
            "MonthlyIncome.deposits? (ปลายทางต่อช่อง) + depositSideEffects? (ยอดที่ฝากจริง สำหรับ revert)",
            "เงินเดือนฝาก salary − ยอดหักรวม; หัก > เงินเดือน → ฝาก 0 + เตือนใน modal",
            "โบนัส/คอม/รายได้อื่นๆ ฝากเต็มจำนวนตามบัญชีที่เลือก; 'ไม่ลงบัญชี' ได้",
            "ยอด 0 ไม่สร้าง ref (ไม่เขียน delta 0 ลงบัญชี)",
            "addIncome/updateIncome reconcile: revert ด้วยยอดที่ฝากจริง แล้ว apply ใหม่ — แก้ deductions ก็ reconcile",
            "modal สรุปแจกแจงก่อนบันทึก; ไม่มีช่องไหนเลือกบัญชี → ข้าม modal",
            "ข้อมูลเดิมไม่มี deposits → ไม่แตะยอดบัญชี; import preserve ทุก field ใหม่",
            "Verified: scripts/verify-income-deposit.ts + verify-income-totals/bank-accounts/expense-payment ไม่ regress + typecheck + lint + build + UI run จริง"
          ],
          "estimatedHours": 6,
          "dependencies": ["F32", "F33", "F34"],
          "checkpoint": {
            "completed": true,
            "completedAt": "2026-07-09",
            "notes": "Spec: docs/superpowers/specs/2026-07-09-income-deposit-design.md | Plan: docs/superpowers/plans/2026-07-09-income-deposit.md | Files: utils/incomeDeposits.ts (ใหม่), components/forms/IncomeDepositSummary.tsx (ใหม่), types/index.ts, stores/financeStore.ts (reconcileIncomeDeposits), utils/exportImport.ts, components/accounts/{BankAccountForm,BankAccountCard}.tsx, components/forms/IncomeForm.tsx | หมายเหตุ: IncomeForm เรียก addIncome ทั้ง create/edit → reconcile อยู่ใน addIncome ด้วย; ไม่แตะสูตร calculateNetAll"
          }
        }
```

และแก้ `progressSummary`: `totalFeatures` 46 → 47, `completed` 46 → 47

- [ ] **Step 3: Commit**

```bash
git add features.json
git commit -m "docs: F39 รายได้เข้าบัญชีอัตโนมัติ — completed"
```

---

## Self-Review Notes

- **§4 spec (นิยามยอดฝาก)** → Task 1 (`netSalaryForDeposit` clamp 0, `isSalaryUnderwater`)
- **§5 spec (data model)** → Task 1 (types) + Task 3 (import preservation)
- **§6 spec (store)** → Task 2 (`reconcileIncomeDeposits` ทั้ง `addIncome` และ `updateIncome`)
- **§7 spec (UI)** → Task 4 (ประเภทบัญชี + badge) + Task 5 (dropdown + modal + ส่วนต่างโหมดแก้ไข)
- **§8 spec (verification)** → assertions ใน Task 1/2/3 (ครบ 12 ข้อ) + regression sweep ใน Task 5 + UI run ใน Task 6
- ชื่อ/ชนิดตรงกันทุก task: `computeIncomeDeposits`, `isSalaryUnderwater`, `netSalaryForDeposit`, `sumIncomeDeductions`, `reconcileIncomeDeposits`, `IncomeDepositTargets`, `IncomeDepositRef`, `depositSideEffects`, `BankAccountType`
- ลำดับบังคับ: Task 1 → 2 (store พึ่ง util) → 3 → 4 → 5 (UI พึ่งทั้ง store และ util)
