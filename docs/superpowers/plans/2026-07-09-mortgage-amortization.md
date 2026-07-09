# F36 — หนี้บ้าน Amortization Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้เพิ่มหนี้บ้านโดยกรอกแค่ (ยอดคงเหลือ, ดอกเบี้ย %/ปี, ค่างวด/เดือน, วันงวดแรก) แล้วระบบสร้างตารางลดต้นลดดอกให้ครบทุกงวด พร้อม checkbox "หักบัญชีอัตโนมัติ" ที่ทำให้ยอดคงเหลือลดลงเองตามงวดที่ถึงกำหนด

**Architecture:** util บริสุทธิ์ตัวใหม่ `utils/amortization.ts` คืน `LoanScheduleDraftRow[]` (type เดิมจาก `utils/loanForm.ts`) แล้วไหลเข้า `finalizeSchedule()` เส้นทางบันทึกเดิม — ไม่มี write path ใหม่. Field `Loan.assumeOnSchedule?: boolean` (optional, backward-compat) ทำให้ selector ใน `loanCalculations.ts` นับงวดที่ `dueDate ≤ referenceDate` เป็น "จ่ายแล้ว" โดยไม่ต้องมี `ScheduledPayment` row. ทุก selector รับ `referenceDate` เพื่อให้ verify script กดเวลาได้

**Tech Stack:** TypeScript strict · React 19 · Zustand · Tailwind · verification ด้วย `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts` (โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite)

