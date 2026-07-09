# F37 — ผูกรายจ่ายกับหนี้ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รายจ่ายรายเดือนระบุได้ว่าไปชำระหนี้ก้อนไหน (`ExpenseItem.loanId`) แล้วหน้าหนี้สินหักยอดคงเหลือตามยอดจริงของรายจ่ายนั้นอัตโนมัติ

**Architecture:** pointer ชี้ทางเดียว — รายจ่าย → หนี้ (`ExpenseItem.loanId`) ไม่มี dual-write. util บริสุทธิ์ `materializeLoanPayments(loan, years)` แปลงรายจ่ายที่ผูกไว้เป็น `ScheduledPayment[]` แล้วคืน `Loan` ก้อนใหม่ → selector ทุกตัวใน `loanCalculations.ts` ทำงานต่อได้โดยไม่รู้จัก `ExpenseItem` เลย. `getPrincipalRemaining` เปลี่ยนเป็น waterfall เพราะเงินจากรายจ่ายเข้ามาเป็นก้อน ไม่ตรงงวดเสมอ

**Tech Stack:** TypeScript strict · React 19 · Zustand · Tailwind · verification ด้วย `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts` (โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite)

**Spec:** `docs/superpowers/specs/2026-07-09-expense-loan-link-design.md`

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/utils/loanPayments.ts` | `materializeLoanPayments` — รายจ่ายที่ผูก → payment rows (pure) | **สร้างใหม่** |
| `scripts/verify-expense-loan-link.ts` | assertions ทั้งหมดของฟีเจอร์นี้ | **สร้างใหม่** |
| `src/types/index.ts` | `ExpenseItem.loanId?: string` | แก้ |
| `src/utils/loanCalculations.ts` | `getPrincipalRemaining` → waterfall | แก้ |
| `src/utils/exportImport.ts` | preserve `loanId` ตอน import | แก้ |
| `src/hooks/useFinanceData.ts` | `useResolvedLoans()` / `useResolvedLoan(id)` | แก้ |
| `src/components/forms/ExpenseForm.tsx` | dropdown "ชำระหนี้" | แก้ |
| `src/components/forms/ExpenseList.tsx` | badge 💰 ชื่อหนี้ | แก้ |
| `src/pages/LoansPage.tsx` | ใช้ resolved loans | แก้ |
| `src/components/dashboard/LoanSummaryCard.tsx` | ใช้ resolved loan | แก้ |
| `src/components/loans/LoanForm.tsx` | rename checkbox label | แก้ |
| `src/components/loans/LoanDetail.tsx` | บรรทัด "ยอดคำนวณจากรายจ่ายที่ผูกไว้ N รายการ" | แก้ |
| `features.json` | บันทึก F37 | แก้ |

**TDD ในโปรเจกต์นี้:** เขียน assertion ลง verify script → รันให้ **fail** → implement → รันให้ **pass** → commit

---

## Task 1: `ExpenseItem.loanId` + import preservation

**Files:**
- Modify: `src/types/index.ts` (ใน `interface ExpenseItem`)
- Modify: `src/utils/exportImport.ts:226` (บล็อก optional-field preservation)
- Create: `scripts/verify-expense-loan-link.ts`

- [ ] **Step 1: เขียน verify script ที่ยังไม่ผ่าน**

สร้าง `scripts/verify-expense-loan-link.ts`:

```ts
/**
 * Verification for F37 — expense → loan payment link.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts
 */
import { validateBackup } from '../src/utils/exportImport';
import type { ExpenseItem } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- import round-trip เก็บ loanId ---
const payload = {
  version: 1,
  lastUpdated: '2026-07-09T00:00:00.000Z',
  years: {
    '2026': {
      year: 2026,
      months: {},
      income: {},
      expenses: {
        '7': {
          month: 7,
          items: [
            {
              id: 'exp-1',
              category: 'housing',
              name: 'บ้าน',
              amount: 30000,
              isRecurring: true,
              loanId: 'loan-house',
            },
          ],
        },
      },
    },
  },
};
const parsed = validateBackup(JSON.stringify(payload));
const importedItem = parsed.ok
  ? (parsed.data.years['2026'].expenses['7'].items[0] as ExpenseItem)
  : null;
eq('backup มี loanId ผ่าน validate', parsed.ok, true);
eq('import เก็บ loanId', importedItem?.loanId, 'loan-house');

// backup เก่าไม่มี field ยัง import ได้
const legacyPayload = JSON.parse(JSON.stringify(payload));
delete legacyPayload.years['2026'].expenses['7'].items[0].loanId;
const legacy = validateBackup(JSON.stringify(legacyPayload));
eq('backup เก่าไม่มี loanId ยัง import ได้', legacy.ok, true);
eq(
  'ไม่มี loanId → undefined',
  legacy.ok ? legacy.data.years['2026'].expenses['7'].items[0].loanId : 'ERR',
  undefined,
);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
```

> ก่อนรัน: อ่าน `src/utils/exportImport.ts` เพื่อดูรูปร่างจริงของ `validateBackup` (return type และรูป `YearData` ที่ต้องใช้ใน payload — `months` / `income` / `expenses` key names). ปรับ payload ให้ตรง schema จริง ห้ามแก้ assertion ให้อ่อนลง

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts`
Expected: FAIL ที่ `import เก็บ loanId` — ได้ `undefined` เพราะ `validateExpenseItem` ยังไม่ preserve field

- [ ] **Step 3: เพิ่ม field ใน `src/types/index.ts`**

ใน `interface ExpenseItem` ต่อจาก `paymentAccountId` (หรือท้ายสุดถ้าไม่มี):

```ts
  /**
   * รายจ่ายนี้เป็นการชำระหนี้ก้อนไหน (`Loan.id`). Optional — รายการทั่วไป
   * ไม่มี field นี้. หน้าหนี้สิน *อ่าน* field นี้เพื่อ derive ประวัติชำระ
   * โดยไม่เขียนอะไรกลับ: รายจ่ายคือ source of truth เดียว แก้/ลบรายจ่าย
   * แล้วยอดหนี้ขยับตามเอง ไม่มี state ให้ reconcile (ต่างจาก
   * `paymentAccountId` ซึ่ง dual-write ยอดบัญชี).
   */
  loanId?: string;
```

- [ ] **Step 4: preserve ตอน import — `src/utils/exportImport.ts`**

ต่อจากบล็อก `if (isObject(raw.sideEffects)) { ... }` ใน `validateExpenseItem`:

```ts
  // F37 loan link: รายจ่ายชี้ไปหาหนี้ที่มันชำระ — ไม่ preserve = ประวัติ
  // ชำระหนี้หายทั้งก้อนหลัง restore.
  if (isString(raw.loanId)) {
    item.loanId = raw.loanId;
  }
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts
npm run typecheck
```
Expected: `✅ ผ่านทั้งหมด` + typecheck exit 0

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/exportImport.ts scripts/verify-expense-loan-link.ts
git commit -m "feat(loans): ExpenseItem.loanId + preserve ตอน import (F37)"
```

---

## Task 2: `getPrincipalRemaining` → waterfall

**Files:**
- Modify: `src/utils/loanCalculations.ts:167-181`
- Modify: `scripts/verify-expense-loan-link.ts`

เหตุผล: ปัจจุบันตัดเงินต้นจาก "งวดที่ dueDate ≤ วันนี้" ซึ่งใช้ไม่ได้เมื่อเงินเข้ามาเป็นก้อนจากรายจ่าย (จ่าย ฿35,000 ต่องวด ฿30,000 หรือจ่ายช้า) waterfall ไล่เงินลงงวด 1→N ตัดต้นตามสัดส่วนของงวดนั้น

- [ ] **Step 1: เพิ่ม assertions (ต่อท้าย verify script ก่อนบรรทัด `console.log(failures...)`, imports ไว้บนสุดไฟล์)**

```ts
import { getPrincipalRemaining, getTotalPaid } from '../src/utils/loanCalculations';
import { generateAmortizationSchedule } from '../src/utils/amortization';
import { finalizeSchedule } from '../src/utils/loanForm';
import type { Loan } from '../src/types';
```

```ts
// --- waterfall: ตารางทดสอบ 3 งวด ต้น 1000/งวด ดอก 100/งวด (รวม 1100/งวด) ---
const flatSchedule = finalizeSchedule([
  { installmentNumber: 1, dueDate: '2026-08-05', principalAmount: 1000, interestAmount: 100 },
  { installmentNumber: 2, dueDate: '2026-09-05', principalAmount: 1000, interestAmount: 100 },
  { installmentNumber: 3, dueDate: '2026-10-05', principalAmount: 1000, interestAmount: 100 },
]);
const baseLoan: Loan = {
  id: 'loan-house',
  name: 'สินเชื่อบ้าน',
  type: 'mortgage',
  startDate: '2026-08-05',
  schedule: flatSchedule,
  scheduledPayments: [],
  extraPayments: [],
};
const refBeforeFirstDue = new Date('2026-08-01T00:00:00');