**Spec:** `docs/superpowers/specs/2026-07-09-mortgage-amortization-design.md`

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/utils/amortization.ts` | สร้างตารางลดต้นลดดอก (pure, total, ไม่ throw) | **สร้างใหม่** |
| `scripts/verify-amortization.ts` | assertions ทั้งหมดของฟีเจอร์นี้ | **สร้างใหม่** |
| `src/utils/loanForm.ts` | export `stepDate` ให้ amortization ใช้ซ้ำ | แก้ |
| `src/types/index.ts` | `Loan.assumeOnSchedule?: boolean` | แก้ |
| `src/utils/loanCalculations.ts` | `dueInstallments`, `getTotalPaid`, `getMergedPaymentLog`, `getThisYearProgress`, `getPrincipalRemaining`, `getLoanSummary` | แก้ |
| `src/stores/financeStore.ts` | `LoanInput` / `LoanPatch` / `addLoan` / `updateLoan` รับ flag | แก้ |
| `src/components/loans/LoanForm.tsx` | โหมดคำนวณอัตโนมัติ + checkbox | แก้ |
| `src/components/loans/LoanDetail.tsx` | โชว์ "เงินต้นคงเหลือ" | แก้ |
| `features.json` | บันทึก F36 | แก้ |

**TDD ในโปรเจกต์นี้:** เขียน assertion ลง `scripts/verify-amortization.ts` → รันให้ **fail** (compile error หรือ ✗) → implement → รันให้ **pass** → commit

---

## Task 1: `stepDate` reusable

**Files:**
- Modify: `src/utils/loanForm.ts:33` (เปลี่ยน `const stepDate` → `export const stepDate`)

- [ ] **Step 1: Export `stepDate`**

ใน `src/utils/loanForm.ts` เปลี่ยนบรรทัด

```ts
const stepDate = (
```

เป็น

```ts
export const stepDate = (
```

(comment block เหนือมันคงไว้ทั้งหมด)

- [ ] **Step 2: ยืนยันไม่พัง**

Run: `npm run typecheck`
Expected: exit 0, ไม่มี output error

- [ ] **Step 3: Commit**

```bash
git add src/utils/loanForm.ts
git commit -m "refactor(loans): export stepDate เพื่อใช้ซ้ำใน amortization"
```

---

## Task 2: `utils/amortization.ts` — เคสหลักของ Tom

**Files:**
- Create: `src/utils/amortization.ts`
- Create: `scripts/verify-amortization.ts`

- [ ] **Step 1: เขียน verify script ที่ยังไม่ผ่าน**

สร้าง `scripts/verify-amortization.ts`:

```ts
/**
 * Verification for F36 — mortgage amortization generator.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts
 */
import { generateAmortizationSchedule } from '../src/utils/amortization';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- เคสจริงของ Tom: 3,047,222.30 @ 3.75%/ปี จ่าย 30,000/เดือน ---
const tom = generateAmortizationSchedule({
  openingBalance: 3047222.3,
  annualRatePercent: 3.75,
  monthlyPayment: 30000,
  firstDueDate: '2026-08-05',
});
eq('เคส Tom สร้างตารางได้', tom.ok, true);
if (tom.ok) {
  const { rows, totalInterest, totalPaid } = tom;
  eq('จำนวนงวด', rows.length, 123);
  eq('งวด 1 ดอก', rows[0].interestAmount, 9522.57);
  eq('งวด 1 ต้น', rows[0].principalAmount, 20477.43);
  eq('งวด 1 วันครบกำหนด', rows[0].dueDate, '2026-08-05');
  eq('งวด 2 วันครบกำหนด', rows[1].dueDate, '2026-09-05');
  eq('งวดสุดท้ายวันครบกำหนด', rows[122].dueDate, '2036-10-05');
  eq(
    'งวดสุดท้ายรวม',
    Math.round((rows[122].principalAmount + rows[122].interestAmount) * 100) / 100,
    11727.32,
  );
  const sumPrincipal =
    Math.round(rows.reduce((a, r) => a + r.principalAmount, 0) * 100) / 100;
  eq('Σ ต้น = ยอดตั้งต้นเป๊ะ', sumPrincipal, 3047222.3);
  eq('Σ ดอก', Math.round(totalInterest * 100) / 100, 624505.02);
  eq('จ่ายรวม', Math.round(totalPaid * 100) / 100, 3671727.32);
  eq('installmentNumber ไล่ 1..N', rows[122].installmentNumber, 123);
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts`
Expected: FAIL — `Cannot find module '../src/utils/amortization'`

- [ ] **Step 3: Implement `src/utils/amortization.ts`**

```ts
/**
 * WealthLens — สร้างตารางผ่อนแบบลดต้นลดดอก (F36).
 *
 * ธนาคารบางแห่งไม่ส่งตารางงวดมาให้ ผู้ใช้รู้แค่ (ยอดคงเหลือ, อัตราดอกเบี้ย,
 * ค่างวด). ฟังก์ชันนี้ไล่ดอกเบี้ยรายเดือนแบบ balance × rate/12 (ตรงกับชีต
 * ของ Tom: 3,047,222.30 × 3.75% ÷ 12 = 9,522.57) แล้วคืน draft rows ที่
 * `finalizeSchedule()` ใน utils/loanForm รับต่อได้ทันที — ไม่มีเส้นทาง
 * บันทึกใหม่.
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now (วันที่ไล่จาก firstDueDate).
 * ข้อผิดพลาดคืนเป็น discriminated union ไม่ใช่ exception.
 */
import { stepDate, type LoanScheduleDraftRow } from '@/utils/loanForm';

/** เพดานกันลูปไม่รู้จบ: 600 งวด = 50 ปี */
export const MAX_PERIODS = 600;

export interface AmortizationInput {
  /** เงินต้นคงเหลือวันนี้ (บาท) */
  openingBalance: number;
  /** อัตราดอกเบี้ยต่อปีเป็นเปอร์เซ็นต์ — 3.75 = 3.75%/ปี */
  annualRatePercent: number;
  /** ค่างวดคงที่ต่อเดือน (บาท) */
  monthlyPayment: number;
  /** ISO yyyy-mm-dd ของงวดแรก */
  firstDueDate: string;
}

export type AmortizationError =
  | 'INVALID_INPUT'
  | 'PAYMENT_TOO_LOW'
  | 'TOO_MANY_PERIODS';

export type AmortizationResult =
  | {
      ok: true;
      rows: LoanScheduleDraftRow[];
      /** ผลรวมดอกเบี้ยทั้งสัญญา */
      totalInterest: number;
      /** openingBalance + totalInterest */
      totalPaid: number;
    }
  | { ok: false; error: AmortizationError };

const round2 = (n: number): number => Math.round(n * 100) / 100;

const isValidIso = (iso: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
  Number.isFinite(new Date(`${iso}T00:00:00`).getTime());

export const generateAmortizationSchedule = (
  input: AmortizationInput,
): AmortizationResult => {
  const { openingBalance, annualRatePercent, monthlyPayment, firstDueDate } =
    input;

  if (
    !Number.isFinite(openingBalance) ||
    openingBalance <= 0 ||
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent < 0 ||
    !Number.isFinite(monthlyPayment) ||
    monthlyPayment <= 0 ||
    !isValidIso(firstDueDate)
  ) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const monthlyRate = annualRatePercent / 100 / 12;
  const firstInterest = round2(openingBalance * monthlyRate);
  if (monthlyPayment <= firstInterest) {
    return { ok: false, error: 'PAYMENT_TOO_LOW' };
  }

  const rows: LoanScheduleDraftRow[] = [];
  let balance = openingBalance;
  let totalInterest = 0;

  while (balance > 0.004 && rows.length < MAX_PERIODS) {
    const interestAmount = round2(balance * monthlyRate);
    const principalAmount = round2(
      Math.min(monthlyPayment - interestAmount, balance),
    );
    balance = round2(balance - principalAmount);
    totalInterest = round2(totalInterest + interestAmount);
    rows.push({
      installmentNumber: rows.length + 1,
      dueDate: stepDate(firstDueDate, rows.length, 'monthly'),
      principalAmount,
      interestAmount,
    });
  }

  if (balance > 0.004) return { ok: false, error: 'TOO_MANY_PERIODS' };

  return {
    ok: true,
    rows,
    totalInterest,
    totalPaid: round2(openingBalance + totalInterest),
  };
};
```

> หมายเหตุ: `scripts/` รันผ่าน tsx ด้วย `tsconfig.app.json` ซึ่ง resolve alias `@/` ได้อยู่แล้ว (ดู `verify-bank-accounts.ts` ที่ import ด้วย relative path แต่ตัวโมดูลใน `src/` ใช้ `@/` ภายใน) — ถ้า tsx บ่นเรื่อง alias ให้เปลี่ยน import ใน `amortization.ts` เป็น relative `'./loanForm'` ซึ่งใช้ได้ทั้งสองทาง

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts`
Expected: `✅ ผ่านทั้งหมด` — 11 บรรทัด ✓ (จำนวนงวด 123, Σต้น 3047222.3, Σดอก 624505.02)

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/utils/amortization.ts scripts/verify-amortization.ts
git commit -m "feat(loans): amortization generator — สร้างตารางลดต้นลดดอก (F36)"
```

---

## Task 3: Guard cases + 0% + clamp สิ้นเดือน

**Files:**
- Modify: `scripts/verify-amortization.ts`

- [ ] **Step 1: เพิ่ม assertions (ต่อท้ายบล็อกเคส Tom ก่อนบรรทัด `console.log(failures...)`)**

```ts
// --- guards ---
const tooLow = generateAmortizationSchedule({
  openingBalance: 3047222.3,
  annualRatePercent: 3.75,
  monthlyPayment: 9000, // < ดอกงวดแรก 9,522.57
  firstDueDate: '2026-08-05',
});
eq('ค่างวดต่ำกว่าดอก → PAYMENT_TOO_LOW', tooLow.ok === false && tooLow.error, 'PAYMENT_TOO_LOW');

const zeroBalance = generateAmortizationSchedule({
  openingBalance: 0,
  annualRatePercent: 3.75,
  monthlyPayment: 30000,
  firstDueDate: '2026-08-05',
});
eq('ยอด 0 → INVALID_INPUT', zeroBalance.ok === false && zeroBalance.error, 'INVALID_INPUT');

const zeroPayment = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 3.75,
  monthlyPayment: 0,
  firstDueDate: '2026-08-05',
});
eq('ค่างวด 0 → INVALID_INPUT', zeroPayment.ok === false && zeroPayment.error, 'INVALID_INPUT');

const badDate = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 3.75,
  monthlyPayment: 30000,
  firstDueDate: '',
});
eq('วันที่ว่าง → INVALID_INPUT', badDate.ok === false && badDate.error, 'INVALID_INPUT');