// จ่าย 2200 = 2 งวดเต็ม → ตัดต้น 2000, เหลือ 1000
const paidTwo: Loan = {
  ...baseLoan,
  scheduledPayments: [
    { id: 'sp1', date: '2026-08-05', amount: 1100 },
    { id: 'sp2', date: '2026-09-05', amount: 1100 },
  ],
};
eq('waterfall 2 งวดเต็ม', getPrincipalRemaining(paidTwo, refBeforeFirstDue), 1000);

// จ่าย 1650 = งวด 1 เต็ม (1100) + ครึ่งงวด 2 (550/1100) → ตัดต้น 1000 + 500 = 1500
const paidHalf: Loan = {
  ...baseLoan,
  scheduledPayments: [{ id: 'sp3', date: '2026-08-05', amount: 1650 }],
};
eq('waterfall เศษครึ่งงวด', getPrincipalRemaining(paidHalf, refBeforeFirstDue), 1500);

// จ่ายเกินทั้งตาราง → เงินต้นเหลือ 0 (ไม่ติดลบ)
const overpaid: Loan = {
  ...baseLoan,
  scheduledPayments: [{ id: 'sp4', date: '2026-08-05', amount: 99999 }],
};
eq('จ่ายเกิน → 0 ไม่ติดลบ', getPrincipalRemaining(overpaid, refBeforeFirstDue), 0);

// โปะตัดเงินต้นเต็มจำนวน (นอก waterfall)
const withExtra: Loan = {
  ...baseLoan,
  extraPayments: [{ id: 'x', date: '2026-08-10', amount: 500, createExpenseEntry: false }],
};
eq('โปะตัดต้นเต็ม', getPrincipalRemaining(withExtra, refBeforeFirstDue), 2500);

// regression F36: assumeOnSchedule ให้ผลเท่ากับ Σต้นของงวดที่ครบกำหนด
const assumed: Loan = { ...baseLoan, assumeOnSchedule: true };
const refAfterTwo = new Date('2026-09-20T00:00:00');
eq('assumeOnSchedule waterfall == Σต้น 2 งวด', getPrincipalRemaining(assumed, refAfterTwo), 1000);
eq('assumeOnSchedule totalPaid', getTotalPaid(assumed, refAfterTwo), 2200);
```

> `ExtraPayment.createExpenseEntry` เป็น field บังคับ — เช็ค `src/types/index.ts` แล้วปรับ literal ให้ตรง (ถ้า optional ให้ตัดออก)

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts`
Expected: FAIL ที่ `waterfall 2 งวดเต็ม` — ปัจจุบันคืน 3000 เพราะ `scheduledPayments` ไม่ถูกนำมาตัดเงินต้นเลย (ตัดจาก dueInstallments เท่านั้น ซึ่งว่างที่ refBeforeFirstDue)

- [ ] **Step 3: implement waterfall — แทนที่ `getPrincipalRemaining` ทั้งฟังก์ชัน**

```ts
/**
 * เงินต้นที่ยังไม่ได้ชำระ.
 *
 * เงินที่จ่ายผ่านตาราง (งวดที่ถือว่าจ่ายจาก `assumeOnSchedule` +
 * `scheduledPayments` ซึ่งรวมรายจ่ายที่ผูกไว้ผ่าน `materializeLoanPayments`)
 * ถูกไล่ลงงวด 1→N ตามลำดับ: งวดที่จ่ายครบตัดเงินต้นเต็ม งวดที่จ่ายไม่ครบ
 * ตัดตามสัดส่วน. เงินก้อนจากรายจ่ายจริงไม่จำเป็นต้องเท่าค่างวด — waterfall
 * จึงถูกต้องกว่าการนับงวดที่ครบกำหนด.
 *
 * โปะ (`extraPayments`) ตัดเงินต้นเต็มจำนวน นอก waterfall — เป็นสิ่งที่
 * ผู้โปะคาดหวัง (เงินลงต้นล้วน ไม่ใช่ต้น+ดอกของงวดถัดไป).
 */
export const getPrincipalRemaining = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => {
  const sorted = [...loan.schedule].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  const totalPrincipal = sorted.reduce((acc, i) => acc + i.principalAmount, 0);

  let pool = 0;
  for (const i of dueInstallments(loan, referenceDate)) pool += i.totalAmount;
  for (const sp of loan.scheduledPayments) pool += sp.amount;

  let paidPrincipal = 0;
  for (const inst of sorted) {
    if (pool <= 0) break;
    if (pool >= inst.totalAmount) {
      paidPrincipal += inst.principalAmount;
      pool -= inst.totalAmount;
    } else {
      paidPrincipal +=
        inst.totalAmount > 0
          ? inst.principalAmount * (pool / inst.totalAmount)
          : 0;
      pool = 0;
    }
  }

  for (const ep of loan.extraPayments) paidPrincipal += ep.amount;
  return Math.max(0, totalPrincipal - paidPrincipal);
};
```

- [ ] **Step 4: รันให้ผ่าน + regression**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts
npm run typecheck
```
Expected: ทุกคำสั่ง exit 0. `verify-amortization.ts` มี assertion `assumeOnSchedule: เงินต้นคงเหลือ` ที่ต้องยังผ่าน — ถ้าพัง แปลว่า waterfall ให้ผลต่างจากการนับงวด ให้หาสาเหตุ อย่าแก้ assertion

- [ ] **Step 5: Commit**

```bash
git add src/utils/loanCalculations.ts scripts/verify-expense-loan-link.ts
git commit -m "feat(loans): getPrincipalRemaining เป็น waterfall (F37)"
```

---

## Task 3: `utils/loanPayments.ts` — materialize

**Files:**
- Create: `src/utils/loanPayments.ts`
- Modify: `scripts/verify-expense-loan-link.ts`

- [ ] **Step 1: เพิ่ม assertions (ต่อท้าย verify script)**

import เพิ่มบนสุด:
```ts
import { materializeLoanPayments } from '../src/utils/loanPayments';
import { getMergedPaymentLog } from '../src/utils/loanCalculations';
import type { WealthLensData } from '../src/types';
```

```ts
// --- materializeLoanPayments ---
const yearsWithLinks = {
  '2026': {
    year: 2026,
    income: {},
    expenses: {
      '7': {
        month: 7,
        items: [
          { id: 'e1', category: 'housing', name: 'บ้าน', amount: 30000, isRecurring: true, date: '2026-07-02', loanId: 'loan-house' },
          { id: 'e2', category: 'housing', name: 'ค่าไฟ', amount: 2000, isRecurring: true },
        ],
      },
      '8': {
        month: 8,
        items: [
          { id: 'e3', category: 'housing', name: 'บ้าน', amount: 35000, isRecurring: true, loanId: 'loan-house' },
          { id: 'e4', category: 'housing', name: 'บ้าน', amount: 30000, isRecurring: true, loanId: 'loan-other' },
        ],
      },
    },
    savings: {},
  },
} as unknown as WealthLensData['years'];

const resolved = materializeLoanPayments(baseLoan, yearsWithLinks);
eq('ผูก 2 รายการ → 2 payments', resolved.scheduledPayments.length, 2);
eq('รวมยอดตามจริง (30000+35000)', getTotalPaid(resolved, refBeforeFirstDue), 65000);
eq('รายการหนี้ก้อนอื่นไม่ถูกนับ', resolved.scheduledPayments.some((p) => p.amount === 30000 && p.date === '2026-08-01'), false);
eq('ไม่มี date → วันที่ 1 ของเดือน', resolved.scheduledPayments.find((p) => p.amount === 35000)?.date, '2026-08-01');
eq('มี date → ใช้ date จริง', resolved.scheduledPayments.find((p) => p.amount === 30000)?.date, '2026-07-02');
eq('log ขึ้นเป็น auto', getMergedPaymentLog(resolved, refBeforeFirstDue)[0].source, 'auto');
eq('log label', getMergedPaymentLog(resolved, refBeforeFirstDue)[0].label, 'จ่ายผ่านรายจ่าย');

// waterfall กับเงินก้อนจริง: จ่าย 65000 เกินทั้งตาราง (3300) → ต้นเหลือ 0
eq('เงินจากรายจ่ายไหลเข้า waterfall', getPrincipalRemaining(resolved, refBeforeFirstDue), 0);

// รายจ่ายที่ผูกชนะ assumeOnSchedule (ไม่นับซ้ำ)
const assumedAndLinked: Loan = { ...baseLoan, assumeOnSchedule: true };
const resolvedBoth = materializeLoanPayments(assumedAndLinked, yearsWithLinks);
eq('มีรายจ่ายผูก → assumeOnSchedule ถูกปิด', resolvedBoth.assumeOnSchedule, false);
eq('ไม่นับซ้ำ', getTotalPaid(resolvedBoth, new Date('2026-12-31T00:00:00')), 65000);

// ไม่มี loanId ที่ไหนเลย → คืน loan ตัวเดิม (referential equality)
const noLinks = { '2026': { year: 2026, income: {}, expenses: {}, savings: {} } } as unknown as WealthLensData['years'];
eq('ไม่มีรายการผูก → คืน object เดิม', materializeLoanPayments(baseLoan, noLinks) === baseLoan, true);