const tooLong = generateAmortizationSchedule({
  openingBalance: 10000000,
  annualRatePercent: 5,
  monthlyPayment: 42000, // ดอกงวดแรก 41,666.67 → ผ่อนได้แต่ยาวเกิน 600 งวด
  firstDueDate: '2026-08-05',
});
eq('ยาวเกินเพดาน → TOO_MANY_PERIODS', tooLong.ok === false && tooLong.error, 'TOO_MANY_PERIODS');

// --- ดอกเบี้ย 0% ---
const zeroRate = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 0,
  monthlyPayment: 30000,
  firstDueDate: '2026-08-05',
});
eq('0% สร้างได้', zeroRate.ok, true);
if (zeroRate.ok) {
  eq('0% → 4 งวด', zeroRate.rows.length, 4);
  eq('0% → ดอกรวม 0', zeroRate.totalInterest, 0);
  eq('0% → งวดสุดท้ายเป็นเศษ', zeroRate.rows[3].principalAmount, 10000);
}

// --- clamp สิ้นเดือน: 31 ม.ค. + 1 เดือน → 28 ก.พ. ---
const clamp = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 0,
  monthlyPayment: 30000,
  firstDueDate: '2026-01-31',
});
eq('งวด 2 clamp สิ้นเดือน', clamp.ok && clamp.rows[1].dueDate, '2026-02-28');
```

- [ ] **Step 2: รัน**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts`
Expected: `✅ ผ่านทั้งหมด` — ถ้า `TOO_MANY_PERIODS` ✗ ให้ตรวจว่า loop ออกเพราะ `rows.length === MAX_PERIODS` แล้ว `balance > 0.004` จริง

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-amortization.ts
git commit -m "test(loans): guards + 0% + clamp สิ้นเดือน ของ amortization"
```

---

## Task 4: `Loan.assumeOnSchedule` + selectors

**Files:**
- Modify: `src/types/index.ts` (ใน `interface Loan`)
- Modify: `src/utils/loanCalculations.ts`
- Modify: `scripts/verify-amortization.ts`

- [ ] **Step 1: เขียน assertion ที่ยังไม่ผ่าน (ต่อท้าย verify script)**

```ts
// --- assumeOnSchedule ---
import {
  getLoanSummary,
  getMergedPaymentLog,
  getPrincipalRemaining,
  getTotalPaid,
} from '../src/utils/loanCalculations';
import { finalizeSchedule } from '../src/utils/loanForm';
import type { Loan } from '../src/types';
```
(ย้าย import ทั้งหมดไปไว้บนสุดของไฟล์ตามปกติ — TypeScript ไม่ยอมให้ import กลางไฟล์)

```ts
const mortgage: Loan = {
  id: 'test-mortgage',
  name: 'สินเชื่อบ้าน',
  type: 'mortgage',
  startDate: '2026-08-05',
  schedule: tom.ok ? finalizeSchedule(tom.rows) : [],
  scheduledPayments: [],
  extraPayments: [],
  assumeOnSchedule: true,
};
// อ้างอิงวันที่: 2026-10-10 → งวด 1 (ส.ค.) และ 2 (ก.ย.) และ 3 (5 ต.ค.) ครบกำหนดแล้ว
const ref = new Date('2026-10-10T00:00:00');
const first3Total = mortgage.schedule
  .slice(0, 3)
  .reduce((a, i) => a + i.totalAmount, 0);