// loanId ชี้หนี้ที่ถูกลบ → ไม่ throw, ไม่กระทบก้อนอื่น
const ghost: Loan = { ...baseLoan, id: 'loan-ghost' };
eq('loanId กำพร้า → ไม่มี payment', materializeLoanPayments(ghost, yearsWithLinks).scheduledPayments.length, 0);
```

> `getMergedPaymentLog` เรียงใหม่→เก่า ดังนั้น `[0]` คือรายการเดือน 8 — ยืนยันรูป `PaymentLogEntry` (`source`, `label`) ใน `src/utils/loanCalculations.ts` ก่อนเขียน assertion

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts`
Expected: FAIL — `Cannot find module '../src/utils/loanPayments'`

- [ ] **Step 3: implement `src/utils/loanPayments.ts`**

```ts
/**
 * WealthLens — แปลงรายจ่ายที่ผูกกับหนี้เป็นประวัติการชำระ (F37).
 *
 * ทิศทาง pointer: `ExpenseItem.loanId` ชี้ไปหา `Loan` — รายจ่ายคือสิ่งที่
 * เกิดขึ้นจริงและมีได้หลายรายการต่อหนึ่งหนี้. ที่นี่จึง *อ่าน* อย่างเดียว
 * แล้วคืน Loan ก้อนใหม่ที่มี payment เติมแล้ว ทำให้ selector ทุกตัวใน
 * loanCalculations.ts ทำงานต่อได้โดยไม่ต้องรู้จัก ExpenseItem
 * (dependency ชี้ทางเดียว: loanPayments → loanCalculations).
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now.
 */
import type { Loan, ScheduledPayment, WealthLensData } from '@/types';
import { EXPENSE_PAYMENT_PREFIX } from '@/utils/loanCalculations';

/** เดือนที่ไม่มี `date` ผูกกับวันที่ 1 ของเดือนนั้น (bucket = แหล่งความจริง). */
const firstOfMonth = (year: string, month: string): string =>
  `${year}-${String(Number(month)).padStart(2, '0')}-01`;

export const materializeLoanPayments = (
  loan: Loan,
  years: WealthLensData['years'],
): Loan => {
  const derived: ScheduledPayment[] = [];

  for (const [yearKey, yearData] of Object.entries(years)) {
    for (const [monthKey, monthExpense] of Object.entries(
      yearData.expenses ?? {},
    )) {
      for (const item of monthExpense.items ?? []) {
        if (item.loanId !== loan.id) continue;
        derived.push({
          // id ต้อง stable และไม่ชนกับ ScheduledPayment จริง — prefix ทำหน้าที่
          // เป็นทั้ง key ของ React และ discriminator ของ getMergedPaymentLog.
          id: `${EXPENSE_PAYMENT_PREFIX}${item.id}`,
          date: item.date ?? firstOfMonth(yearKey, monthKey),
          amount: item.amount,
          notes: item.name,
        });
      }
    }
  }

  if (derived.length === 0) return loan;

  return {
    ...loan,
    // รายจ่ายจริงชนะการสมมติเสมอ — กันนับซ้ำเมื่อผู้ใช้ติ๊ก assumeOnSchedule
    // ไว้ก่อนแล้วมาผูกรายจ่ายทีหลัง.
    assumeOnSchedule: false,
    scheduledPayments: [...loan.scheduledPayments, ...derived],
  };
};

/** จำนวนรายจ่ายที่ผูกกับหนี้ก้อนนี้ — ใช้โชว์ที่หน้ารายละเอียด. */
export const countLinkedExpenses = (
  loan: Loan,
  years: WealthLensData['years'],
): number => {
  let count = 0;
  for (const yearData of Object.values(years)) {
    for (const monthExpense of Object.values(yearData.expenses ?? {})) {
      for (const item of monthExpense.items ?? []) {
        if (item.loanId === loan.id) count += 1;
      }
    }
  }
  return count;
};
```

- [ ] **Step 4: `loanCalculations.ts` — ประกาศ prefix + แยก label**

เพิ่มใต้ `const toMs = ...`:

```ts
/**
 * `ScheduledPayment` ที่มี id ขึ้นต้นด้วย prefix นี้ถูก derive มาจาก
 * `ExpenseItem` ที่ผูกกับหนี้ (F37) — ไม่ใช่รายการที่ผู้ใช้บันทึกเอง.
 * ประกาศไว้ที่นี่เพื่อให้ dependency ชี้ทางเดียว: loanPayments → loanCalculations.
 */
export const EXPENSE_PAYMENT_PREFIX = 'expense:';
```

ใน `getMergedPaymentLog` ลูป `scheduledPayments` เปลี่ยน `label` ให้ขึ้นกับที่มา:

```ts
  for (const sp of loan.scheduledPayments) {
    const fromExpense = sp.id.startsWith(EXPENSE_PAYMENT_PREFIX);
    out.push({
      date: sp.date,
      amount: sp.amount,
      source: 'auto',
      label: fromExpense ? 'จ่ายผ่านรายจ่าย' : 'งวดเดือน',
      ...(sp.reference ? { reference: sp.reference } : {}),
      ...(sp.notes ? { notes: sp.notes } : {}),
    });
  }
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts
npm run typecheck
```
Expected: `✅ ผ่านทั้งหมด` + typecheck exit 0

- [ ] **Step 6: Commit**

```bash
git add src/utils/loanPayments.ts src/utils/loanCalculations.ts scripts/verify-expense-loan-link.ts
git commit -m "feat(loans): materializeLoanPayments — รายจ่ายที่ผูก → ประวัติชำระ (F37)"
```

---

## Task 4: hooks — `useResolvedLoans`

**Files:**
- Modify: `src/hooks/useFinanceData.ts`

- [ ] **Step 1: เพิ่ม hooks (ท้ายไฟล์)**

```ts
/**
 * Loans ที่ materialize รายจ่ายที่ผูกไว้แล้ว — ทุกหน้าที่แสดงยอดหนี้ต้อง
 * ใช้ตัวนี้ ไม่ใช่ `data.loans` ดิบ ไม่งั้นยอดคงเหลือจะไม่นับรายจ่ายที่ผูก.
 */
export const useResolvedLoans = (): Loan[] => {
  const loans = useFinanceStore((s) => s.data.loans);
  const years = useFinanceStore((s) => s.data.years);
  return useMemo(
    () => (loans ?? []).map((loan) => materializeLoanPayments(loan, years)),
    [loans, years],
  );
};
```

import ที่ต้องเพิ่มบนสุด (ตรวจว่ามีอยู่แล้วหรือยัง):
```ts
import { useMemo } from 'react';
import { materializeLoanPayments } from '@/utils/loanPayments';
import type { Loan } from '@/types';
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFinanceData.ts
git commit -m "feat(loans): useResolvedLoans hook (F37)"
```

---

## Task 5: ExpenseForm dropdown "ชำระหนี้" + ExpenseList badge

**Files:**
- Modify: `src/components/forms/ExpenseForm.tsx`
- Modify: `src/components/forms/ExpenseList.tsx`

- [ ] **Step 1: `ExpenseForm` — state + dropdown**

ต่อจาก `const [paymentAccountId, setPaymentAccountId] = useState<string>(...)`:

```ts
  const [loanId, setLoanId] = useState<string>(initialValues?.loanId ?? '');
  const loans = useFinanceStore((s) => s.data.loans) ?? [];
```
(ถ้าไฟล์ยังไม่ import `useFinanceStore` ให้เพิ่ม)

ต่อจาก `const paymentAccountIdFieldId = useId();`:
```ts
  const loanFieldId = useId();
```

JSX — วางใต้ dropdown "หมวดหมู่" (ซ่อนทั้งช่องเมื่อยังไม่มีหนี้):

```tsx
      {loans.length > 0 && (
        <div>
          <label
            htmlFor={loanFieldId}
            className="block text-sm font-medium text-slate-700"
          >
            ชำระหนี้
          </label>
          <select
            id={loanFieldId}
            value={loanId}
            onChange={(e) => setLoanId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— ไม่ระบุ —</option>
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            เลือกเมื่อรายจ่ายนี้คือการผ่อนชำระหนี้ก้อนนั้น — ยอดคงเหลือของหนี้จะลดตามยอดจริงที่จ่าย
          </p>
        </div>
      )}
```

- [ ] **Step 2: ส่งค่าตอนบันทึก**

ใน `handleSubmit` เพิ่ม `loanId: loanId || undefined,` ทั้ง **4 ที่** ที่ปัจจุบันมี `paymentAccountId: paymentAccountId || undefined,` (updateExpense patch, onSaved edit object, addExpense item, onSaved add object) — อ่านไฟล์ให้ครบ อย่าพลาดที่ไหน

- [ ] **Step 3: `ExpenseList` badge**

หา `const loans = ...` (ถ้าไม่มีให้เพิ่ม `const loans = useFinanceStore((s) => s.data.loans) ?? [];`) แล้วข้างชื่อรายการ (ตำแหน่งเดียวกับ badge "ประจำ" / แหล่งจ่าย) เพิ่ม:

```tsx
{(() => {
  const linked = loans.find((l) => l.id === item.loanId);
  return linked ? (
    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
      💰 {linked.name}
    </span>
  ) : null;
})()}
```

> ถ้าไฟล์มี helper สร้าง badge อยู่แล้ว (เช่นแบบที่ F34 ใช้แสดงแหล่งจ่าย) ให้ทำตามรูปแบบนั้นแทนที่จะยัด IIFE ลง JSX — จุดประสงค์คือ badge แสดงเฉพาะเมื่อ resolve ชื่อหนี้ได้ (หนี้ถูกลบ = ไม่แสดง ไม่ throw)

- [ ] **Step 4: typecheck + build**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: exit 0 ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/ExpenseForm.tsx src/components/forms/ExpenseList.tsx
git commit -m "feat(expense): dropdown ชำระหนี้ + badge หนี้ที่ผูก (F37)"
```

---

## Task 6: หน้าหนี้สินใช้ resolved loans

**Files:**
- Modify: `src/pages/LoansPage.tsx:28`
- Modify: `src/components/dashboard/LoanSummaryCard.tsx:18-22`
- Modify: `src/components/loans/LoanDetail.tsx`
- Modify: `src/components/loans/LoanForm.tsx`

- [ ] **Step 1: `LoansPage` — เปลี่ยนแหล่ง loans**

แทนที่ `const loans = data.loans ?? [];` ด้วย:
```ts
  const loans = useResolvedLoans();
```
import: `import { useResolvedLoans } from '@/hooks/useFinanceData';`

ระวัง: `LoanForm` ตอน **แก้ไข** ต้องได้ loan ดิบ (ไม่งั้น `scheduledPayments` ที่ derive มาจะถูกมองว่าเป็นของจริง) — หา `form.editId` แล้วดึงจาก `data.loans` ดิบ:
```ts
  const rawLoans = useFinanceStore((s) => s.data.loans) ?? [];
  const editing = form.editId ? rawLoans.find((l) => l.id === form.editId) : undefined;
```
ส่วน `openId` / `pendingDeleteId` ใช้ resolved (แสดงยอดคงเหลือจริง)

- [ ] **Step 2: `LoanSummaryCard`**

```ts
  const loans = useResolvedLoans();
  const loan = loans[0] ?? null;
  if (!loan) return null;
  const summary = getLoanSummary(loan);
```
(ลบ `const data = useFinanceStore((s) => s.data);` ถ้าไม่ถูกใช้ต่อ)

- [ ] **Step 3: `LoanDetail` — บรรทัดบอกที่มาของยอด**

ใน `LoanHero` (หรือใต้ hero) เพิ่ม เมื่อมีรายจ่ายผูก:

```tsx
{linkedCount > 0 && (
  <div className="mt-1 text-xs text-slate-400">
    ยอดคำนวณจากรายจ่ายที่ผูกไว้ {linkedCount} รายการ
  </div>
)}
```
โดยใน `LoanDetail`:
```ts
  const years = useFinanceStore((s) => s.data.years);
  const linkedCount = useMemo(() => countLinkedExpenses(loan, years), [loan, years]);
```
import: `import { countLinkedExpenses } from '@/utils/loanPayments';`
ส่ง `linkedCount` เข้า `LoanHero` ผ่าน prop

- [ ] **Step 4: `LoanForm` — เปลี่ยน label checkbox**

หาข้อความ `หักบัญชีอัตโนมัติทุกเดือน` เปลี่ยนเป็น:
```tsx
          ถือว่าจ่ายตามงวดอัตโนมัติ
          <span className="block text-xs text-slate-500">
            ยอดคงเหลือลดตามงวดที่ถึงกำหนด โดยไม่ต้องบันทึกอะไร · ถ้าผูกรายจ่ายรายเดือนกับหนี้ก้อนนี้แล้ว ไม่ต้องติ๊ก (รายจ่ายจริงมาก่อนเสมอ)
          </span>