const first3Principal = mortgage.schedule
  .slice(0, 3)
  .reduce((a, i) => a + i.principalAmount, 0);

eq('assumeOnSchedule: totalPaid = 3 งวดแรก',
  Math.round(getTotalPaid(mortgage, ref) * 100) / 100,
  Math.round(first3Total * 100) / 100);
eq('assumeOnSchedule: เงินต้นคงเหลือ',
  Math.round(getPrincipalRemaining(mortgage, ref) * 100) / 100,
  Math.round((3047222.3 - first3Principal) * 100) / 100);
eq('log มี 3 รายการหักตามตาราง', getMergedPaymentLog(mortgage, ref).length, 3);
eq('log label', getMergedPaymentLog(mortgage, ref)[0].label, 'หักตามตาราง');

// โปะ 100,000 → ทั้ง remaining และ principalRemaining ลดอีก 100,000
const withExtra: Loan = {
  ...mortgage,
  extraPayments: [{ id: 'x1', date: '2026-09-20', amount: 100000, createExpenseEntry: false }],
};
eq('โปะลดเงินต้น',
  Math.round(getPrincipalRemaining(withExtra, ref) * 100) / 100,
  Math.round((3047222.3 - first3Principal - 100000) * 100) / 100);

// ปิด flag → พฤติกรรมเดิมเป๊ะ
const noFlag: Loan = { ...mortgage, assumeOnSchedule: false };
eq('ปิด flag → totalPaid 0', getTotalPaid(noFlag, ref), 0);
eq('ปิด flag → log ว่าง', getMergedPaymentLog(noFlag, ref).length, 0);
eq('ปิด flag → เงินต้นคงเหลือเต็ม',
  Math.round(getPrincipalRemaining(noFlag, ref) * 100) / 100, 3047222.3);

// ไม่มี field เลย (payload เดิม) → เหมือนปิด
const legacy: Loan = { ...mortgage };
delete (legacy as { assumeOnSchedule?: boolean }).assumeOnSchedule;
eq('ไม่มี field → totalPaid 0', getTotalPaid(legacy, ref), 0);

// summary มี principalRemaining
eq('summary.principalRemaining',
  Math.round(getLoanSummary(mortgage, ref).principalRemaining * 100) / 100,
  Math.round((3047222.3 - first3Principal) * 100) / 100);
```

> `ExtraPayment` มี field `createExpenseEntry` — เช็ค `src/types/index.ts` ว่าจำเป็นหรือ optional แล้วปรับ literal ให้ตรง (ถ้า optional ให้ตัดออก)

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts`
Expected: FAIL — `getPrincipalRemaining` ไม่มี, `assumeOnSchedule` ไม่มีใน type, `getTotalPaid` รับ 1 arg

- [ ] **Step 3: เพิ่ม field ใน `src/types/index.ts`**

ใน `interface Loan` ต่อจาก `extraPayments`:

```ts
  /**
   * เมื่อ true: ถือว่าทุกงวดที่ครบกำหนดแล้ว (dueDate ≤ วันนี้) ถูกจ่ายแล้ว
   * — สำหรับหนี้ที่หักบัญชีอัตโนมัติ เช่น สินเชื่อบ้าน ที่ผู้ใช้ไม่ได้มา
   * บันทึกทีละงวด. Optional: payload เดิม (กยศ) ไม่มี field นี้ →
   * คำนวณจาก `scheduledPayments` เหมือนเดิมทุกประการ.
   */
  assumeOnSchedule?: boolean;
```

- [ ] **Step 4: แก้ `src/utils/loanCalculations.ts`**

เพิ่ม helper ใต้ `toMs`:

```ts
/**
 * งวดที่ครบกำหนดแล้ว ณ `referenceDate` — ว่างเสมอเมื่อ `assumeOnSchedule`
 * ปิด/ไม่มี (หนี้ที่บันทึกการจ่ายเอง เช่น กยศ).
 */
const dueInstallments = (
  loan: Loan,
  referenceDate: Date,
): LoanInstallment[] => {
  if (!loan.assumeOnSchedule) return [];
  const refMs = referenceDate.getTime();
  return loan.schedule.filter((i) => toMs(i.dueDate) <= refMs);
};
```

แทนที่ `getTotalPaid` ทั้งฟังก์ชัน:

```ts
export const getTotalPaid = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => {
  let total = 0;
  for (const i of dueInstallments(loan, referenceDate)) total += i.totalAmount;
  for (const sp of loan.scheduledPayments) total += sp.amount;
  for (const ep of loan.extraPayments) total += ep.amount;
  return total;
};
```

แทนที่ `getRemainingBalance`:

```ts
export const getRemainingBalance = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => Math.max(0, getScheduleTotal(loan) - getTotalPaid(loan, referenceDate));
```

เพิ่มฟังก์ชันใหม่ใต้ `getRemainingBalance`:

```ts
/**
 * เงินต้นที่ยังไม่ได้ชำระ = Σต้นทั้งตาราง − Σต้นของงวดที่จ่ายแล้ว − โปะ.
 * ต่างจาก `getRemainingBalance` ซึ่งรวมดอกเบี้ยที่ยังไม่เกิดด้วย — หนี้บ้าน
 * ต้องเห็นทั้งสองค่า (กยศ ไม่มีดอก ทั้งคู่เท่ากัน).
 */
export const getPrincipalRemaining = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => {
  const totalPrincipal = loan.schedule.reduce(
    (acc, i) => acc + i.principalAmount,
    0,
  );
  let paidPrincipal = 0;
  for (const i of dueInstallments(loan, referenceDate)) {
    paidPrincipal += i.principalAmount;
  }
  for (const ep of loan.extraPayments) paidPrincipal += ep.amount;
  return Math.max(0, totalPrincipal - paidPrincipal);
};
```

ใน `getMergedPaymentLog` เปลี่ยน signature และเพิ่มลูปแรก:

```ts
export const getMergedPaymentLog = (
  loan: Loan,
  referenceDate: Date = new Date(),
): PaymentLogEntry[] => {
  const out: PaymentLogEntry[] = [];

  for (const i of dueInstallments(loan, referenceDate)) {
    out.push({
      date: i.dueDate,
      amount: i.totalAmount,
      source: 'auto',
      label: 'หักตามตาราง',
    });
  }

  for (const sp of loan.scheduledPayments) {
    // ...เดิมทั้งหมด ไม่แก้
```

ใน `getThisYearProgress` เพิ่มก่อนลูป `scheduledPayments`:

```ts
  for (const i of dueInstallments(loan, referenceDate)) {
    if (parseIso(i.dueDate).getFullYear() === calendarYear) {
      paidThisYear += i.totalAmount;
    }
  }
```

ใน `interface LoanSummary` เพิ่ม `principalRemaining: number;` และใน `getLoanSummary`:

```ts
  const totalPaid = getTotalPaid(loan, referenceDate);
```
```ts
  return {
    scheduleTotal,
    totalPaid,
    remaining,
    principalRemaining: getPrincipalRemaining(loan, referenceDate),
    progressFraction,
    // ...เดิม
```

- [ ] **Step 5: รันให้ผ่าน + regression**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts
npm run typecheck
```
Expected: ทั้งสาม exit 0 — `verify-multi-loan` คือ regression ของ กยศ (ไม่มี flag → ค่าทุกตัวเท่าเดิม)

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/loanCalculations.ts scripts/verify-amortization.ts
git commit -m "feat(loans): assumeOnSchedule + getPrincipalRemaining (F36)"
```

---

## Task 5: Store — `assumeOnSchedule` ผ่าน addLoan / updateLoan

**Files:**
- Modify: `src/stores/financeStore.ts:148-163` (`LoanInput`, `LoanPatch`), `~1164` (`addLoan`), `updateLoan`