```
(ข้อความ helper เดิม `ถือว่างวดที่ถึงกำหนดแล้ว = จ่ายแล้ว · ปิดไว้ถ้าจ่ายเองไม่ตรงงวด แล้วบันทึกเป็นโปะพิเศษแทน` ถูกแทนที่ทั้งบรรทัด)

- [ ] **Step 5: typecheck + lint + build + verify sweep**

```bash
npm run typecheck && npm run lint && npm run build
for f in scripts/verify-*.ts; do npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null || echo "FAILED $f"; done
```
Expected: exit 0 ทั้งหมด, ไม่มี `FAILED`

- [ ] **Step 6: Commit**

```bash
git add src/pages/LoansPage.tsx src/components/dashboard/LoanSummaryCard.tsx src/components/loans/LoanDetail.tsx src/components/loans/LoanForm.tsx
git commit -m "feat(loans): หน้าหนี้สินหักยอดจากรายจ่ายที่ผูก (F37)"
```

---

## Task 7: ทดสอบในแอปจริง + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 1: ขับ UI จริง**

```bash
npm run dev
```

หน้ารายเดือน → แก้รายจ่าย "บ้าน" → เลือก **ชำระหนี้: สินเชื่อบ้าน** → บันทึก
ไปหน้า `/loans` → การ์ด "สินเชื่อบ้าน" ต้องแสดงยอด **จ่ายไปแล้ว = ยอดรายจ่ายนั้น** และเงินต้นคงเหลือลดลง
กลับไปลบรายจ่ายนั้น → ยอดหนี้เด้งกลับเป็น ฿0 จ่ายแล้ว (นี่คือคุณสมบัติหลักของดีไซน์: ไม่มี state ซ้ำ)

- [ ] **Step 2: อัปเดต `features.json`**

เพิ่มใน `phases[4].features` ต่อจาก F36:

```json
        {
          "id": "F37",
          "name": "ผูกรายจ่ายกับหนี้ (Expense → Loan payment link)",
          "description": "รายจ่ายระบุได้ว่าไปชำระหนี้ก้อนไหน (ExpenseItem.loanId) แล้วหน้าหนี้สินหักยอดตามยอดจริงอัตโนมัติ — รายจ่ายเป็น source of truth เดียว",
          "status": "completed",
          "priority": "P1",
          "phase": "phase_4",
          "acceptanceCriteria": [
            "ExpenseItem.loanId?: string (optional, backward-compat) + preserve ตอน import",
            "ExpenseForm dropdown 'ชำระหนี้' (ซ่อนเมื่อไม่มีหนี้) + ExpenseList badge 💰 ชื่อหนี้",
            "materializeLoanPayments(loan, years) → Loan (pure) — loanCalculations.ts ไม่ต้องแก้ signature",
            "getPrincipalRemaining เป็น waterfall (ไล่เงินลงงวด 1→N, งวดที่จ่ายไม่ครบตัดต้นตามสัดส่วน)",
            "มีรายจ่ายผูก → assumeOnSchedule ถูกปิด (ไม่นับซ้ำ)",
            "ลบ/แก้รายจ่าย → ยอดหนี้ขยับตามทันที ไม่มี reconcile",
            "loanId กำพร้า (หนี้ถูกลบ) → ไม่ throw ไม่กระทบก้อนอื่น",
            "Verified: scripts/verify-expense-loan-link.ts + verify เดิมทั้ง 12 ตัวไม่ regress + typecheck + lint + build + UI run จริง"
          ],
          "estimatedHours": 5,
          "dependencies": ["F26", "F31", "F36"],
          "checkpoint": {
            "completed": true,
            "completedAt": "2026-07-09",
            "notes": "Spec: docs/superpowers/specs/2026-07-09-expense-loan-link-design.md | Plan: docs/superpowers/plans/2026-07-09-expense-loan-link.md | Files: utils/loanPayments.ts (ใหม่), utils/loanCalculations.ts (waterfall), types/index.ts, utils/exportImport.ts, hooks/useFinanceData.ts (useResolvedLoans), components/forms/{ExpenseForm,ExpenseList}.tsx, pages/LoansPage.tsx, components/dashboard/LoanSummaryCard.tsx, components/loans/{LoanDetail,LoanForm}.tsx | หมายเหตุ: pointer ชี้จากรายจ่าย → หนี้ (ไม่ dual-write); 1 รายจ่าย = 1 หนี้ (split = นอก scope)"
          }
        }
```

และแก้ `progressSummary`: `totalFeatures` 44 → 45, `completed` 44 → 45

- [ ] **Step 3: Commit**

```bash
git add features.json
git commit -m "docs: F37 ผูกรายจ่ายกับหนี้ — completed"
```

---

## Self-Review Notes

- **§4 spec (data model)** → Task 1 (types + import preservation)
- **§5 spec (loanPayments.ts)** → Task 3 (`materializeLoanPayments` + `countLinkedExpenses`)
- **§6 spec (waterfall)** → Task 2
- **§7 spec (UI)** → Task 5 (ExpenseForm/ExpenseList) + Task 6 (LoansPage/LoanSummaryCard/LoanDetail/LoanForm)
- **§8 spec (verification)** → assertions ใน Task 1/2/3 + regression sweep ใน Task 6 + UI run ใน Task 7
- ชื่อฟังก์ชันตรงกันทุก task: `materializeLoanPayments`, `countLinkedExpenses`, `useResolvedLoans`, `getPrincipalRemaining`, `dueInstallments`, `loanId`
- ลำดับสำคัญ: Task 2 (waterfall) มาก่อน Task 3 เพราะ assertion ของ Task 3 (`เงินจากรายจ่ายไหลเข้า waterfall`) พึ่ง waterfall