- [ ] **Step 1: เพิ่ม field ใน input types**

`LoanInput` เพิ่มบรรทัดสุดท้าย:
```ts
  assumeOnSchedule?: boolean;
```
`LoanPatch` เพิ่มบรรทัดสุดท้าย:
```ts
  assumeOnSchedule?: boolean;
```

- [ ] **Step 2: `addLoan` — ใส่ flag เฉพาะเมื่อ true**

ใน object `const loan: Loan = {` ต่อจาก `extraPayments: [],`:

```ts
            ...(input.assumeOnSchedule ? { assumeOnSchedule: true } : {}),
```

- [ ] **Step 3: `updateLoan` — รับ patch**

หา `updateLoan: (id, patch) =>` แล้วดูวิธี merge ปัจจุบัน (spread patch ทับ loan). ถ้าเป็น `{ ...loan, ...patch }` แบบตัด `undefined` อยู่แล้ว ไม่ต้องแก้อะไร — ยืนยันด้วยการอ่านโค้ด. ถ้า merge ทีละ field ให้เพิ่ม:

```ts
            ...(patch.assumeOnSchedule !== undefined
              ? { assumeOnSchedule: patch.assumeOnSchedule }
              : {}),
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/stores/financeStore.ts
git commit -m "feat(loans): store รับ assumeOnSchedule (F36)"
```

---

## Task 6: `LoanForm` — โหมดคำนวณอัตโนมัติ + checkbox

**Files:**
- Modify: `src/components/loans/LoanForm.tsx`

- [ ] **Step 1: state ใหม่**

ต่อจาก `const [error, setError] = useState<string | null>(null);`:

```ts
  // โหมดคำนวณเปิดได้เฉพาะตอนสร้างหนี้ใหม่ (แก้ไข = กรอกมือ/สร้างตารางใหม่ทับ)
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [openingText, setOpeningText] = useState('');
  const [rateText, setRateText] = useState('');
  const [paymentText, setPaymentText] = useState('');
  const [assumeOnSchedule, setAssumeOnSchedule] = useState(
    initialLoan?.assumeOnSchedule ?? false,
  );
```

import เพิ่มบนสุด:
```ts
import { generateAmortizationSchedule } from '@/utils/amortization';
import { formatTHB } from '@/utils/formatters';
```
(ถ้า `formatTHB` ไม่มีใน `utils/formatters` ให้ใช้ `formatNumber` ที่ import อยู่แล้ว)

- [ ] **Step 2: preview + handler**

ใต้ `const scheduleTotal = ...`:

```ts
  const autoPreview =
    mode === 'auto'
      ? generateAmortizationSchedule({
          openingBalance: Number(openingText) || 0,
          annualRatePercent: Number(rateText) || 0,
          monthlyPayment: Number(paymentText) || 0,
          firstDueDate: startDate,
        })
      : null;

  const AUTO_ERROR_TEXT: Record<string, string> = {
    INVALID_INPUT: 'กรอกยอดคงเหลือ ดอกเบี้ย ค่างวด และวันงวดแรกให้ครบ',
    PAYMENT_TOO_LOW:
      'ค่างวดน้อยกว่าดอกเบี้ยงวดแรก — ผ่อนไม่มีวันหมด ลองเพิ่มค่างวด',
    TOO_MANY_PERIODS: 'ตารางยาวเกิน 600 งวด (50 ปี) — ตรวจค่างวดอีกครั้ง',
  };

  const applyAuto = (): void => {
    if (!autoPreview?.ok) return;
    setRows(
      autoPreview.rows.map((r) => ({
        id: uuidv4(),
        dueDate: r.dueDate,
        principalText: String(r.principalAmount),
        interestText: String(r.interestAmount),
      })),
    );
    setError(null);
  };
```

- [ ] **Step 3: UI — radio + ช่องกรอก + preview**

แทนที่บล็อก `<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">…</div>` และปุ่ม "สร้างตาราง" ด้วย:

```tsx
      {!isEdit && (
        <div className="flex gap-4 text-sm">
          {(
            [
              ['manual', 'กรอกตารางเอง'],
              ['auto', 'คำนวณอัตโนมัติ (ลดต้นลดดอก)'],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-slate-700">
              <input
                type="radio"
                name="schedule-mode"
                value={v}
                checked={mode === v}
                onChange={() => setMode(v)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {mode === 'auto' && !isEdit ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <label className="block text-sm font-medium text-slate-700">
              วันงวดแรก
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              ยอดคงเหลือ (บาท)
              <input
                type="text"
                inputMode="decimal"
                value={openingText}
                onChange={(e) => setOpeningText(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="3047222.30"
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              ดอกเบี้ย (%/ปี)
              <input
                type="text"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="3.75"
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              จ่ายต่อเดือน (บาท)
              <input
                type="text"
                inputMode="decimal"
                value={paymentText}
                onChange={(e) => setPaymentText(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="30000"
                className={inputCls}
              />
            </label>
          </div>

          {autoPreview?.ok && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold tabular-nums">
                {autoPreview.rows.length} งวด
              </span>{' '}
              · จบ {autoPreview.rows[autoPreview.rows.length - 1].dueDate} · ดอกรวม{' '}
              <span className="financial-number tabular-nums">
                {formatNumber(autoPreview.totalInterest, { decimals: 0 })}
              </span>{' '}
              · จ่ายรวม{' '}
              <span className="financial-number tabular-nums">
                {formatNumber(autoPreview.totalPaid, { decimals: 0 })}
              </span>
            </div>
          )}
          {autoPreview && !autoPreview.ok && (openingText || paymentText) && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              {AUTO_ERROR_TEXT[autoPreview.error]}
            </div>
          )}

          <button
            type="button"
            onClick={applyAuto}
            disabled={!autoPreview?.ok}
            className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-light transition disabled:opacity-40"
          >
            สร้างตาราง
          </button>
        </div>
      ) : (
        <>
          {/* บล็อกเดิม: วันเริ่มงวดแรก / จำนวนงวด / ความถี่ + ปุ่มสร้างตาราง */}
        </>
      )}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={assumeOnSchedule}
          onChange={(e) => setAssumeOnSchedule(e.target.checked)}
          className="mt-1"
        />
        <span>
          หักบัญชีอัตโนมัติทุกเดือน
          <span className="block text-xs text-slate-500">
            ถือว่างวดที่ถึงกำหนดแล้ว = จ่ายแล้ว · ปิดไว้ถ้าจ่ายเองไม่ตรงงวด แล้วบันทึกเป็นโปะพิเศษแทน
          </span>
        </span>
      </label>
```

(บล็อก `{/* บล็อกเดิม */}` = ย้ายโค้ด grid 3 ช่อง + ปุ่ม "สร้างตาราง"/"สร้างตารางใหม่" เดิมมาวางตรงนี้ทั้งดุ้น ไม่แก้เนื้อใน)

**ตารางแถวที่ render:** ในโหมด auto อาจมี 123 แถว — จำกัดการ render โดยแก้ `{rows.map(...)}` เป็น:

```tsx
              {(showAllRows ? rows : rows.slice(0, 5)).map((r, idx) => (
```
พร้อม state `const [showAllRows, setShowAllRows] = useState(false);` และปุ่มใต้ตาราง:
```tsx
          {rows.length > 5 && !showAllRows && (
            <button
              type="button"
              onClick={() => setShowAllRows(true)}
              className="w-full py-2 text-sm text-primary hover:bg-slate-50"
            >
              แสดงทั้งหมด ({rows.length} งวด)
            </button>
          )}
```
> `scheduleTotal` และ `handleSubmit` ยังใช้ `rows` เต็มเสมอ — การซ่อนเป็นเรื่อง render เท่านั้น

- [ ] **Step 4: ส่ง flag ตอนบันทึก**

ใน `handleSubmit` แก้สองที่:
```ts
      updateLoan(initialLoan.id, {
        name: name.trim(),
        type,
        startDate,
        schedule,
        assumeOnSchedule,
      });
```
```ts
      addLoan({ name: name.trim(), type, startDate, schedule, assumeOnSchedule });
```

- [ ] **Step 5: typecheck + build**

```bash
npm run typecheck && npm run build
```
Expected: exit 0 ทั้งคู่

- [ ] **Step 6: Commit**

```bash
git add src/components/loans/LoanForm.tsx
git commit -m "feat(loans): LoanForm โหมดคำนวณอัตโนมัติ + checkbox หักอัตโนมัติ (F36)"
```

---

## Task 7: `LoanDetail` — แสดงเงินต้นคงเหลือ

**Files:**
- Modify: `src/components/loans/LoanDetail.tsx` (`LoanHero`)

- [ ] **Step 1: destructure เพิ่ม**

```ts
  const { remaining, principalRemaining, totalPaid, scheduleTotal, progressFraction, yearsRemaining } = summary;
```

- [ ] **Step 2: แสดงใต้ยอดคงเหลือ (แสดงเฉพาะเมื่อมีดอกเบี้ย)**

ต่อจาก `<div className="mt-1 text-sm text-slate-500">…{endLabel}…</div>` เพิ่ม:

```tsx
          {Math.round(principalRemaining) !== Math.round(remaining) && (
            <div className="mt-1 text-sm text-slate-500">
              เงินต้นคงเหลือ{' '}
              <span className="financial-number tabular-nums text-slate-700">
                {formatTHB(principalRemaining, { decimals: 2 })}
              </span>
            </div>
          )}
```

- [ ] **Step 3: ยืนยัน**

```bash
npm run typecheck && npm run build
```
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/components/loans/LoanDetail.tsx
git commit -m "feat(loans): LoanHero แสดงเงินต้นคงเหลือเมื่อหนี้มีดอกเบี้ย (F36)"
```

---

## Task 8: Regression sweep + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 1: รัน verify ทุกตัว**

```bash
for f in scripts/verify-*.ts; do echo "--- $f"; npx tsx --tsconfig tsconfig.app.json "$f" || echo "FAILED $f"; done
npm run typecheck && npm run lint && npm run build
```
Expected: ทุก script `✅` ไม่มี `FAILED`, typecheck/lint/build exit 0

- [ ] **Step 2: ทดสอบในแอปจริง**

```bash
npm run dev
```
เปิด `/loans` → `+ เพิ่มหนี้` → ชื่อ "สินเชื่อบ้าน", ประเภท "สินเชื่อบ้าน", โหมด "คำนวณอัตโนมัติ", วันงวดแรก `2026-08-05`, ยอด `3047222.30`, ดอก `3.75`, จ่าย `30000` → preview ต้องอ่านว่า **123 งวด · จบ 2036-10-05 · ดอกรวม 624,505** → ติ๊ก "หักบัญชีอัตโนมัติ" → กด "สร้างตาราง" → "เพิ่มหนี้"
ยืนยันบนหน้า: ยอดคงเหลือ ฿3,671,727.32 · เงินต้นคงเหลือ ฿3,047,222.30 · จ่ายไปแล้ว ฿0 (งวดแรกยังไม่ถึง 5 ส.ค. 2026)

- [ ] **Step 3: อัปเดต `features.json`**

เพิ่มใน `phases[4].features` (Phase 4) ต่อจาก F35:

```json
        {
          "id": "F36",
          "name": "หนี้บ้าน — Amortization Generator + หักอัตโนมัติ",
          "description": "สร้างตารางผ่อนลดต้นลดดอกจาก (ยอดคงเหลือ, ดอกเบี้ย%/ปี, ค่างวด, วันงวดแรก) + Loan.assumeOnSchedule ให้ยอดคงเหลือลดเองตามงวดที่ถึงกำหนด",
          "status": "completed",
          "priority": "P1",
          "phase": "phase_4",
          "acceptanceCriteria": [
            "utils/amortization.ts: generateAmortizationSchedule คืน draft rows เข้า finalizeSchedule เส้นทางเดิม",
            "guards: PAYMENT_TOO_LOW / INVALID_INPUT / TOO_MANY_PERIODS (ไม่ throw)",
            "Loan.assumeOnSchedule?: boolean (optional, backward-compat) — งวดที่ dueDate ≤ วันนี้ นับเป็นจ่ายแล้ว",
            "getPrincipalRemaining() + LoanHero แสดงเงินต้นคงเหลือเมื่อต่างจากยอดต้น+ดอก",
            "LoanForm: radio 2 โหมด (create เท่านั้น) + preview สด + checkbox หักอัตโนมัติ (create/edit)",
            "กยศ ของ Tom ไม่มี field → คำนวณเท่าเดิมทุกค่า (verify-multi-loan ผ่าน)",
            "Verified: scripts/verify-amortization.ts + typecheck + build"
          ],
          "estimatedHours": 5,
          "dependencies": ["F26", "F31"],
          "checkpoint": {
            "completed": true,
            "completedAt": "2026-07-09",
            "notes": "Spec: docs/superpowers/specs/2026-07-09-mortgage-amortization-design.md | Plan: docs/superpowers/plans/2026-07-09-mortgage-amortization.md"
          }
        }
```

และแก้ `progressSummary`: `totalFeatures` 43 → 44, `completed` 43 → 44

- [ ] **Step 4: Commit**

```bash
git add features.json
git commit -m "docs: F36 หนี้บ้าน amortization — completed"
```

---

## Self-Review Notes

- **§3 spec (data model)** → Task 4 (types) + Task 5 (store)
- **§4 spec (amortization.ts)** → Task 2 + Task 3
- **§5 spec (loanCalculations)** → Task 4 (ครบทั้ง 6 ฟังก์ชัน)
- **§6 spec (UI)** → Task 6 (LoanForm) + Task 7 (LoanDetail); `PaymentLogTable` ไม่แตะตาม spec
- **§7 spec (verification)** → Task 2/3/4 assertions + Task 8 regression sweep
- ชื่อฟังก์ชันตรงกันทุก task: `generateAmortizationSchedule`, `getPrincipalRemaining`, `dueInstallments`, `assumeOnSchedule`, `finalizeSchedule`, `stepDate`
